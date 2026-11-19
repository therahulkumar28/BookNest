import mongoose from 'mongoose'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

let pauseHash: (() => Promise<void>) | undefined
let hashEntered: (() => void) | undefined

vi.mock('../auth/password.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth/password.service')>()
  return {
    ...actual,
    hashPassword: async (plain: string) => {
      if (pauseHash) {
        hashEntered?.()
        await pauseHash()
      }
      return actual.hashPassword(plain)
    },
  }
})
vi.mock('./staff-invitation-email.service', () => ({
  sendStaffInvitationEmail: vi.fn().mockResolvedValue(undefined),
}))

import { UserModel } from '../auth/user.model'
import { RefreshSessionModel } from '../auth/refresh-session.model'
import { StaffPermissionsModel } from './staff-permissions.model'
import { StaffInvitationModel } from './staff-invitation.model'
import { StaffAuditModel } from './staff-audit.model'
import { sendStaffInvitationEmail } from './staff-invitation-email.service'
import { inviteStaff, resendStaffInvitation, acceptStaffInvitation } from './staff.service'

const sendEmail = vi.mocked(sendStaffInvitationEmail)
const libraryId = new mongoose.Types.ObjectId()
const ownerId = new mongoose.Types.ObjectId()
const password = 'BookNest-Test-Password-2026!'
let replicaSet: MongoMemoryReplSet

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } })
  await mongoose.connect(replicaSet.getUri())
  await Promise.all([
    UserModel.init(), RefreshSessionModel.init(), StaffPermissionsModel.init(),
    StaffInvitationModel.init(), StaffAuditModel.init(),
  ])
}, 120_000)

afterAll(async () => {
  await mongoose.disconnect()
  await replicaSet?.stop()
})

beforeEach(async () => {
  pauseHash = undefined
  hashEntered = undefined
  await Promise.all([
    StaffAuditModel.deleteMany({}), StaffInvitationModel.deleteMany({}),
    StaffPermissionsModel.deleteMany({}), RefreshSessionModel.deleteMany({}),
    UserModel.deleteMany({}),
  ])
  sendEmail.mockReset().mockResolvedValue(undefined)
})

describe('Invitation resend versus acceptance race regression', () => {
  it('rejects a stale acceptance after a resend replaces its token', async () => {
    const staff = await inviteStaff(
      ownerId.toString(), libraryId.toString(),
      'Race Test Librarian', 'race-test@example.com', ['students.read'],
    )
    const oldToken = sendEmail.mock.lastCall![1]

    // The invitation was fetched, but password hashing has not completed.
    // This makes the race deterministic rather than relying on timing.
    let releaseHash!: () => void
    let signalEntered!: () => void
    const entered = new Promise<void>((resolve) => { signalEntered = resolve })
    const hold = new Promise<void>((resolve) => { releaseHash = resolve })
    hashEntered = signalEntered
    pauseHash = () => hold

    const staleAcceptance = acceptStaffInvitation(oldToken, password)
    await entered

    // Resend must commit before the stale acceptance attempts its update.
    await StaffInvitationModel.updateOne(
      { userId: staff.userId },
      { $set: { lastSentAt: new Date(Date.now() - 61_000) } },
    )
    const resend = await resendStaffInvitation(
      ownerId.toString(), libraryId.toString(), staff.userId,
    )
    expect(resend.status).toBe('PENDING_VERIFICATION')
    const newToken = sendEmail.mock.lastCall![1]
    expect(newToken).not.toBe(oldToken)

    pauseHash = undefined
    releaseHash()
    await expect(staleAcceptance).rejects.toMatchObject({ statusCode: 400 })

    const pending = await UserModel.findById(staff.userId)
    expect(pending?.status).toBe('PENDING_VERIFICATION')
    expect(pending?.emailVerifiedAt).toBeNull()

    await acceptStaffInvitation(newToken, password)
    expect((await UserModel.findById(staff.userId))?.status).toBe('ACTIVE')
  }, 60_000)
})
