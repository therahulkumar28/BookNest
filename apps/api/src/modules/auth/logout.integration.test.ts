
import mongoose from 'mongoose'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'

import { RefreshSessionModel } from './refresh-session.model'
import { UserModel } from './user.model'
import {
  generateRefreshToken,
  hashRefreshToken,
} from './refresh-token.service'
import { logoutSession } from './logout.service'

let replicaSet: MongoMemoryReplSet

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
  })

  await mongoose.connect(replicaSet.getUri())

  await Promise.all([
    RefreshSessionModel.init(),
    UserModel.init(),
  ])
}, 120_000)

afterAll(async () => {
  await mongoose.disconnect()
  await replicaSet?.stop()
})

beforeEach(async () => {
  await Promise.all([
    RefreshSessionModel.deleteMany({}),
    UserModel.deleteMany({}),
  ])
})

async function seedSession() {
  const refreshToken = generateRefreshToken()
  const user = await UserModel.create({
    fullName: 'Logout Test Owner',
    email: 'logout-test@example.com',
    passwordHash: 'test-placeholder',
    role: 'LIBRARY_OWNER',
    status: 'ACTIVE',
    emailVerifiedAt: new Date(),
  })
  const familyId = new mongoose.Types.ObjectId()

  const session = await RefreshSessionModel.create({
    userId: user._id,
    familyId,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: new Date(Date.now() + 86400000),
    revokedAt: null,
    revocationReason: null,
  })

  return { refreshToken, session, user, familyId }
}

describe('Logout session security', () => {
  it('revokes an active session', async () => {
    const { refreshToken, session } = await seedSession()

    await logoutSession(refreshToken)

    const stored = await RefreshSessionModel.findById(
      session._id,
    )

    expect(stored?.revokedAt).toBeInstanceOf(Date)
    expect(stored?.revocationReason).toBe('LOGOUT')
  })

  it('revokes an active replacement when given a rotated token', async () => {
    const { refreshToken, session, user, familyId } =
      await seedSession()

    await RefreshSessionModel.updateOne(
      { _id: session._id },
      {
        $set: {
          revokedAt: new Date(),
          revocationReason: 'ROTATED',
        },
      },
    )

    const replacementToken = generateRefreshToken()
    const replacement = await RefreshSessionModel.create({
      userId: user._id,
      familyId,
      tokenHash: hashRefreshToken(replacementToken),
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: null,
      revocationReason: null,
    })

    await logoutSession(refreshToken)

    const storedReplacement = await RefreshSessionModel.findById(
      replacement._id,
    )

    expect(storedReplacement?.revokedAt).toBeInstanceOf(Date)
    expect(storedReplacement?.revocationReason).toBe('LOGOUT')
  })

  it('allows repeated logout without changing the reason', async () => {
    const { refreshToken, session } = await seedSession()

    await logoutSession(refreshToken)

    const first = await RefreshSessionModel.findById(
      session._id,
    )

    await logoutSession(refreshToken)

    const second = await RefreshSessionModel.findById(
      session._id,
    )

    expect(second?.revocationReason).toBe('LOGOUT')
    expect(second?.revokedAt?.getTime()).toBe(
      first?.revokedAt?.getTime(),
    )
  })

  it('does nothing when no token is supplied', async () => {
    const { session } = await seedSession()

    await logoutSession(null)

    const stored = await RefreshSessionModel.findById(
      session._id,
    )

    expect(stored?.revokedAt).toBeNull()
  })

  it('does not revoke a session for an invalid token', async () => {
    const { session } = await seedSession()

    await logoutSession('invalid-token')

    const stored = await RefreshSessionModel.findById(
      session._id,
    )

    expect(stored?.revokedAt).toBeNull()
  })
})
