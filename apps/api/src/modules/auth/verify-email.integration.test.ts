
import mongoose from 'mongoose'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'

import { UserModel } from './user.model'
import { EmailOtpModel } from './email-otp.model'
import { hashEmailOtp } from './email-otp.service'
import { verifyOwnerEmail } from './verify-email.service'

import { SubscriptionPlanModel } from '../subscription/subscription-plan.model'
import { TenantSubscriptionModel } from '../subscription/tenant-subscription.model'

let replicaSet: MongoMemoryReplSet

const email = 'verify-integration@example.com'
const otp = '123456'
const replacementOtp = '654321'
const DAY_MS = 24 * 60 * 60 * 1000

beforeAll(async () => {
  process.env.OTP_SECRET =
    'booknest-test-otp-secret-at-least-32-characters'

  replicaSet = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
  })

  await mongoose.connect(replicaSet.getUri())

  await Promise.all([
    UserModel.init(),
    EmailOtpModel.init(),
    SubscriptionPlanModel.init(),
    TenantSubscriptionModel.init(),
  ])
}, 120_000)

afterAll(async () => {
  await mongoose.disconnect()
  if (replicaSet) {
    await replicaSet.stop()
  }
})

beforeEach(async () => {
  await Promise.all([
    EmailOtpModel.deleteMany({}),
    UserModel.deleteMany({}),
    TenantSubscriptionModel.deleteMany({}),
    SubscriptionPlanModel.deleteMany({}),
  ])
})

async function seedPendingOwner(
  planCode: 'FREE_TRIAL' | 'MONTHLY' = 'FREE_TRIAL',
) {
  const libraryId = new mongoose.Types.ObjectId()

  await SubscriptionPlanModel.create({
    code: 'FREE_TRIAL',
    name: 'Free Trial',
    durationDays: 30,
    pricePaise: 0,
    currency: 'INR',
    isActive: true,
    displayOrder: 1,
  })

  const user = await UserModel.create({
    fullName: 'Verification Test Owner',
    email,
    passwordHash: 'integration-test-placeholder',
    role: 'LIBRARY_OWNER',
    status: 'PENDING_VERIFICATION',
    libraryId,
    emailVerifiedAt: null,
  })

  const subscription = await TenantSubscriptionModel.create({
    libraryId,
    planCode,
    status: 'PENDING_EMAIL_VERIFICATION',
    pricePaise: planCode === 'FREE_TRIAL' ? 0 : 49900,
    currency: 'INR',
    startsAt: null,
    expiresAt: null,
    activatedAt: null,
  })

  await EmailOtpModel.create({
    userId: user._id,
    purpose: 'VERIFY_EMAIL',
    otpHash: hashEmailOtp(
      user._id.toString(),
      'VERIFY_EMAIL',
      otp,
    ),
    expiresAt: new Date(Date.now() + 5 * 60_000),
    attempts: 0,
    consumedAt: null,
  })

  return { user, subscription }
}

describe('Email verification transaction security', () => {
  it('allows exactly one of ten concurrent verifications', async () => {
    const { user, subscription } = await seedPendingOwner()

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        verifyOwnerEmail({ email, otp }),
      ),
    )

    const successful = results.filter(
      (result) => result.status === 'fulfilled',
    )

    expect(successful).toHaveLength(1)

    const updatedUser = await UserModel.findById(user._id)
    const updatedSubscription =
      await TenantSubscriptionModel.findById(subscription._id)

    const otpRecord = await EmailOtpModel.findOne({
      userId: user._id,
      purpose: 'VERIFY_EMAIL',
    })

    expect(updatedUser?.status).toBe('ACTIVE')
    expect(updatedUser?.emailVerifiedAt).toBeInstanceOf(Date)

    expect(updatedSubscription?.status).toBe('ACTIVE')
    expect(updatedSubscription?.startsAt).toBeInstanceOf(Date)
    expect(updatedSubscription?.activatedAt).toBeInstanceOf(Date)
    expect(otpRecord?.consumedAt).toBeInstanceOf(Date)

    const subscriptionCount =
      await TenantSubscriptionModel.countDocuments({
        libraryId: user.libraryId,
      })

    expect(subscriptionCount).toBe(1)
  })

  it('starts the 30-day trial once and does not extend it', async () => {
    const { subscription } = await seedPendingOwner()

    const result = await verifyOwnerEmail({ email, otp })

    expect(result.emailVerified).toBe(true)
    expect(result.subscriptionStatus).toBe('ACTIVE')
    expect(result.nextStep).toBe('LOGIN')

    const activated =
      await TenantSubscriptionModel.findById(subscription._id)

    expect(activated?.startsAt).toBeInstanceOf(Date)
    expect(activated?.expiresAt).toBeInstanceOf(Date)

    const originalStart = activated!.startsAt!.getTime()
    const originalExpiry = activated!.expiresAt!.getTime()

    expect(originalExpiry - originalStart).toBe(30 * DAY_MS)

    await expect(
      verifyOwnerEmail({ email, otp }),
    ).rejects.toThrow()

    const afterReuse =
      await TenantSubscriptionModel.findById(subscription._id)

    expect(afterReuse?.startsAt?.getTime()).toBe(originalStart)
    expect(afterReuse?.expiresAt?.getTime()).toBe(originalExpiry)
  })

  it('rejects an old OTP after it has been replaced', async () => {
    const { user, subscription } = await seedPendingOwner()

    // Simulate a successful resend replacing the stored OTP.
    await EmailOtpModel.updateOne(
      {
        userId: user._id,
        purpose: 'VERIFY_EMAIL',
      },
      {
        $set: {
          otpHash: hashEmailOtp(
            user._id.toString(),
            'VERIFY_EMAIL',
            replacementOtp,
          ),
          expiresAt: new Date(Date.now() + 5 * 60_000),
          attempts: 0,
          consumedAt: null,
          lastIssuedAt: new Date(),
        },
      },
    )

    await expect(
      verifyOwnerEmail({ email, otp }),
    ).rejects.toThrow()

    const pending =
      await TenantSubscriptionModel.findById(subscription._id)

    expect(pending?.status).toBe(
      'PENDING_EMAIL_VERIFICATION',
    )
    expect(pending?.startsAt).toBeNull()

    // The newly issued code must still work.
    const result = await verifyOwnerEmail({
      email,
      otp: replacementOtp,
    })

    expect(result.subscriptionStatus).toBe('ACTIVE')
  })

  it('requires payment for a paid plan instead of activating it', async () => {
    const { subscription } = await seedPendingOwner('MONTHLY')

    const result = await verifyOwnerEmail({ email, otp })

    expect(result.emailVerified).toBe(true)
    expect(result.subscriptionStatus).toBe('PENDING_PAYMENT')
    expect(result.nextStep).toBe('SUBMIT_PAYMENT')

    const updated =
      await TenantSubscriptionModel.findById(subscription._id)

    expect(updated?.status).toBe('PENDING_PAYMENT')
    expect(updated?.startsAt).toBeNull()
    expect(updated?.activatedAt).toBeNull()
  })
})
