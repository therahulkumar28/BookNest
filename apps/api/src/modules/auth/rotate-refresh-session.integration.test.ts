
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

import { UserModel } from './user.model'
import { RefreshSessionModel } from './refresh-session.model'
import {
  generateRefreshToken,
  hashRefreshToken,
} from './refresh-token.service'
import { verifyAccessToken } from './access-token.service'
import {
  rotateRefreshSession,
  RefreshSessionError,
} from './rotate-refresh-session.service'
import { logoutSession } from './logout.service'
import { TenantSubscriptionModel } from '../subscription/tenant-subscription.model'

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
    TenantSubscriptionModel.init(),
  ])
}, 120_000)

afterAll(async () => {
  await mongoose.disconnect()
  await replicaSet?.stop()
})

beforeEach(async () => {
  await RefreshSessionModel.deleteMany({})
  await TenantSubscriptionModel.deleteMany({})
  await UserModel.deleteMany({})
})

async function seedSession() {
  const libraryId = new mongoose.Types.ObjectId()

  const user = await UserModel.create({
    fullName: 'Refresh Test Owner',
    email: 'refresh-test@example.com',
    passwordHash: 'test-placeholder',
    role: 'LIBRARY_OWNER',
    libraryId,
    status: 'ACTIVE',
    emailVerifiedAt: new Date(),
  })

  await TenantSubscriptionModel.create({
    libraryId,
    planCode: 'FREE_TRIAL',
    status: 'ACTIVE',
    pricePaise: 0,
    currency: 'INR',
    startsAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 86400000),
  })

  const refreshToken = generateRefreshToken()
  const familyId = new mongoose.Types.ObjectId()

  const session = await RefreshSessionModel.create({
    userId: user._id,
    familyId,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: new Date(Date.now() + 86400000),
    revokedAt: null,
    revocationReason: null,
  })

  return { user, session, familyId, refreshToken }
}

describe('Refresh session rotation', () => {
  it('rotates a valid token and issues a linked access JWT', async () => {
    const { user, session, familyId, refreshToken } =
      await seedSession()

    const result = await rotateRefreshSession(refreshToken)

    expect(result.refreshToken).not.toBe(refreshToken)
    expect(result.accessToken).toBeTruthy()

    const original = await RefreshSessionModel.findById(
      session._id,
    )

    expect(original?.revokedAt).toBeInstanceOf(Date)
    expect(original?.revocationReason).toBe('ROTATED')

    const replacement = await RefreshSessionModel.findOne({
      tokenHash: hashRefreshToken(result.refreshToken),
    })

    expect(replacement).not.toBeNull()
    expect(replacement?.revokedAt).toBeNull()
    expect(replacement?.familyId.toString()).toBe(
      familyId.toString(),
    )

    const payload = await verifyAccessToken(result.accessToken)

    expect(payload.userId).toBe(user._id.toString())
    expect(payload.sessionId).toBe(
      replacement?._id.toString(),
    )
  })

  it('revokes the entire family when a rotated token is reused', async () => {
    const { familyId, refreshToken } = await seedSession()

    const first = await rotateRefreshSession(refreshToken)

    await expect(
      rotateRefreshSession(refreshToken),
    ).rejects.toBeInstanceOf(RefreshSessionError)

    expect(
      await RefreshSessionModel.countDocuments({
        familyId,
        revokedAt: null,
      }),
    ).toBe(0)

    const sessions = await RefreshSessionModel.find({ familyId })
    const replacement = sessions.find(
      (session) => session.revocationReason === 'REUSE_DETECTED',
    )

    expect(replacement).toBeDefined()

    await expect(
      rotateRefreshSession(first.refreshToken),
    ).rejects.toBeInstanceOf(RefreshSessionError)
  })

  it('does not classify a logged-out token as reuse', async () => {
    const { session, familyId, refreshToken } =
      await seedSession()

    await RefreshSessionModel.updateOne(
      { _id: session._id },
      {
        $set: {
          revokedAt: new Date(),
          revocationReason: 'LOGOUT',
        },
      },
    )

    await expect(
      rotateRefreshSession(refreshToken),
    ).rejects.toBeInstanceOf(RefreshSessionError)

    const stored = await RefreshSessionModel.findById(session._id)

    expect(stored?.revocationReason).toBe('LOGOUT')

    expect(
      await RefreshSessionModel.countDocuments({
        familyId,
        revocationReason: 'REUSE_DETECTED',
      }),
    ).toBe(0)
  })

  it('does not allow two concurrent rotations to succeed', async () => {
    const { refreshToken } = await seedSession()

    const results = await Promise.allSettled([
      rotateRefreshSession(refreshToken),
      rotateRefreshSession(refreshToken),
    ])

    const successful = results.filter(
      (result) => result.status === 'fulfilled',
    )

    expect(successful).toHaveLength(1)
  })

  it('does not leave an active session when logout overlaps rotation', async () => {
    const { familyId, refreshToken } = await seedSession()

    await Promise.allSettled([
      rotateRefreshSession(refreshToken),
      logoutSession(refreshToken),
    ])

    expect(
      await RefreshSessionModel.countDocuments({
        familyId,
        revokedAt: null,
      }),
    ).toBe(0)
  })

  it('rejects a session revoked by password reset', async () => {
    const { user, refreshToken } = await seedSession()

    await RefreshSessionModel.updateMany(
      {
        userId: user._id,
        revokedAt: null,
      },
      {
        $set: { revokedAt: new Date() },
      },
    )

    await expect(
      rotateRefreshSession(refreshToken),
    ).rejects.toBeInstanceOf(RefreshSessionError)
  })

  it('rejects refresh for a suspended account', async () => {
    const { user, refreshToken } = await seedSession()

    await UserModel.updateOne(
      { _id: user._id },
      { $set: { status: 'SUSPENDED' } },
    )

    await expect(
      rotateRefreshSession(refreshToken),
    ).rejects.toBeInstanceOf(RefreshSessionError)
  })
})
