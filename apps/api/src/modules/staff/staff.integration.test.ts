
import mongoose from 'mongoose'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { UserModel } from '../auth/user.model'
import { RefreshSessionModel } from '../auth/refresh-session.model'
import { verifyPassword } from '../auth/password.service'

import { StaffPermissionsModel } from './staff-permissions.model'
import { StaffInvitationModel } from './staff-invitation.model'

import {
  inviteStaff,
  acceptStaffInvitation,
  changeStaffPermissions,
  changeStaffStatus,
  listStaff,
} from './staff.service'

vi.mock('./staff-invitation-email.service', () => ({
  sendStaffInvitationEmail: vi.fn().mockResolvedValue(undefined),
}))

import {
  sendStaffInvitationEmail,
} from './staff-invitation-email.service'

const emailMock = vi.mocked(sendStaffInvitationEmail)

let replicaSet: MongoMemoryReplSet

const libraryA = new mongoose.Types.ObjectId()
const libraryB = new mongoose.Types.ObjectId()
const ownerId = new mongoose.Types.ObjectId()

const password = 'BookNest-Test-Password-2026!'

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
  })

  await mongoose.connect(replicaSet.getUri())

  await Promise.all([
    UserModel.init(),
    RefreshSessionModel.init(),
    StaffPermissionsModel.init(),
    StaffInvitationModel.init(),
  ])
}, 120_000)

afterAll(async () => {
  await mongoose.disconnect()
  await replicaSet?.stop()
})

beforeEach(async () => {
  await Promise.all([
    StaffInvitationModel.deleteMany({}),
    StaffPermissionsModel.deleteMany({}),
    RefreshSessionModel.deleteMany({}),
    UserModel.deleteMany({}),
  ])

  emailMock.mockClear()
})

async function invite(
  libraryId = libraryA,
  email = 'staff@example.com',
) {
  return inviteStaff(
    ownerId.toString(),
    libraryId.toString(),
    'Test Librarian',
    email,
    ['students.read'],
  )
}

function invitationToken(): string {
  const call = emailMock.mock.lastCall

  if (!call) {
    throw new Error('Invitation email was not sent')
  }

  return call[1]
}

describe('Staff invitation and authorization lifecycle', () => {
  it('creates an inactive librarian with scoped permissions', async () => {
    const result = await invite()

    expect(result.status).toBe('PENDING_VERIFICATION')

    const user = await UserModel.findById(result.userId)

    expect(user?.role).toBe('LIBRARIAN')
    expect(user?.status).toBe('PENDING_VERIFICATION')
    expect(user?.emailVerifiedAt).toBeNull()
    expect(user?.libraryId?.toString()).toBe(
      libraryA.toString(),
    )

    const record = await StaffPermissionsModel.findOne({
      userId: user?._id,
      libraryId: libraryA,
    })

    expect(record?.permissions).toEqual(['students.read'])
    expect(emailMock).toHaveBeenCalledOnce()
  })

  it('activates an invited librarian and sets their password', async () => {
    const result = await invite()
    const token = invitationToken()

    await acceptStaffInvitation(token, password)

    const user = await UserModel.findById(result.userId)
      .select('+passwordHash')

    expect(user?.status).toBe('ACTIVE')
    expect(user?.emailVerifiedAt).toBeInstanceOf(Date)

    expect(
      await verifyPassword(password, user!.passwordHash),
    ).toBe(true)
  })

  it('rejects invitation replay', async () => {
    await invite()
    const token = invitationToken()

    await acceptStaffInvitation(token, password)

    await expect(
      acceptStaffInvitation(token, password),
    ).rejects.toMatchObject({
      statusCode: 400,
    })
  })

  it('rejects an expired invitation', async () => {
    const result = await invite()
    const token = invitationToken()

    await StaffInvitationModel.updateOne(
      { userId: result.userId },
      {
        $set: {
          expiresAt: new Date(Date.now() - 1000),
        },
      },
    )

    await expect(
      acceptStaffInvitation(token, password),
    ).rejects.toMatchObject({
      statusCode: 400,
    })
  })

  it('rejects duplicate staff email invitations', async () => {
    await invite()

    await expect(
      invite(libraryB, 'staff@example.com'),
    ).rejects.toMatchObject({
      statusCode: 409,
    })
  })

  it('prevents cross-tenant permission changes', async () => {
    const result = await invite(libraryA)

    await expect(
      changeStaffPermissions(
        ownerId.toString(),
        libraryB.toString(),
        result.userId,
        ['students.update'],
      ),
    ).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('updates permissions within the correct tenant', async () => {
    const result = await invite()

    await changeStaffPermissions(
      ownerId.toString(),
      libraryA.toString(),
      result.userId,
      ['students.read', 'students.update'],
    )

    const record = await StaffPermissionsModel.findOne({
      userId: result.userId,
      libraryId: libraryA,
    })

    expect(record?.permissions).toEqual([
      'students.read',
      'students.update',
    ])
  })

  it('prevents activating an invitation that was not accepted', async () => {
    const result = await invite()

    await expect(
      changeStaffStatus(
        libraryA.toString(),
        result.userId,
        'ACTIVE',
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
    })
  })

  it('suspends staff and revokes their active sessions', async () => {
    const result = await invite()
    await acceptStaffInvitation(invitationToken(), password)

    const session = await RefreshSessionModel.create({
      userId: new mongoose.Types.ObjectId(result.userId),
      familyId: new mongoose.Types.ObjectId(),
      tokenHash: 'a'.repeat(64),
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: null,
      revocationReason: null,
    })

    await changeStaffStatus(
      libraryA.toString(),
      result.userId,
      'SUSPENDED',
    )

    const user = await UserModel.findById(result.userId)
    const storedSession = await RefreshSessionModel.findById(
      session._id,
    )

    expect(user?.status).toBe('SUSPENDED')
    expect(storedSession?.revokedAt).toBeInstanceOf(Date)
    expect(storedSession?.revocationReason).toBe(
      'ACCOUNT_DISABLED',
    )
  })

  it('lists only staff from the requested library', async () => {
    await invite(libraryA, 'staff-a@example.com')
    await invite(libraryB, 'staff-b@example.com')

    const staff = await listStaff(libraryA.toString())

    expect(staff).toHaveLength(1)
    expect(staff[0].email).toBe('staff-a@example.com')
  })
})
