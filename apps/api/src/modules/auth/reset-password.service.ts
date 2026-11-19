import { writeAuthAudit } from './auth-audit.service'

import mongoose from 'mongoose'
import { UserModel } from './user.model'
import { EmailOtpModel } from './email-otp.model'
import { hashPassword } from './password.service'
import { verifyEmailOtpHash } from './email-otp.service'
import type { ResetPasswordInput } from './reset-password.schema'
import { RefreshSessionModel } from './refresh-session.model'
import { lockAuthSession } from './lock-auth-session.service'
export class PasswordResetError extends Error {
    constructor(
        public readonly statusCode: number,
        message: string,
    ) {
        super(message)
        this.name = 'PasswordResetError'
    }
}

export async function resetPassword(
    input: ResetPasswordInput,
): Promise<void> {
    const user = await UserModel.findOne({
        email: input.email,
        emailVerifiedAt: { $ne: null },
        status: 'ACTIVE',
    })

    if (!user) {
        throw new PasswordResetError(
            400,
            'Invalid or expired reset code',
        )
    }

    const otpRecord = await EmailOtpModel.findOne({
        userId: user._id,
        purpose: 'RESET_PASSWORD',
    }).select('+otpHash')

    if (
        !otpRecord ||
        otpRecord.consumedAt ||
        otpRecord.expiresAt.getTime() <= Date.now() ||
        otpRecord.attempts >= 5
    ) {
        throw new PasswordResetError(
            400,
            'Invalid or expired reset code',
        )
    }

    const isValid = verifyEmailOtpHash(
        user._id.toString(),
        'RESET_PASSWORD',
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

        throw new PasswordResetError(
            400,
            'Invalid or expired reset code',
        )
    }

    // Hash outside the transaction to keep it short.
    const passwordHash = await hashPassword(input.newPassword)

    await mongoose.connection.transaction(async (session) => {
        await lockAuthSession(user._id, session)

        const now = new Date()

        const consumed = await EmailOtpModel.updateOne(
            {
                _id: otpRecord._id,
                consumedAt: null,
                expiresAt: { $gt: now },
                attempts: { $lt: 5 },
                otpHash: otpRecord.otpHash,
            },
            { $set: { consumedAt: now } },
            { session },
        )

        if (consumed.modifiedCount !== 1) {
            throw new PasswordResetError(
                400,
                'Invalid or expired reset code',
            )
        }

        const updated = await UserModel.updateOne(
            {
                _id: user._id,
                status: 'ACTIVE',
                emailVerifiedAt: { $ne: null },

            },
            { $set: { passwordHash } },
            { session },
        )

        if (updated.modifiedCount !== 1) {
            throw new PasswordResetError(
                400,
                'Unable to reset password',
            )
        }
        // Revoke every active login session after password reset.
        // This operation participates in the same MongoDB transaction.
        await RefreshSessionModel.updateMany(
            {
                userId: user._id,
                revokedAt: null,
            },
            {
                $set: {
                    revokedAt: now,
                    revocationReason: 'PASSWORD_RESET',
                },
            },
            { session },
        )

        await writeAuthAudit({ action: 'PASSWORD_RESET_COMPLETED', userId: user._id }, session)
    })
}
