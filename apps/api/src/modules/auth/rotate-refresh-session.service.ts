
import mongoose from 'mongoose'

import { RefreshSessionModel } from './refresh-session.model'
import { UserModel } from './user.model'
import { TenantSubscriptionModel } from '../subscription/tenant-subscription.model'

import {
    generateRefreshToken,
    hashRefreshToken,
    getRefreshTokenExpiry,
} from './refresh-token.service'

import { signAccessToken } from './access-token.service'
import { lockAuthSession } from './lock-auth-session.service'
export class RefreshSessionError extends Error {
    constructor() {
        super('Invalid or expired session')
        this.name = 'RefreshSessionError'
    }
}

export async function rotateRefreshSession(refreshToken: string) {
    if (
        typeof refreshToken !== 'string' ||
        !/^[A-Za-z0-9_-]{43}$/.test(refreshToken)
    ) {
        throw new RefreshSessionError()
    }

    const now = new Date()
    const oldTokenHash = hashRefreshToken(refreshToken)

    // tokenHash is select:false in the schema.
    const oldSession = await RefreshSessionModel.findOne({
        tokenHash: oldTokenHash,
    }).select('+tokenHash')

    if (!oldSession) {
        throw new RefreshSessionError()
    }

    // Reusing a rotated token is evidence of possible token theft.
    // Revoke the entire family, including its newest token.
    if (oldSession.revokedAt) {
        if (oldSession.revocationReason === 'ROTATED') {
            await mongoose.connection.transaction(async (session) => {
                await lockAuthSession(oldSession.userId, session)
                await RefreshSessionModel.updateMany(
                    {
                        familyId: oldSession.familyId,
                        revokedAt: null,
                    },
                    {
                        $set: {
                            revokedAt: now,
                            revocationReason: 'REUSE_DETECTED',
                        },
                    },
                    { session },
                )
            })
        }

        throw new RefreshSessionError()
    }

    if (oldSession.expiresAt <= now) {
        throw new RefreshSessionError()
    }

    // Validate current account and subscription state.
    // Do not trust stale role/tenant information from an old JWT.
    const user = await UserModel.findById(oldSession.userId)

    if (
        !user ||
        user.status !== 'ACTIVE' ||
        !user.emailVerifiedAt
    ) {
        throw new RefreshSessionError()
    }

    let subscriptionStatus: string | null = null
    let accessLevel: 'FULL' | 'PAYMENT_ONLY' | 'READ_ONLY' | null =
        null

    if (user.role !== 'PLATFORM_ADMIN') {
        if (!user.libraryId) {
            throw new RefreshSessionError()
        }

        const subscription = await TenantSubscriptionModel.findOne({
            libraryId: user.libraryId,
        }).sort({ createdAt: -1 })

        if (!subscription) {
            throw new RefreshSessionError()
        }

        subscriptionStatus = subscription.status

        switch (subscription.status) {
            case 'ACTIVE':
            case 'GRACE_PERIOD':
                accessLevel = 'FULL'
                break

            case 'PENDING_PAYMENT':
            case 'PAYMENT_UNDER_REVIEW':
                accessLevel = 'PAYMENT_ONLY'
                break

            case 'READ_ONLY':
            case 'EXPIRED':
                accessLevel = 'READ_ONLY'
                break

            default:
                throw new RefreshSessionError()
        }
    }

    const newRefreshToken = generateRefreshToken()
    const newTokenHash = hashRefreshToken(newRefreshToken)
    const newSessionId = new mongoose.Types.ObjectId()

    // Sign before changing the database, so signing failure
    // cannot consume the existing refresh token.
    const accessToken = await signAccessToken({
        userId: user._id.toString(),
        role: user.role,
        libraryId: user.libraryId?.toString() ?? null,
        sessionId: newSessionId.toString(),
    })

    // Atomically revoke the old token and insert its replacement.
    // Two concurrent refreshes cannot both succeed.
    await mongoose.connection.transaction(async (session) => {
        await lockAuthSession(oldSession.userId, session)

        const consumed = await RefreshSessionModel.updateOne(
            {
                _id: oldSession._id,
                revokedAt: null,
                expiresAt: { $gt: new Date() },
            },
            {
                $set: {
                    revokedAt: new Date(),
                    revocationReason: 'ROTATED',
                },
            },
            { session },
        )

        if (consumed.modifiedCount !== 1) {
            throw new RefreshSessionError()
        }

        await RefreshSessionModel.create(
            [
                {
                    _id: newSessionId,
                    userId: oldSession.userId,
                    familyId: oldSession.familyId,
                    tokenHash: newTokenHash,
                    expiresAt: getRefreshTokenExpiry(),
                    revokedAt: null,
                    revocationReason: null,
                },
            ],
            { session },
        )
    })

    return {
        accessToken,
        refreshToken: newRefreshToken,
        user: {
            userId: user._id.toString(),
            email: user.email,
            role: user.role,
            libraryId: user.libraryId?.toString() ?? null,
            subscriptionStatus,
            accessLevel,
        },
    }
}
