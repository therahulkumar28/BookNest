import type { ClientSession, Types } from 'mongoose'
import { UserModel } from './user.model'

/**
 * Serialize session changes for the same user.
 *
 * Every refresh, logout, and password-reset transaction
 * must write the same user document.
 */
export async function lockAuthSession(
  userId: Types.ObjectId,
  session: ClientSession,
): Promise<void> {
  // UserModel disables Mongoose's version key, so bypass schema update casting.
  const result = await UserModel.collection.updateOne(
    { _id: userId },
    { $inc: { __v: 1 } },
    { session },
  )

  if (result.matchedCount !== 1) {
    throw new Error('Authentication user not found')
  }
}