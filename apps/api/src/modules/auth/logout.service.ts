
import mongoose from 'mongoose'

import { RefreshSessionModel } from './refresh-session.model'
import { hashRefreshToken } from './refresh-token.service'
import { lockAuthSession } from './lock-auth-session.service'

export async function logoutSession(
  refreshToken: string | null,
): Promise<void> {
  if (
    !refreshToken ||
    !/^[A-Za-z0-9_-]{43}$/.test(refreshToken)
  ) {
    return
  }

  const tokenHash = hashRefreshToken(refreshToken)

  const tokenSession = await RefreshSessionModel.findOne({
    tokenHash,
  })

  if (!tokenSession) {
    return
  }

  await mongoose.connection.transaction(async (session) => {
    await lockAuthSession(tokenSession.userId, session)

    await RefreshSessionModel.updateMany(
      {
        familyId: tokenSession.familyId,
        revokedAt: null,
      },
      {
        $set: {
          revokedAt: new Date(),
          revocationReason: 'LOGOUT',
        },
      },
      { session },
    )
  })
}
