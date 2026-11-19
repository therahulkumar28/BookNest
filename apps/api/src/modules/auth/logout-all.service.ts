import mongoose, { type Types } from 'mongoose'
import { RefreshSessionModel } from './refresh-session.model'
import { lockAuthSession } from './lock-auth-session.service'

/** Revokes every active session, across all devices and token families. */
export async function logoutAllSessions(userId: Types.ObjectId): Promise<number> {
  return mongoose.connection.transaction(async (session) => {
    await lockAuthSession(userId, session)
    const result = await RefreshSessionModel.updateMany(
      { userId, revokedAt: null },
      { $set: { revokedAt: new Date(), revocationReason: 'LOGOUT_ALL' } },
      { session },
    )
    return result.modifiedCount
  })
}
