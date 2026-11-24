
import type { Request, Response, NextFunction } from 'express'
import { getAuthenticatedUser } from './auth-context'
import { StaffPermissionsModel } from '../staff/staff-permissions.model'
import { PERMISSIONS, type Permission } from '../staff/permissions'
import { TenantSubscriptionModel } from '../subscription/tenant-subscription.model'
import {
  getSubscriptionAccessLevel,
  type SubscriptionAccessLevel,
} from './subscription-access'

/** Return current role permissions and subscription access, not JWT snapshots. */
export async function meController(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = getAuthenticatedUser(res)
    let permissions: Permission[] = []
    let subscriptionStatus: string | null = null
    let accessLevel: SubscriptionAccessLevel | null = null

    if (auth.role === 'LIBRARY_OWNER' && auth.libraryId) {
      permissions = [...PERMISSIONS]
    } else if (auth.role === 'LIBRARIAN' && auth.libraryId) {
      const record = await StaffPermissionsModel.findOne({
        userId: auth.userId,
        libraryId: auth.libraryId,
      })
        .select('permissions')

      // Missing records grant no permissions.
      const granted = new Set(record?.permissions ?? [])

      permissions = PERMISSIONS.filter((permission) =>
        granted.has(permission),
      )
    }

    if (auth.libraryId) {
      const subscription =
        await TenantSubscriptionModel.findOne({
          libraryId: auth.libraryId,
        }).sort({ createdAt: -1 })

      if (subscription) {
        subscriptionStatus = subscription.status
        accessLevel = getSubscriptionAccessLevel(
          subscription.status,
          {
            startsAt: subscription.startsAt,
            expiresAt: subscription.expiresAt,
            graceEndsAt: subscription.graceEndsAt,
          },
        )
      }
    }

    res.status(200).json({
      success: true,
      data: {
        userId: auth.userId,
        role: auth.role,
        libraryId: auth.libraryId,
        permissions,
        subscriptionStatus,
        accessLevel,
      },
    })
  } catch (error) {
    next(error)
  }
}
