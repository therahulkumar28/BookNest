import type {
  Request,
  Response,
  NextFunction,
} from 'express'
import mongoose from 'mongoose'

import {
  verifyAccessToken,
  type AccessTokenPayload,
} from './access-token.service'

import { RefreshSessionModel } from './refresh-session.model'
import { UserModel } from './user.model'

export interface AuthenticatedUser extends AccessTokenPayload {}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authorization = req.headers.authorization

  if (
    !authorization ||
    !authorization.startsWith('Bearer ')
  ) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
    })
    return
  }

  const token = authorization.slice(7).trim()

  if (!token) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
    })
    return
  }

  try {
    const payload = await verifyAccessToken(token)

    if (
      !mongoose.isValidObjectId(payload.userId) ||
      !mongoose.isValidObjectId(payload.sessionId)
    ) {
      res.status(401).json({
        success: false,
        message: 'Invalid or expired session',
      })
      return
    }

    const now = new Date()

    const [session, user] = await Promise.all([
      RefreshSessionModel.findOne({
        _id: payload.sessionId,
        userId: payload.userId,
        revokedAt: null,
        expiresAt: { $gt: now },
      }),

      UserModel.findById(payload.userId),
    ])

    if (
      !session ||
      !user ||
      user.status !== 'ACTIVE' ||
      !user.emailVerifiedAt
    ) {
      res.status(401).json({
        success: false,
        message: 'Invalid or expired session',
      })
      return
    }

    // Reject JWTs whose identity or tenant claims are stale.
    // Roles and library assignments must match the database.
    if (
      user.role !== payload.role ||
      (user.libraryId?.toString() ?? null) !==
        payload.libraryId
    ) {
      res.status(401).json({
        success: false,
        message: 'Invalid or expired session',
      })
      return
    }

    res.locals.auth = payload

    next()
  } catch (error) {
    // JWT verification errors are authentication failures.
    // Unexpected database errors must not be hidden as 401s.
    if (
      error instanceof Error &&
      (
        error.name === 'JWTExpired' ||
        error.name === 'JWTInvalid' ||
        error.name === 'JWSSignatureVerificationFailed' ||
        error.name === 'JWTClaimValidationFailed' ||
        error.name === 'JWSInvalid'
      )
    ) {
      res.status(401).json({
        success: false,
        message: 'Invalid or expired session',
      })
      return
    }

    next(error)
  }
}
