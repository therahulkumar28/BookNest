
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
import { RefreshSessionModel } from './refresh-session.model'
import { resetPassword } from './reset-password.service'

import {
  hashPassword,
  verifyPassword,
} from './password.service'

import {
  hashEmailOtp,
  getEmailOtpExpiry,
} from './email-otp.service'

let replicaSet: MongoMemoryReplSet

const email = 'reset-integration@example.com'
const oldPassword = 'OldPassword2026!'
const newPassword = 'NewPassword2026!'
const otp = '123456'

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
    RefreshSessionModel.init(),
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
    RefreshSessionModel.deleteMany({}),
    EmailOtpModel.deleteMany({}),
    UserModel.deleteMany({}),
  ])
})

async function seedPasswordReset() {
  const user = await UserModel.create({
    fullName: 'Reset Test Owner',
    email,
    passwordHash: await hashPassword(oldPassword),
    role: 'LIBRARY_OWNER',
    status: 'ACTIVE',
    emailVerifiedAt: new Date(),
  })

  const otpRecord = await EmailOtpModel.create({
    userId: user._id,
    purpose: 'RESET_PASSWORD',
    otpHash: hashEmailOtp(
      user._id.toString(),
      'RESET_PASSWORD',
      otp,
    ),
    expiresAt: getEmailOtpExpiry(),
    attempts: 0,
    consumedAt: null,
  })

  const familyId = new mongoose.Types.ObjectId()

  await RefreshSessionModel.create([
    {
      userId: user._id,
      familyId,
      tokenHash: 'a'.repeat(64),
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: null,
    },
    {
      userId: user._id,
      familyId,
      tokenHash: 'b'.repeat(64),
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: null,
    },
  ])

  return { user, otpRecord }
}

async function getStoredPasswordHash(userId: mongoose.Types.ObjectId) {
  const user = await UserModel.findById(userId)
    .select('+passwordHash')

  if (!user) throw new Error('Test user missing')

  return user.passwordHash
}

describe('Password reset transaction security', () => {
  it('changes password and revokes all sessions', async () => {
    const { user } = await seedPasswordReset()

    await resetPassword({
      email,
      otp,
      newPassword,
    })

    const storedHash = await getStoredPasswordHash(user._id)

    expect(
      await verifyPassword(newPassword, storedHash),
    ).toBe(true)

    expect(
      await verifyPassword(oldPassword, storedHash),
    ).toBe(false)

    const activeSessions =
      await RefreshSessionModel.countDocuments({
        userId: user._id,
        revokedAt: null,
      })

    expect(activeSessions).toBe(0)

    const revokedSessions =
      await RefreshSessionModel.countDocuments({
        userId: user._id,
        revokedAt: { $ne: null },
      })

    expect(revokedSessions).toBe(2)
  })

  it('allows only one concurrent password reset', async () => {
    const { user } = await seedPasswordReset()

    const firstPassword = 'ConcurrentPasswordOne2026!'
    const secondPassword = 'ConcurrentPasswordTwo2026!'

    const results = await Promise.allSettled([
      resetPassword({
        email,
        otp,
        newPassword: firstPassword,
      }),
      resetPassword({
        email,
        otp,
        newPassword: secondPassword,
      }),
    ])

    const successful = results.filter(
      (result) => result.status === 'fulfilled',
    )

    const failed = results.filter(
      (result) => result.status === 'rejected',
    )

    // The same OTP must never authorize two password changes.
    expect(successful).toHaveLength(1)
    expect(failed).toHaveLength(1)

    const storedHash = await getStoredPasswordHash(user._id)

    const matchesFirst = await verifyPassword(
      firstPassword,
      storedHash,
    )

    const matchesSecond = await verifyPassword(
      secondPassword,
      storedHash,
    )

    // Exactly one requested password must become active.
    expect(Number(matchesFirst) + Number(matchesSecond)).toBe(1)

    const otpRecord = await EmailOtpModel.findOne({
      userId: user._id,
      purpose: 'RESET_PASSWORD',
    })

    expect(otpRecord?.consumedAt).not.toBeNull()
    expect(otpRecord?.consumedAt).toBeDefined()

    // All sessions must remain revoked.
    const activeSessions =
      await RefreshSessionModel.countDocuments({
        userId: user._id,
        revokedAt: null,
      })

    expect(activeSessions).toBe(0)
  })

  it('rejects reuse of an already consumed OTP', async () => {
    const { user } = await seedPasswordReset()

    await resetPassword({
      email,
      otp,
      newPassword,
    })

    await expect(
      resetPassword({
        email,
        otp,
        newPassword: 'AnotherPassword2026!',
      }),
    ).rejects.toThrow()

    const storedHash = await getStoredPasswordHash(user._id)

    expect(
      await verifyPassword(newPassword, storedHash),
    ).toBe(true)

    expect(
      await verifyPassword(
        'AnotherPassword2026!',
        storedHash,
      ),
    ).toBe(false)
  })

  it('does not change password or revoke sessions for an invalid OTP', async () => {
    const { user } = await seedPasswordReset()

    await expect(
      resetPassword({
        email,
        otp: '999999',
        newPassword,
      }),
    ).rejects.toThrow()

    const storedHash = await getStoredPasswordHash(user._id)

    expect(
      await verifyPassword(oldPassword, storedHash),
    ).toBe(true)

    const activeSessions =
      await RefreshSessionModel.countDocuments({
        userId: user._id,
        revokedAt: null,
      })

    expect(activeSessions).toBe(2)
  })
})
