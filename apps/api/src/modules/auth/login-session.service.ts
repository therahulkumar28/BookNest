
import mongoose from 'mongoose'

import { validateLogin } from './login.service'
import { RefreshSessionModel } from './refresh-session.model'

import {
    generateRefreshToken,
    hashRefreshToken,
    getRefreshTokenExpiry,
} from './refresh-token.service'

import { signAccessToken } from './access-token.service'

import type { LoginInput } from './login.schema'

export async function createLoginSession(input: LoginInput) {
    const account = await validateLogin(input)

    const refreshToken = generateRefreshToken()
    const tokenHash = hashRefreshToken(refreshToken)

    const familyId = new mongoose.Types.ObjectId()

    const session = await RefreshSessionModel.create({
        userId: new mongoose.Types.ObjectId(account.userId),
        familyId,
        tokenHash,
        expiresAt: getRefreshTokenExpiry(),
        revokedAt: null,
    })

    try {
        const accessToken = await signAccessToken({
            userId: account.userId,
            role: account.role,
            libraryId: account.libraryId,
            sessionId: session._id.toString(),
        })

        return {
            accessToken,
            refreshToken,
            user: {
                userId: account.userId,
                email: account.email,
                role: account.role,
                libraryId: account.libraryId,
                subscriptionStatus: account.subscriptionStatus,
                accessLevel: account.accessLevel,
            },
        }
    } catch (error) {
        // Avoid leaving a usable refresh session if signing fails.
        await RefreshSessionModel.updateOne(
            { _id: session._id },
            {
                $set: {
                    revokedAt: new Date(),
                    revocationReason: 'ACCOUNT_DISABLED',
                },
            },
        )

        throw error
    }
}
