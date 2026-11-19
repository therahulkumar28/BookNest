import mongoose from 'mongoose'
import type { Request, Response, NextFunction } from 'express'
import { getAuthenticatedUser } from './auth-context'
import { clearRefreshCookie } from './refresh-cookie'
import { logoutAllSessions } from './logout-all.service'

export async function logoutAllController(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const auth = getAuthenticatedUser(res)
    await logoutAllSessions(new mongoose.Types.ObjectId(auth.userId))
    clearRefreshCookie(res)
    res.status(200).json({ success: true, message: 'Logged out from all devices' })
  } catch (error) {
    next(error)
  }
}
