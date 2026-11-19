
import mongoose from 'mongoose'

import { UserModel } from './user.model'
import { EmailOtpModel } from './email-otp.model'

import { verifyEmailOtpHash } from './email-otp.service'

import {
    TenantSubscriptionModel,
} from '../subscription/tenant-subscription.model'

import {
    SubscriptionPlanModel,
} from '../subscription/subscription-plan.model'

import type { VerifyEmailInput } from './verify-email.schema'

export class EmailVerificationError extends Error {
    constructor(
        public readonly statusCode: number,
        message: string,
    ) {
        super(message)
        this.name = 'EmailVerificationError'
    }
}

function addCalendarMonths(date: Date, months: number): Date {
    const result = new Date(date)
    const originalDay = result.getUTCDate()

    result.setUTCDate(1)
    result.setUTCMonth(result.getUTCMonth() + months)

    const lastDay = new Date(
        Date.UTC(
            result.getUTCFullYear(),
            result.getUTCMonth() + 1,
            0,
        ),
    ).getUTCDate()

    result.setUTCDate(Math.min(originalDay, lastDay))

    return result
}

export async function verifyOwnerEmail(
    input: VerifyEmailInput,
) {
    const user = await UserModel.findOne({
        email: input.email,
        role: 'LIBRARY_OWNER',
    })

    if (!user) {
        throw new EmailVerificationError(
            400,
            'Invalid or expired verification code',
        )
    }

    if (user.emailVerifiedAt) {
        throw new EmailVerificationError(
            409,
            'Email is already verified',
        )
    }

    const otpRecord = await EmailOtpModel.findOne({
        userId: user._id,
        purpose: 'VERIFY_EMAIL',
    }).select('+otpHash')

    if (
        !otpRecord ||
        otpRecord.consumedAt ||
        otpRecord.expiresAt.getTime() <= Date.now() ||
        otpRecord.attempts >= 5
    ) {
        throw new EmailVerificationError(
            400,
            'Invalid or expired verification code',
        )
    }

    const isValid = verifyEmailOtpHash(
        user._id.toString(),
        'VERIFY_EMAIL',
        input.otp,
        otpRecord.otpHash,
    )

    if (!isValid) {
        await EmailOtpModel.updateOne(
            {
                _id: otpRecord._id,
                otpHash: otpRecord.otpHash,
                consumedAt: null,
                expiresAt: { $gt: new Date() },
                attempts: { $lt: 5 },
            },
            { $inc: { attempts: 1 } },
        )

        throw new EmailVerificationError(
            400,
            'Invalid or expired verification code',
        )
    }

    const result = await mongoose.connection.transaction(
        async (session) => {
            const now = new Date()

            const consumed = await EmailOtpModel.updateOne(
                {
                    _id: otpRecord._id,
                    otpHash: otpRecord.otpHash,
                    consumedAt: null,
                    expiresAt: { $gt: now },
                    attempts: { $lt: 5 },
                },
                { $set: { consumedAt: now } },
                { session },
            )

            if (consumed.modifiedCount !== 1) {
                throw new EmailVerificationError(
                    400,
                    'Invalid or expired verification code',
                )
            }

            const updatedUser = await UserModel.updateOne(
                {
                    _id: user._id,
                    emailVerifiedAt: null,
                    status: 'PENDING_VERIFICATION',
                },
                {
                    $set: {
                        emailVerifiedAt: now,
                        status: 'ACTIVE',
                    },
                },
                { session },
            )

            if (updatedUser.modifiedCount !== 1) {
                throw new EmailVerificationError(
                    409,
                    'Email verification state changed',
                )
            }

            if (!user.libraryId) {
                throw new Error('Owner has no library')
            }

            const subscription =
                await TenantSubscriptionModel.findOne({
                    libraryId: user.libraryId,
                    status: 'PENDING_EMAIL_VERIFICATION',
                }).session(session)

            if (!subscription) {
                throw new Error('Pending subscription not found')
            }

            if (subscription.planCode === 'FREE_TRIAL') {
                const plan = await SubscriptionPlanModel.findOne({
                    code: 'FREE_TRIAL',
                }).session(session)

                if (!plan || !plan.durationDays) {
                    throw new Error('Free trial plan is not configured')
                }

                const expiresAt = new Date(
                    now.getTime() +
                    plan.durationDays * 24 * 60 * 60 * 1000,
                )

                subscription.status = 'ACTIVE'
                subscription.startsAt = now
                subscription.expiresAt = expiresAt
                subscription.graceEndsAt = new Date(
                    expiresAt.getTime() + 7 * 24 * 60 * 60 * 1000,
                )
                subscription.activatedAt = now
            } else {
                subscription.status = 'PENDING_PAYMENT'
            }

            await subscription.save({ session })

            return {
                emailVerified: true,
                subscriptionStatus: subscription.status,
                nextStep:
                    subscription.status === 'ACTIVE'
                        ? 'LOGIN'
                        : 'SUBMIT_PAYMENT',
            }
        },
    )

    return result
}
