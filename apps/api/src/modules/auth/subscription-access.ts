
export const SUBSCRIPTION_ACCESS_LEVELS = [
  'FULL',
  'PAYMENT_ONLY',
  'READ_ONLY',
] as const

export type SubscriptionAccessLevel =
  (typeof SUBSCRIPTION_ACCESS_LEVELS)[number]

export type SubscriptionPermission =
  | 'MANAGE_LIBRARY'
  | 'VIEW_LIBRARY'
  | 'MANAGE_BILLING'

export function getSubscriptionAccessLevel(
  status: string,
  dates?: {
    startsAt?: Date | null
    expiresAt?: Date | null
    graceEndsAt?: Date | null
  },
  now = new Date(),
): SubscriptionAccessLevel | null {
  switch (status) {
    case 'ACTIVE': {
      if (!dates?.expiresAt) return 'READ_ONLY'

      if (
        dates.startsAt &&
        dates.startsAt.getTime() > now.getTime()
      ) {
        return 'READ_ONLY'
      }

      return dates.expiresAt.getTime() > now.getTime()
        ? 'FULL'
        : 'READ_ONLY'
    }

    case 'GRACE_PERIOD': {
      if (!dates?.graceEndsAt) return 'READ_ONLY'

      return dates.graceEndsAt.getTime() > now.getTime()
        ? 'FULL'
        : 'READ_ONLY'
    }

    case 'PENDING_PAYMENT':
    case 'PAYMENT_UNDER_REVIEW':
      return 'PAYMENT_ONLY'

    case 'READ_ONLY':
    case 'EXPIRED':
      return 'READ_ONLY'

    default:
      return null
  }
}

export function hasSubscriptionPermission(
  level: SubscriptionAccessLevel,
  permission: SubscriptionPermission,
): boolean {
  switch (permission) {
    case 'MANAGE_LIBRARY':
      return level === 'FULL'

    case 'VIEW_LIBRARY':
      return level === 'FULL' || level === 'READ_ONLY'

    case 'MANAGE_BILLING':
      return true
  }
}
