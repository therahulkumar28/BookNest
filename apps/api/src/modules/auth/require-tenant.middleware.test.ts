
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

import { requireTenant } from './require-tenant.middleware'
import type { AccessTokenPayload } from './access-token.service'

const libraryA = '507f191e810c19729de860ea'
const libraryB = '507f191e810c19729de860eb'

function invokeTenantGuard(
  auth: AccessTokenPayload | undefined,
  requestedLibraryId: string | undefined,
) {
  let statusCode = 200
  let responseBody: unknown

  const next = vi.fn() as NextFunction

  const req = {
    params: requestedLibraryId
      ? { libraryId: requestedLibraryId }
      : {},
  } as unknown as Request

  const res = {
    locals: auth ? { auth } : {},
    status(code: number) {
      statusCode = code
      return this
    },
    json(body: unknown) {
      responseBody = body
      return this
    },
  } as unknown as Response

  requireTenant()(req, res, next)

  return {
    statusCode,
    responseBody,
    nextCalled: next.mock.calls.length > 0,
    libraryId: res.locals.libraryId,
  }
}

function authFor(
  role: AccessTokenPayload['role'],
  libraryId: string | null,
): AccessTokenPayload {
  return {
    userId: '507f1f77bcf86cd799439011',
    sessionId: '507f1f77bcf86cd799439012',
    role,
    libraryId,
  }
}

describe('Tenant isolation middleware', () => {
  it('allows an owner to access their own library', () => {
    const result = invokeTenantGuard(
      authFor('LIBRARY_OWNER', libraryA),
      libraryA,
    )

    expect(result.nextCalled).toBe(true)
    expect(result.libraryId).toBe(libraryA)
  })

  it('allows a librarian to access their assigned library', () => {
    const result = invokeTenantGuard(
      authFor('LIBRARIAN', libraryA),
      libraryA,
    )

    expect(result.nextCalled).toBe(true)
  })

  it('blocks access to another library', () => {
    const result = invokeTenantGuard(
      authFor('LIBRARY_OWNER', libraryA),
      libraryB,
    )

    expect(result.statusCode).toBe(403)
    expect(result.nextCalled).toBe(false)
  })

  it('blocks librarians from accessing another library', () => {
    const result = invokeTenantGuard(
      authFor('LIBRARIAN', libraryA),
      libraryB,
    )

    expect(result.statusCode).toBe(403)
  })

  it('rejects missing authentication', () => {
    const result = invokeTenantGuard(
      undefined,
      libraryA,
    )

    expect(result.statusCode).toBe(401)
  })

  it('rejects malformed library IDs', () => {
    const result = invokeTenantGuard(
      authFor('LIBRARY_OWNER', libraryA),
      'not-a-valid-object-id',
    )

    expect(result.statusCode).toBe(400)
  })

  it('rejects a user without a library assignment', () => {
    const result = invokeTenantGuard(
      authFor('LIBRARIAN', null),
      libraryA,
    )

    expect(result.statusCode).toBe(403)
  })

  it('does not give platform admins an implicit bypass', () => {
    const result = invokeTenantGuard(
      authFor('PLATFORM_ADMIN', null),
      libraryA,
    )

    expect(result.statusCode).toBe(403)
  })

  it('accepts valid ObjectIds with uppercase hex digits', () => {
    const result = invokeTenantGuard(
      authFor('LIBRARY_OWNER', libraryA),
      libraryA.toUpperCase(),
    )

    expect(result.nextCalled).toBe(true)
  })
})
