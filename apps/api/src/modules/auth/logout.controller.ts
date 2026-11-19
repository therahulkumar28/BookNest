
import type {
  Request,
  Response,
  NextFunction,
} from 'express'

import { logoutSession } from './logout.service'

import {
  getRefreshCookie,
  clearRefreshCookie,
} from './refresh-cookie'

export async function logoutController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const refreshToken = getRefreshCookie(req)

    await logoutSession(refreshToken)

    clearRefreshCookie(res)

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    })
  } catch (error) {
    next(error)
  }
}
