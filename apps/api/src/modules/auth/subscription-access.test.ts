
import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  getSubscriptionAccessLevel,
  hasSubscriptionPermission,
} from './subscription-access'

describe('Subscription access policy', () => {
  it.each([
    ['PENDING_PAYMENT', 'PAYMENT_ONLY'],
    ['PAYMENT_UNDER_REVIEW', 'PAYMENT_ONLY'],
    ['READ_ONLY', 'READ_ONLY'],
    ['EXPIRED', 'READ_ONLY'],
    ['PENDING_EMAIL_VERIFICATION', null],
    ['CANCELLED', null],
  ] as const)(
    'maps %s to %s',
    (status, expected) => {
      expect(
        getSubscriptionAccessLevel(status),
      ).toBe(expected)
    },
  )

  describe('Date-aware subscription authorization', () => {
    const now = new Date('2026-11-15T12:00:00.000Z')

    const yesterday = new Date('2026-11-14T12:00:00.000Z')
    const tomorrow = new Date('2026-11-16T12:00:00.000Z')

    it('allows an ACTIVE subscription before expiry', () => {
      expect(
        getSubscriptionAccessLevel(
          'ACTIVE',
          { startsAt: yesterday, expiresAt: tomorrow },
          now,
        ),
      ).toBe('FULL')
    })

    it('restricts an ACTIVE subscription after expiry', () => {
      expect(
        getSubscriptionAccessLevel(
          'ACTIVE',
          { startsAt: yesterday, expiresAt: yesterday },
          now,
        ),
      ).toBe('READ_ONLY')
    })

    it('restricts an ACTIVE subscription exactly at expiry', () => {
      expect(
        getSubscriptionAccessLevel(
          'ACTIVE',
          { expiresAt: now },
          now,
        ),
      ).toBe('READ_ONLY')
    })

    it('fails closed when ACTIVE has no expiry', () => {
      expect(
        getSubscriptionAccessLevel(
          'ACTIVE',
          { expiresAt: null },
          now,
        ),
      ).toBe('READ_ONLY')
    })

    it('does not activate a future subscription early', () => {
      expect(
        getSubscriptionAccessLevel(
          'ACTIVE',
          { startsAt: tomorrow, expiresAt: tomorrow },
          now,
        ),
      ).toBe('READ_ONLY')
    })

    it('allows GRACE_PERIOD before its deadline', () => {
      expect(
        getSubscriptionAccessLevel(
          'GRACE_PERIOD',
          { graceEndsAt: tomorrow },
          now,
        ),
      ).toBe('FULL')
    })

    it('restricts GRACE_PERIOD after its deadline', () => {
      expect(
        getSubscriptionAccessLevel(
          'GRACE_PERIOD',
          { graceEndsAt: yesterday },
          now,
        ),
      ).toBe('READ_ONLY')
    })

    it('restricts GRACE_PERIOD without a deadline', () => {
      expect(
        getSubscriptionAccessLevel(
          'GRACE_PERIOD',
          { graceEndsAt: null },
          now,
        ),
      ).toBe('READ_ONLY')
    })

    it('preserves payment-only access for pending payment', () => {
      expect(
        getSubscriptionAccessLevel(
          'PENDING_PAYMENT',
          undefined,
          now,
        ),
      ).toBe('PAYMENT_ONLY')
    })
  })

  it('allows full access to manage the library', () => {
    expect(
      hasSubscriptionPermission('FULL', 'MANAGE_LIBRARY'),
    ).toBe(true)
  })

  it('blocks payment-only users from library operations', () => {
    expect(
      hasSubscriptionPermission(
        'PAYMENT_ONLY',
        'MANAGE_LIBRARY',
      ),
    ).toBe(false)

    expect(
      hasSubscriptionPermission(
        'PAYMENT_ONLY',
        'VIEW_LIBRARY',
      ),
    ).toBe(false)
  })

  it('allows read-only users to view but not modify library data', () => {
    expect(
      hasSubscriptionPermission(
        'READ_ONLY',
        'VIEW_LIBRARY',
      ),
    ).toBe(true)

    expect(
      hasSubscriptionPermission(
        'READ_ONLY',
        'MANAGE_LIBRARY',
      ),
    ).toBe(false)
  })

  it('allows billing access at all recognized access levels', () => {
    for (const level of [
      'FULL',
      'PAYMENT_ONLY',
      'READ_ONLY',
    ] as const) {
      expect(
        hasSubscriptionPermission(
          level,
          'MANAGE_BILLING',
        ),
      ).toBe(true)
    }
  })
})
