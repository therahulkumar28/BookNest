
import type {
  Request,
  Response,
  NextFunction,
} from 'express'

import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { requireRole } from './require-role.middleware'
import type { AccessTokenRole } from './access-token.service'

function invokeRoleGuard(
  allowedRoles: AccessTokenRole[],
  currentRole?: AccessTokenRole,
) {
  let statusCode = 200
  let responseBody: unknown

  const next = vi.fn() as NextFunction

  const req = {} as Request

  const res = {
    locals: currentRole
      ? {
          auth: {
            userId: 'test-user',
            sessionId: 'test-session',
            libraryId: 'test-library',
            role: currentRole,
          },
        }
      : {},
    status(code: number) {
      statusCode = code
      return this
    },
    json(body: unknown) {
      responseBody = body
      return this
    },
  } as unknown as Response

  requireRole(...allowedRoles)(req, res, next)

  return {
    statusCode,
    responseBody,
    nextCalled: next.mock.calls.length > 0,
  }
}

describe('Role authorization middleware', () => {
  it('allows a platform administrator on admin routes', () => {
    const result = invokeRoleGuard(
      ['PLATFORM_ADMIN'],
      'PLATFORM_ADMIN',
    )

    expect(result.nextCalled).toBe(true)
  })

  it('rejects a library owner on admin routes', () => {
    const result = invokeRoleGuard(
      ['PLATFORM_ADMIN'],
      'LIBRARY_OWNER',
    )

    expect(result.statusCode).toBe(403)
    expect(result.nextCalled).toBe(false)
  })

  it('allows owners and librarians on shared routes', () => {
    for (const role of [
      'LIBRARY_OWNER',
      'LIBRARIAN',
    ] as const) {
      const result = invokeRoleGuard(
        ['LIBRARY_OWNER', 'LIBRARIAN'],
        role,
      )

      expect(result.nextCalled).toBe(true)
    }
  })

  it('rejects librarians on owner-only routes', () => {
    const result = invokeRoleGuard(
      ['LIBRARY_OWNER'],
      'LIBRARIAN',
    )

    expect(result.statusCode).toBe(403)
  })

  it('rejects requests without authentication context', () => {
    const result = invokeRoleGuard(['LIBRARY_OWNER'])

    expect(result.statusCode).toBe(401)
    expect(result.nextCalled).toBe(false)
  })

  it('rejects a role guard with no allowed roles', () => {
    expect(() => requireRole()).toThrow(
      'requireRole must specify at least one allowed role',
    )
  })
})
