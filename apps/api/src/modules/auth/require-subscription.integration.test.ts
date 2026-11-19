
import express from 'express'
import mongoose from 'mongoose'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import type { Server } from 'node:http'
import { AddressInfo } from 'node:net'

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
import { requireRole } from './require-role.middleware'
import { requireTenant } from './require-tenant.middleware'
import { requireSubscription } from './require-subscription.middleware'

import { TenantSubscriptionModel } from '../subscription/tenant-subscription.model'

let replicaSet: MongoMemoryReplSet
let server: Server
let baseUrl: string

const libraryId = new mongoose.Types.ObjectId()
const otherLibraryId = new mongoose.Types.ObjectId()

beforeAll(async () => {
  process.env.JWT_ACCESS_SECRET =
    'booknest-subscription-integration-secret-2026'

  replicaSet = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
  })

  await mongoose.connect(replicaSet.getUri())

  await Promise.all([
    UserModel.init(),
    RefreshSessionModel.init(),
    TenantSubscriptionModel.init(),
  ])

  const app = express()

  app.get(
    '/libraries/:libraryId/view',
    requireAuth,
    requireRole('LIBRARY_OWNER', 'LIBRARIAN'),
    requireTenant(),
    requireSubscription('VIEW_LIBRARY'),
    (_req, res) => {
      res.status(200).json({ success: true })
    },
  )

  app.post(
    '/libraries/:libraryId/manage',
    requireAuth,
    requireRole('LIBRARY_OWNER', 'LIBRARIAN'),
    requireTenant(),
    requireSubscription('MANAGE_LIBRARY'),
    (_req, res) => {
      res.status(200).json({ success: true })
    },
  )

  app.post(
    '/libraries/:libraryId/billing',
    requireAuth,
    requireRole('LIBRARY_OWNER'),
    requireTenant(),
    requireSubscription('MANAGE_BILLING'),
    (_req, res) => {
      res.status(200).json({ success: true })
    },
  )

  server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => {
      resolve(listener)
    })
  })

  const address = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${address.port}`
}, 120_000)

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  }

  await mongoose.disconnect()
  await replicaSet?.stop()
})

beforeEach(async () => {
  await Promise.all([
    TenantSubscriptionModel.deleteMany({}),
    RefreshSessionModel.deleteMany({}),
    UserModel.deleteMany({}),
  ])
})

async function seedUser(
  role: 'LIBRARY_OWNER' | 'LIBRARIAN' = 'LIBRARY_OWNER',
) {
  const user = await UserModel.create({
    fullName: 'Subscription Test User',
    email: `${role.toLowerCase()}@example.com`,
    passwordHash: 'test-placeholder',
    role,
    libraryId,
    status: 'ACTIVE',
    emailVerifiedAt: new Date(),
  })

  const session = await RefreshSessionModel.create({
    userId: user._id,
    familyId: new mongoose.Types.ObjectId(),
    tokenHash: new mongoose.Types.ObjectId()
      .toHexString()
      .padEnd(64, 'a'),
    expiresAt: new Date(Date.now() + 86400000),
    revokedAt: null,
    revocationReason: null,
  })

  return signAccessToken({
    userId: user._id.toString(),
    role,
    libraryId: libraryId.toString(),
    sessionId: session._id.toString(),
  })
}

async function seedSubscription(
  status:
    | 'ACTIVE'
    | 'GRACE_PERIOD'
    | 'PENDING_PAYMENT'
    | 'READ_ONLY'
    | 'EXPIRED',
  expiresAt: Date | null = null,
  graceEndsAt: Date | null = null,
) {
  return TenantSubscriptionModel.create({
    libraryId,
    planCode: 'MONTHLY',
    status,
    startsAt: new Date(Date.now() - 86400000),
    expiresAt,
    graceEndsAt,
    pricePaise: 100000,
    currency: 'INR',
  })
}

async function request(
  token: string | null,
  path: string,
  method: 'GET' | 'POST' = 'GET',
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: token
      ? { Authorization: `Bearer ${token}` }
      : {},
  })

  return response.status
}

describe('Subscription HTTP authorization', () => {
  it('rejects unauthenticated requests', async () => {
    const status = await request(
      null,
      `/libraries/${libraryId}/view`,
    )

    expect(status).toBe(401)
  })

  it('allows an active library to view and manage records', async () => {
    const token = await seedUser()

    await seedSubscription(
      'ACTIVE',
      new Date(Date.now() + 86400000),
    )

    expect(
      await request(token, `/libraries/${libraryId}/view`),
    ).toBe(200)

    expect(
      await request(
        token,
        `/libraries/${libraryId}/manage`,
        'POST',
      ),
    ).toBe(200)
  })

  it('blocks management after subscription expiry', async () => {
    const token = await seedUser()

    await seedSubscription(
      'ACTIVE',
      new Date(Date.now() - 1000),
    )

    expect(
      await request(
        token,
        `/libraries/${libraryId}/manage`,
        'POST',
      ),
    ).toBe(403)

    expect(
      await request(token, `/libraries/${libraryId}/view`),
    ).toBe(200)
  })

  it('enforces changes without issuing a new JWT', async () => {
    const token = await seedUser()

    const subscription = await seedSubscription(
      'ACTIVE',
      new Date(Date.now() + 86400000),
    )

    const path = `/libraries/${libraryId}/manage`

    expect(await request(token, path, 'POST')).toBe(200)

    await TenantSubscriptionModel.updateOne(
      { _id: subscription._id },
      { $set: { status: 'READ_ONLY' } },
    )

    expect(await request(token, path, 'POST')).toBe(403)
  })

  it('blocks library access while payment is pending', async () => {
    const token = await seedUser()

    await seedSubscription('PENDING_PAYMENT')

    expect(
      await request(token, `/libraries/${libraryId}/view`),
    ).toBe(403)

    expect(
      await request(
        token,
        `/libraries/${libraryId}/billing`,
        'POST',
      ),
    ).toBe(200)
  })

  it('does not let a librarian manage billing', async () => {
    const token = await seedUser('LIBRARIAN')

    await seedSubscription(
      'ACTIVE',
      new Date(Date.now() + 86400000),
    )

    expect(
      await request(
        token,
        `/libraries/${libraryId}/billing`,
        'POST',
      ),
    ).toBe(403)
  })

  it('blocks access to another library', async () => {
    const token = await seedUser()

    await seedSubscription(
      'ACTIVE',
      new Date(Date.now() + 86400000),
    )

    expect(
      await request(
        token,
        `/libraries/${otherLibraryId}/view`,
      ),
    ).toBe(403)
  })

  it('blocks management after the grace period ends', async () => {
    const token = await seedUser()

    await seedSubscription(
      'GRACE_PERIOD',
      new Date(Date.now() - 86400000),
      new Date(Date.now() - 1000),
    )

    expect(
      await request(
        token,
        `/libraries/${libraryId}/manage`,
        'POST',
      ),
    ).toBe(403)
  })

  it('fails closed when no subscription exists', async () => {
    const token = await seedUser()

    expect(
      await request(token, `/libraries/${libraryId}/view`),
    ).toBe(403)
  })
})
