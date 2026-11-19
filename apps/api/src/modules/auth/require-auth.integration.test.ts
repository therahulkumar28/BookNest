
import mongoose from 'mongoose'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import type {
  Request,
  Response,
  NextFunction,
} from 'express'

import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'

import { UserModel } from './user.model'
import { RefreshSessionModel } from './refresh-session.model'
import { signAccessToken } from './access-token.service'
import { requireAuth } from './require-auth.middleware'

let replicaSet: MongoMemoryReplSet

beforeAll(async () => {
  process.env.JWT_ACCESS_SECRET =
    'booknest-integration-test-access-secret-2026'

  replicaSet = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
  })

  await mongoose.connect(replicaSet.getUri())

  await Promise.all([
    UserModel.init(),
    RefreshSessionModel.init(),
  ])
}, 120_000)

afterAll(async () => {
  await mongoose.disconnect()
  await replicaSet?.stop()
})

beforeEach(async () => {
  await RefreshSessionModel.deleteMany({})
  await UserModel.deleteMany({})
})

async function seedAuthenticatedUser() {
  const libraryId = new mongoose.Types.ObjectId()

  const user = await UserModel.create({
    fullName: 'Auth Middleware Test',
    email: 'auth-middleware@example.com',
    passwordHash: 'test-placeholder',
    role: 'LIBRARY_OWNER',
    libraryId,
    status: 'ACTIVE',
    emailVerifiedAt: new Date(),
  })

  const session = await RefreshSessionModel.create({
    userId: user._id,
    familyId: new mongoose.Types.ObjectId(),
    tokenHash: 'a'.repeat(64),
    expiresAt: new Date(Date.now() + 86400000),
    revokedAt: null,
    revocationReason: null,
  })

  const accessToken = await signAccessToken({
    userId: user._id.toString(),
    role: user.role,
    libraryId: libraryId.toString(),
    sessionId: session._id.toString(),
  })

  return { user, session, accessToken }
}

async function invokeMiddleware(
  accessToken?: string,
) {
  let statusCode = 200
  let responseBody: unknown
  let nextCalled = false
  let nextError: unknown

  const req = {
    headers: accessToken
      ? { authorization: `Bearer ${accessToken}` }
      : {},
  } as Request

  const res = {
    locals: {},
    status(code: number) {
      statusCode = code
      return this
    },
    json(body: unknown) {
      responseBody = body
      return this
    },
  } as unknown as Response

  const next: NextFunction = (error?: unknown) => {
    nextCalled = true
    nextError = error
  }

  await requireAuth(req, res, next)

  return {
    statusCode,
    responseBody,
    nextCalled,
    nextError,
    auth: res.locals.auth,
  }
}

describe('Session-aware authentication', () => {
  it('accepts a valid JWT with an active session', async () => {
    const { user, accessToken } =
      await seedAuthenticatedUser()

    const result = await invokeMiddleware(accessToken)

    expect(result.nextCalled).toBe(true)
    expect(result.nextError).toBeUndefined()
    expect(result.auth.userId).toBe(user._id.toString())
  })

  it('rejects requests without a bearer token', async () => {
    const result = await invokeMiddleware()

    expect(result.statusCode).toBe(401)
    expect(result.nextCalled).toBe(false)
  })

  it('rejects a revoked session immediately', async () => {
    const { session, accessToken } =
      await seedAuthenticatedUser()

    await RefreshSessionModel.updateOne(
      { _id: session._id },
      {
        $set: {
          revokedAt: new Date(),
          revocationReason: 'PASSWORD_RESET',
        },
      },
    )

    const result = await invokeMiddleware(accessToken)

    expect(result.statusCode).toBe(401)
    expect(result.nextCalled).toBe(false)
  })

  it('rejects an expired database session', async () => {
    const { session, accessToken } =
      await seedAuthenticatedUser()

    await RefreshSessionModel.updateOne(
      { _id: session._id },
      {
        $set: {
          expiresAt: new Date(Date.now() - 1000),
        },
      },
    )

    const result = await invokeMiddleware(accessToken)

    expect(result.statusCode).toBe(401)
  })

  it('rejects a suspended user', async () => {
    const { user, accessToken } =
      await seedAuthenticatedUser()

    await UserModel.updateOne(
      { _id: user._id },
      { $set: { status: 'SUSPENDED' } },
    )

    const result = await invokeMiddleware(accessToken)

    expect(result.statusCode).toBe(401)
  })

  it('rejects a JWT with a stale role', async () => {
    const { user, session } =
      await seedAuthenticatedUser()

    const staleToken = await signAccessToken({
      userId: user._id.toString(),
      role: 'LIBRARIAN',
      libraryId: user.libraryId!.toString(),
      sessionId: session._id.toString(),
    })

    const result = await invokeMiddleware(staleToken)

    expect(result.statusCode).toBe(401)
  })

  it('rejects a JWT with a stale library assignment', async () => {
    const { user, session } =
      await seedAuthenticatedUser()

    const staleToken = await signAccessToken({
      userId: user._id.toString(),
      role: user.role,
      libraryId: new mongoose.Types.ObjectId().toString(),
      sessionId: session._id.toString(),
    })

    const result = await invokeMiddleware(staleToken)

    expect(result.statusCode).toBe(401)
  })

  it('rejects a JWT signed with the wrong secret', async () => {
    const { accessToken } = await seedAuthenticatedUser()

    const originalSecret = process.env.JWT_ACCESS_SECRET

    try {
      process.env.JWT_ACCESS_SECRET =
        'different-secret-at-least-32-characters-long'

      const result = await invokeMiddleware(accessToken)

      expect(result.statusCode).toBe(401)
      expect(result.nextCalled).toBe(false)
    } finally {
      process.env.JWT_ACCESS_SECRET = originalSecret
    }
  })
})
