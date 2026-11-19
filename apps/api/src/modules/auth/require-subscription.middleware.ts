
import type {
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from 'express'

import mongoose from 'mongoose'

import { TenantSubscriptionModel } from '../subscription/tenant-subscription.model'

import {
  getSubscriptionAccessLevel,
  hasSubscriptionPermission,
  type SubscriptionPermission,
} from './subscription-access'

import type {
  AccessTokenPayload,
} from './access-token.service'

export function requireSubscription(
  permission: SubscriptionPermission,
): RequestHandler {
  return async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const auth = res.locals.auth as
      | AccessTokenPayload
      | undefined

    if (!auth) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
      })
      return
    }

    // Platform administration has separate authorization.
    if (auth.role === 'PLATFORM_ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Subscription access denied',
      })
      return
    }

    if (
      !auth.libraryId ||
      !mongoose.isObjectIdOrHexString(auth.libraryId)
    ) {
      res.status(403).json({
        success: false,
        message: 'Library assignment required',
      })
      return
    }

    try {
      const subscription =
        await TenantSubscriptionModel.findOne({
          libraryId: auth.libraryId,
        })
          .sort({ createdAt: -1 })

      if (!subscription) {
        res.status(403).json({
          success: false,
          message: 'No active subscription record',
        })
        return
      }

      const accessLevel = getSubscriptionAccessLevel(
        subscription.status,
        {
          startsAt: subscription.startsAt,
          expiresAt: subscription.expiresAt,
          graceEndsAt: subscription.graceEndsAt,
        },
        new Date(),
      )

      if (
        !accessLevel ||
        !hasSubscriptionPermission(accessLevel, permission)
      ) {
        res.status(403).json({
          success: false,
          message: 'Subscription does not permit this action',
        })
        return
      }

      res.locals.subscription = {
        id: subscription._id.toString(),
        status: subscription.status,
        accessLevel,
      }

      next()
    } catch (error) {
      next(error)
    }
  }
}
