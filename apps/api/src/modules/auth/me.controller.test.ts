
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import { meController } from './me.controller'
import { StaffPermissionsModel } from '../staff/staff-permissions.model'
import { PERMISSIONS } from '../staff/permissions'
import { TenantSubscriptionModel } from '../subscription/tenant-subscription.model'

vi.mock('../staff/staff-permissions.model', () => ({
  StaffPermissionsModel: { findOne: vi.fn() },
}))
vi.mock('../subscription/tenant-subscription.model', () => ({
  TenantSubscriptionModel: { findOne: vi.fn() },
}))

const findOne = vi.mocked(StaffPermissionsModel.findOne)
const findSubscription = vi.mocked(TenantSubscriptionModel.findOne)

const userId = '507f1f77bcf86cd799439011'
const libraryId = '507f191e810c19729de860ea'

function invoke(role: string, tenant: string | null = libraryId) {
  const req = {} as Request
  const json = vi.fn()
  const status = vi.fn().mockReturnValue({ json })

  const res = {
    locals: {
      auth: {
        userId,
        libraryId: tenant,
        role,
        sessionId: 'session',
      },
    },
    status,
  } as unknown as Response

  const next = vi.fn() as NextFunction

  return { req, res, json, status, next }
}

beforeEach(() => {
  vi.clearAllMocks()
  findSubscription.mockReturnValue({
    sort: vi.fn().mockResolvedValue(null),
  } as never)
})

describe('GET /auth/me effective permissions', () => {
  it('returns all registered permissions for a library owner', async () => {
    const t = invoke('LIBRARY_OWNER')

    await meController(t.req, t.res, t.next)

    expect(t.json).toHaveBeenCalledWith({
      success: true,
      data: {
        userId,
        role: 'LIBRARY_OWNER',
        libraryId,
        permissions: [...PERMISSIONS],
        subscriptionStatus: null,
        accessLevel: null,
      },
    })

    expect(findOne).not.toHaveBeenCalled()
    expect(findSubscription).toHaveBeenCalledWith({ libraryId })
    expect(t.next).not.toHaveBeenCalled()
  })

  it('reports the current subscription status and access separately', async () => {
    const expiresAt = new Date(Date.now() + 60_000)
    const sort = vi.fn().mockResolvedValue({
      status: 'ACTIVE',
      startsAt: null,
      expiresAt,
      graceEndsAt: null,
    })
    findSubscription.mockReturnValue({ sort } as never)

    const t = invoke('LIBRARY_OWNER')

    await meController(t.req, t.res, t.next)

    expect(findSubscription).toHaveBeenCalledWith({ libraryId })
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 })
    expect(t.json.mock.calls[0][0].data).toMatchObject({
      permissions: [...PERMISSIONS],
      subscriptionStatus: 'ACTIVE',
      accessLevel: 'FULL',
    })
  })

  it('reports read-only access for an expired ACTIVE subscription', async () => {
    const sort = vi.fn().mockResolvedValue({
      status: 'ACTIVE',
      startsAt: null,
      expiresAt: new Date(Date.now() - 60_000),
      graceEndsAt: null,
    })
    findSubscription.mockReturnValue({ sort } as never)

    const t = invoke('LIBRARY_OWNER')

    await meController(t.req, t.res, t.next)

    expect(t.json.mock.calls[0][0].data).toMatchObject({
      permissions: [...PERMISSIONS],
      subscriptionStatus: 'ACTIVE',
      accessLevel: 'READ_ONLY',
    })
  })

  it('returns current librarian permissions scoped to the library', async () => {
    const select = vi.fn().mockResolvedValue({
      permissions: ['students.read', 'reports.read'],
    })

    findOne.mockReturnValue({ select } as never)

    const t = invoke('LIBRARIAN')

    await meController(t.req, t.res, t.next)

    expect(findOne).toHaveBeenCalledWith({
      userId,
      libraryId,
    })

    expect(t.json).toHaveBeenCalledWith({
      success: true,
      data: {
        userId,
        role: 'LIBRARIAN',
        libraryId,
        permissions: ['students.read', 'reports.read'],
        subscriptionStatus: null,
        accessLevel: null,
      },
    })
  })

  it('grants no permissions when a librarian record is missing', async () => {
    findOne.mockReturnValue({
      select: vi.fn().mockResolvedValue(null),
    } as never)

    const t = invoke('LIBRARIAN')

    await meController(t.req, t.res, t.next)

    expect(t.json.mock.calls[0][0].data.permissions).toEqual([])
    expect(t.json.mock.calls[0][0].data.subscriptionStatus).toBeNull()
    expect(t.json.mock.calls[0][0].data.accessLevel).toBeNull()
  })

  it('grants no tenant permissions to platform administrators', async () => {
    const t = invoke('PLATFORM_ADMIN', null)

    await meController(t.req, t.res, t.next)

    expect(t.json.mock.calls[0][0].data.permissions).toEqual([])
    expect(findOne).not.toHaveBeenCalled()
    expect(findSubscription).not.toHaveBeenCalled()
  })

  it('forwards database errors to Express', async () => {
    const failure = new Error('Database unavailable')

    findOne.mockReturnValue({
      select: vi.fn().mockRejectedValue(failure),
    } as never)

    const t = invoke('LIBRARIAN')

    await meController(t.req, t.res, t.next)

    expect(t.next).toHaveBeenCalledWith(failure)
    expect(t.json).not.toHaveBeenCalled()
  })
})
