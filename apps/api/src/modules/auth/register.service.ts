
import { recordEmailDeliveryFailure } from './email-delivery-failure.service'

import mongoose from 'mongoose'

import { UserModel } from './user.model'
import { hashPassword } from './password.service'
import type { RegisterOwnerInput } from './register.schema'

import { LibraryModel } from '../library/library.model'
import { sendVerificationOtpEmail } from '../email/email.service'

import {
  SubscriptionPlanModel,
  type SubscriptionPlan,
} from '../subscription/subscription-plan.model'

import {
  TenantSubscriptionModel,
  type TenantSubscription,
} from '../subscription/tenant-subscription.model'

import { EmailOtpModel } from './email-otp.model'

import {
  generateEmailOtp,
  hashEmailOtp,
  getEmailOtpExpiry,
} from './email-otp.service'

export class RegistrationError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message)
    this.name = 'RegistrationError'
  }
}

export async function registerOwner(
  input: RegisterOwnerInput,
) {
  // Only use this service with validated Zod input.
  const existingUser = await UserModel.exists({
    email: input.owner.email,
  })

  if (existingUser) {
    throw new RegistrationError(
      409,
      'An account with this email already exists',
    )
  }

  const plan = (await SubscriptionPlanModel.findOne({
    code: input.planCode,
    isActive: true,
  }).lean()) as SubscriptionPlan | null

  if (!plan || Array.isArray(plan)) {
    throw new RegistrationError(
      400,
      'Selected subscription plan is unavailable',
    )
  }

  if (
    !Number.isSafeInteger(plan.pricePaise) ||
    plan.pricePaise < 0
  ) {
    throw new RegistrationError(
      500,
      'Subscription plan has invalid pricing',
    )
  }

  // Password hashing is intentionally outside the transaction.
  const passwordHash = await hashPassword(input.owner.password)

  const otp = generateEmailOtp()
  try {
   const result = await mongoose.connection.transaction(async (session) => {
      const owners = await UserModel.create(
        [
          {
            fullName: input.owner.fullName,
            email: input.owner.email,
            passwordHash,
            role: 'LIBRARY_OWNER',
            status: 'PENDING_VERIFICATION',
            libraryId: null,
          },
        ],
        { session },
      )
      const owner = owners[0]

      const libraries = await LibraryModel.create(
        [
          {
            name: input.library.name,
            ownerId: owner._id,
            contactEmail: input.library.contactEmail,
            contactPhone: input.library.contactPhone,
            city: input.library.city,
            state: input.library.state,
            status: 'PENDING_SETUP',
            isPublished: false,
          },
        ],
        { session },
      )
      const library = libraries[0]

      await UserModel.updateOne(
        { _id: owner._id },
        { $set: { libraryId: library._id } },
        { session },
      )

      const subscriptions = await TenantSubscriptionModel.create(
        [
          {
            libraryId: library._id,
            planCode: plan.code,
            pricePaise: plan.pricePaise,
            currency: plan.currency,
            status: 'PENDING_EMAIL_VERIFICATION',
            startsAt: null,
            expiresAt: null,
            graceEndsAt: null,
          },
        ],
        { session },
      )
      const subscription = subscriptions[0] as TenantSubscription & {
        _id: mongoose.Types.ObjectId
      }
      await EmailOtpModel.create(
  [
    {
      userId: owner._id,
      purpose: 'VERIFY_EMAIL',
      otpHash: hashEmailOtp(
        owner._id.toString(),
        'VERIFY_EMAIL',
        otp,
      ),
      expiresAt: getEmailOtpExpiry(),
      attempts: 0,
      consumedAt: null,
    },
  ],
  { session },
)
      return {
        ownerId: owner._id.toString(),
        libraryId: library._id.toString(),
        subscriptionId: subscription._id.toString(),
        email: owner.email,
        planCode: subscription.planCode,
        subscriptionStatus: subscription.status,
        nextStep: 'VERIFY_EMAIL' as const,
      }
    })

    try {
  await sendVerificationOtpEmail(result.email, otp)
} catch {
  await recordEmailDeliveryFailure(
    new mongoose.Types.ObjectId(result.ownerId),
    'VERIFICATION',
  )

  // The account and OTP are already saved.
  // Do not attempt to register the owner again.
  // A resend workflow will be added next.
}

return result
  } catch (error) {
    // The unique email index protects against concurrent registrations.
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 11000
    ) {
      throw new RegistrationError(
        409,
        'An account with this email already exists',
      )
    }

    throw error
  }
}
