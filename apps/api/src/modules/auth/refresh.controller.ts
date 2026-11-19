
import type {
  Request,
  Response,
  NextFunction,
} from 'express'

import {
  rotateRefreshSession,
  RefreshSessionError,
} from './rotate-refresh-session.service'

import {
  getRefreshCookie,
  setRefreshCookie,
  clearRefreshCookie,
} from './refresh-cookie'

export async function refreshController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const refreshToken = getRefreshCookie(req)

  if (!refreshToken) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
    })
    return
  }

  try {
    const result = await rotateRefreshSession(refreshToken)

    setRefreshCookie(res, result.refreshToken)

    res.status(200).json({
      success: true,
      data: {
        accessToken: result.accessToken,
        user: result.user,
      },
    })
  } catch (error) {
    if (error instanceof RefreshSessionError) {
      clearRefreshCookie(res)

      res.status(401).json({
        success: false,
        message: 'Invalid or expired session',
      })
      return
    }

    next(error)
  }
}
