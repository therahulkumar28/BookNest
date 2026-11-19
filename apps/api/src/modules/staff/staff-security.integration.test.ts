import express from 'express'
import mongoose from 'mongoose'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { UserModel } from '../auth/user.model'
import { RefreshSessionModel } from '../auth/refresh-session.model'
import { TenantSubscriptionModel } from '../subscription/tenant-subscription.model'
import { signAccessToken } from '../auth/access-token.service'
import { StaffInvitationModel } from './staff-invitation.model'
import { StaffPermissionsModel } from './staff-permissions.model'
import { StaffAuditModel } from './staff-audit.model'
import { staffRouter } from './staff.routes'
import { inviteStaff, resendStaffInvitation, acceptStaffInvitation, changeStaffPermissions, changeStaffStatus } from './staff.service'

vi.mock('./staff-invitation-email.service', () => ({ sendStaffInvitationEmail: vi.fn().mockResolvedValue(undefined) }))
import { sendStaffInvitationEmail } from './staff-invitation-email.service'
const sendEmail = vi.mocked(sendStaffInvitationEmail)
let replicaSet: MongoMemoryReplSet
let server: Server
let baseUrl: string
const libraryA = new mongoose.Types.ObjectId()
const libraryB = new mongoose.Types.ObjectId()
const actor = new mongoose.Types.ObjectId()
const pass = 'BookNest-Test-Password-2026!'

beforeAll(async () => {
  process.env.JWT_ACCESS_SECRET = 'booknest-staff-security-integration-secret-2026'
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } })
  await mongoose.connect(replicaSet.getUri())
  await Promise.all([UserModel.init(), RefreshSessionModel.init(), TenantSubscriptionModel.init(),
    StaffInvitationModel.init(), StaffPermissionsModel.init(), StaffAuditModel.init()])
  const app = express()
  app.use(express.json())
  app.use('/api/v1/staff', staffRouter)
  server = await new Promise<Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}, 120_000)
afterAll(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close((e) => e ? reject(e) : resolve()))
  await mongoose.disconnect()
  await replicaSet?.stop()
})
beforeEach(async () => {
  await Promise.all([StaffAuditModel.deleteMany({}), StaffInvitationModel.deleteMany({}),
    StaffPermissionsModel.deleteMany({}), RefreshSessionModel.deleteMany({}),
    TenantSubscriptionModel.deleteMany({}), UserModel.deleteMany({})])
  sendEmail.mockReset().mockResolvedValue(undefined)
})
async function seedAuth(role: 'LIBRARY_OWNER' | 'LIBRARIAN', libraryId = libraryA) {
  const user = await UserModel.create({ fullName: 'Authenticated Staff Test',
    email: `${role.toLowerCase()}-${libraryId.toString()}@example.com`, passwordHash: 'placeholder',
    role, libraryId, status: 'ACTIVE', emailVerifiedAt: new Date() })
  const session = await RefreshSessionModel.create({ userId: user._id,
    familyId: new mongoose.Types.ObjectId(), tokenHash: new mongoose.Types.ObjectId().toString().padEnd(64, 'a'),
    expiresAt: new Date(Date.now() + 86_400_000), revokedAt: null })
  const token = await signAccessToken({ userId: user._id.toString(), role, libraryId: libraryId.toString(), sessionId: session._id.toString() })
  return { user, token }
}
async function activeSubscription(libraryId = libraryA) {
  await TenantSubscriptionModel.create({ libraryId, status: 'ACTIVE', startsAt: new Date(Date.now() - 86_400_000),
    expiresAt: new Date(Date.now() + 86_400_000), planCode: 'MONTHLY', pricePaise: 1000 })
}
async function request(path: string, method: string, token?: string, body?: unknown) {
  return fetch(baseUrl + '/api/v1/staff' + path, { method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) })
}
const invitationBody = { fullName: 'New Librarian', email: 'new@example.com', permissions: ['students.read'] }

describe('staff security closure', () => {
  it('rejects unauthenticated staff invitations', async () => {
    expect((await request('/', 'POST', undefined, invitationBody)).status).toBe(401)
  })
  it('rejects librarian staff management', async () => {
    const librarian = await seedAuth('LIBRARIAN')
    expect((await request('/', 'POST', librarian.token, invitationBody)).status).toBe(403)
  })
  it('rejects owner writes without a managing subscription', async () => {
    const owner = await seedAuth('LIBRARY_OWNER')
    expect((await request('/', 'POST', owner.token, invitationBody)).status).toBe(403)
  })
  it('allows owner invitation and denies cross-tenant resend', async () => {
    const ownerA = await seedAuth('LIBRARY_OWNER', libraryA)
    const ownerB = await seedAuth('LIBRARY_OWNER', libraryB)
    await activeSubscription(libraryA)
    await activeSubscription(libraryB)
    const created = await request('/', 'POST', ownerA.token, invitationBody)
    expect(created.status).toBe(201)
    const body = await created.json() as { data: { userId: string } }
    expect((await request(`/${body.data.userId}/resend-invitation`, 'POST', ownerB.token)).status).toBe(404)
  })
  it('invalidates old tokens when owner resends', async () => {
    const invited = await inviteStaff(actor.toString(), libraryA.toString(), 'New Librarian', 'new@example.com', ['students.read'])
    const oldToken = sendEmail.mock.lastCall![1]
    await StaffInvitationModel.updateOne({ userId: invited.userId }, { $set: { lastSentAt: new Date(Date.now() - 61_000) } })
    await resendStaffInvitation(actor.toString(), libraryA.toString(), invited.userId)
    const newToken = sendEmail.mock.lastCall![1]
    expect(newToken).not.toBe(oldToken)
    await expect(acceptStaffInvitation(oldToken, pass)).rejects.toMatchObject({ statusCode: 400 })
    await acceptStaffInvitation(newToken, pass)
    await expect(resendStaffInvitation(actor.toString(), libraryA.toString(), invited.userId)).rejects.toMatchObject({ statusCode: 409 })
    const events = await StaffAuditModel.find({ staffId: invited.userId }).lean()
    expect(events.map((e) => e.action)).toEqual(expect.arrayContaining(['STAFF_INVITED', 'STAFF_INVITATION_RESENT', 'STAFF_INVITATION_ACCEPTED']))
  })
  it('enforces cooldown and five resends per day', async () => {
    const invited = await inviteStaff(actor.toString(), libraryA.toString(), 'New Librarian', 'new@example.com', ['students.read'])
    await expect(resendStaffInvitation(actor.toString(), libraryA.toString(), invited.userId)).rejects.toMatchObject({ statusCode: 429 })
    for (let i = 0; i < 5; i++) {
      await StaffInvitationModel.updateOne({ userId: invited.userId }, { $set: { lastSentAt: new Date(Date.now() - 61_000) } })
      await resendStaffInvitation(actor.toString(), libraryA.toString(), invited.userId)
    }
    await StaffInvitationModel.updateOne({ userId: invited.userId }, { $set: { lastSentAt: new Date(Date.now() - 61_000) } })
    await expect(resendStaffInvitation(actor.toString(), libraryA.toString(), invited.userId)).rejects.toMatchObject({ statusCode: 429 })
  })
  it('recovers from SMTP delivery failure via owner resend', async () => {
    sendEmail.mockRejectedValueOnce(new Error('SMTP unavailable'))
    await expect(inviteStaff(actor.toString(), libraryA.toString(), 'New Librarian', 'new@example.com', ['students.read'])).rejects.toThrow('SMTP unavailable')
    const pending = await UserModel.findOne({ email: 'new@example.com' })
    expect(pending?.status).toBe('PENDING_VERIFICATION')
    await StaffInvitationModel.updateOne({ userId: pending!._id }, { $set: { lastSentAt: new Date(Date.now() - 61_000) } })
    await resendStaffInvitation(actor.toString(), libraryA.toString(), pending!._id.toString())
    expect(sendEmail).toHaveBeenCalledTimes(2)
  })
  it('audits permission and suspension changes', async () => {
    const invited = await inviteStaff(actor.toString(), libraryA.toString(), 'New Librarian', 'new@example.com', ['students.read'])
    await acceptStaffInvitation(sendEmail.mock.lastCall![1], pass)
    await changeStaffPermissions(actor.toString(), libraryA.toString(), invited.userId, ['students.update'])
    await changeStaffStatus(libraryA.toString(), invited.userId, 'SUSPENDED', actor.toString())
    const events = await StaffAuditModel.find({ staffId: invited.userId }).lean()
    expect(events.map((e) => e.action)).toEqual(expect.arrayContaining(['STAFF_PERMISSIONS_CHANGED', 'STAFF_SUSPENDED']))
  })
})
