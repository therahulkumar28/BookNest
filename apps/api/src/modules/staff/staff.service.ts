import { createHash, randomBytes } from 'node:crypto'
import mongoose from 'mongoose'
import { UserModel } from '../auth/user.model'
import { RefreshSessionModel } from '../auth/refresh-session.model'
import { lockAuthSession } from '../auth/lock-auth-session.service'
import { hashPassword } from '../auth/password.service'
import { StaffPermissionsModel } from './staff-permissions.model'
import { StaffInvitationModel } from './staff-invitation.model'
import { sendStaffInvitationEmail } from './staff-invitation-email.service'
import type { Permission } from './permissions'
import { StaffAuditModel } from './staff-audit.model'

export class StaffError extends Error {
  constructor(public statusCode: number, message: string) { super(message) }
}
const digest = (token: string) => createHash('sha256').update(token).digest('hex')

export async function inviteStaff(actorId: string, libraryId: string, fullName: string, email: string, permissions: Permission[]) {
  const token = randomBytes(32).toString('base64url')
  const tokenHash = digest(token)
  let userId: mongoose.Types.ObjectId | undefined
  try {
    await mongoose.connection.transaction(async (session) => {
      const [user] = await UserModel.create([{ fullName, email, passwordHash: await hashPassword(randomBytes(32).toString('hex')),
        role: 'LIBRARIAN', libraryId: new mongoose.Types.ObjectId(libraryId), status: 'PENDING_VERIFICATION',
        emailVerifiedAt: null, createdBy: new mongoose.Types.ObjectId(actorId) }], { session })
      userId = user._id
      await StaffPermissionsModel.create([{ userId: user._id, libraryId: user.libraryId, permissions,
        updatedBy: new mongoose.Types.ObjectId(actorId) }], { session })
      await StaffInvitationModel.create([{ userId: user._id, libraryId: user.libraryId, tokenHash,
        expiresAt: new Date(Date.now() + 30 * 60_000), usedAt: null, lastSentAt: new Date(), resendCount: 0, resendWindowStartedAt: new Date() }], { session })
      await StaffAuditModel.create([{ libraryId: user.libraryId, staffId: user._id, actorId: new mongoose.Types.ObjectId(actorId), action: 'STAFF_INVITED' }], { session })
    })
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new StaffError(409, 'An account with this email already exists')
    throw error
  }
  // Delivery failure is reported; the pending invitation remains and can be retried by a future resend endpoint.
  await sendStaffInvitationEmail(email, token)
  return { userId: userId!.toString(), email, status: 'PENDING_VERIFICATION' }
}

export async function acceptStaffInvitation(token: string, password: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new StaffError(400, 'Invalid or expired invitation')
  const tokenHash = digest(token)
  const invitation = await StaffInvitationModel.findOne({ tokenHash, usedAt: null, expiresAt: { $gt: new Date() } })
  if (!invitation) throw new StaffError(400, 'Invalid or expired invitation')
  const passwordHash = await hashPassword(password)
  await mongoose.connection.transaction(async (session) => {
    await lockAuthSession(invitation.userId, session)
    const now = new Date()
    const consumed = await StaffInvitationModel.updateOne({ _id: invitation._id, tokenHash, usedAt: null, expiresAt: { $gt: now } },
      { $set: { usedAt: now } }, { session })
    if (consumed.modifiedCount !== 1) throw new StaffError(400, 'Invalid or expired invitation')
    const activated = await UserModel.updateOne({ _id: invitation.userId, role: 'LIBRARIAN',
      libraryId: invitation.libraryId, status: 'PENDING_VERIFICATION', emailVerifiedAt: null },
      { $set: { passwordHash, status: 'ACTIVE', emailVerifiedAt: now } }, { session })
    if (activated.modifiedCount !== 1) throw new StaffError(400, 'Invalid or expired invitation')
    await StaffAuditModel.create([{ libraryId: invitation.libraryId, staffId: invitation.userId, actorId: invitation.userId, action: 'STAFF_INVITATION_ACCEPTED' }], { session })
  })
}

export async function listStaff(libraryId: string) {
  const users = await UserModel.find({ libraryId, role: 'LIBRARIAN' })
    .select('_id fullName email status emailVerifiedAt createdAt').sort({ createdAt: -1 }).lean()
  const permissions = await StaffPermissionsModel.find({ libraryId }).select('userId permissions').lean()
  const byUser = new Map(permissions.map((p) => [p.userId.toString(), p.permissions]))
  return users.map((user) => ({ ...user, permissions: byUser.get(user._id.toString()) ?? [] }))
}

export async function resendStaffInvitation(actorId: string, libraryId: string, staffId: string) {
  const now = new Date()
  const token = randomBytes(32).toString('base64url')
  const tokenHash = digest(token)
  let recipient = ''
  await mongoose.connection.transaction(async (session) => {
    const user = await UserModel.findOne({ _id: staffId, libraryId, role: 'LIBRARIAN' }).session(session)
    if (!user) throw new StaffError(404, 'Staff member not found')
    if (user.status !== 'PENDING_VERIFICATION' || user.emailVerifiedAt) {
      throw new StaffError(409, 'Invitation is no longer pending')
    }
    await lockAuthSession(user._id, session)
    const invitation = await StaffInvitationModel.findOne({ userId: user._id, libraryId }).session(session)
    const lastSentAt = invitation?.lastSentAt
    if (lastSentAt && now.getTime() - lastSentAt.getTime() < 60_000) {
      throw new StaffError(429, 'Wait 60 seconds before resending the invitation')
    }
    const windowStart = invitation?.resendWindowStartedAt
    const withinWindow = !!windowStart && now.getTime() - windowStart.getTime() < 24 * 60 * 60_000
    const resendCount = withinWindow ? (invitation?.resendCount ?? 0) : 0
    if (resendCount >= 5) throw new StaffError(429, 'Daily invitation resend limit reached')
    // Upsert because MongoDB's TTL monitor may already have deleted an expired invitation.
    await StaffInvitationModel.updateOne(
      { userId: user._id, libraryId },
      { $set: { tokenHash, expiresAt: new Date(now.getTime() + 30 * 60_000),
        usedAt: null, lastSentAt: now, resendCount: resendCount + 1,
        resendWindowStartedAt: withinWindow ? windowStart : now } },
      { upsert: true, session },
    )
    await StaffAuditModel.create([{ libraryId: user.libraryId, staffId: user._id,
      actorId: new mongoose.Types.ObjectId(actorId), action: 'STAFF_INVITATION_RESENT' }], { session })
    recipient = user.email
  })
  // Delivery failures remain retryable after the cooldown; never return the token to the caller.
  await sendStaffInvitationEmail(recipient, token)
  return { status: 'PENDING_VERIFICATION' as const }
}

export async function changeStaffPermissions(actorId: string, libraryId: string, staffId: string, permissions: Permission[]) {
  await mongoose.connection.transaction(async (session) => {
    const user = await UserModel.findOne({ _id: staffId, libraryId, role: 'LIBRARIAN' }).session(session)
    if (!user) throw new StaffError(404, 'Staff member not found')
    await lockAuthSession(user._id, session)
    const record = await StaffPermissionsModel.findOne({ userId: user._id, libraryId }).session(session)
    if (!record) throw new StaffError(404, 'Staff permissions not found')
    const previous = [...record.permissions]
    const updated = await StaffPermissionsModel.updateOne({ _id: record._id },
      { $set: { permissions, updatedBy: new mongoose.Types.ObjectId(actorId) } }, { session })
    if (updated.matchedCount !== 1) throw new StaffError(404, 'Staff permissions not found')
    await StaffAuditModel.create([{ libraryId: user.libraryId, staffId: user._id,
      actorId: new mongoose.Types.ObjectId(actorId), action: 'STAFF_PERMISSIONS_CHANGED',
      details: { previousPermissions: previous, newPermissions: permissions } }], { session })
  })
}

export async function changeStaffStatus(libraryId: string, staffId: string, status: 'ACTIVE' | 'SUSPENDED', actorId?: string) {
  await mongoose.connection.transaction(async (session) => {
    const user = await UserModel.findOne({ _id: staffId, libraryId, role: 'LIBRARIAN' }).session(session)
    if (!user) throw new StaffError(404, 'Staff member not found')
    if (status === 'ACTIVE' && !user.emailVerifiedAt) throw new StaffError(409, 'Invitation has not been accepted')
    await lockAuthSession(user._id, session)
    const updated = await UserModel.updateOne({ _id: user._id, libraryId, role: 'LIBRARIAN' }, { $set: { status } }, { session })
    if (updated.matchedCount !== 1) throw new StaffError(404, 'Staff member not found')
    if (status === 'SUSPENDED') {
      await RefreshSessionModel.updateMany({ userId: user._id, revokedAt: null },
        { $set: { revokedAt: new Date(), revocationReason: 'ACCOUNT_DISABLED' } }, { session })
    }
    await StaffAuditModel.create([{ libraryId: user.libraryId, staffId: user._id,
      actorId: new mongoose.Types.ObjectId(actorId ?? staffId),
      action: status === 'SUSPENDED' ? 'STAFF_SUSPENDED' : 'STAFF_ACTIVATED',
      details: { previousStatus: user.status } }], { session })
  })
}
