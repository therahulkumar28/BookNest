
import type { Request, Response } from 'express'

export const REFRESH_COOKIE_NAME = 'booknest_refresh'
export const REFRESH_COOKIE_PATH = '/api/v1/auth'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export function getRefreshCookie(req: Request): string | null {
  const rawCookie = req.headers.cookie

  if (!rawCookie) return null

  const prefix = `${REFRESH_COOKIE_NAME}=`

  const entry = rawCookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))

  if (!entry) return null

  const value = entry.slice(prefix.length)

  return value || null
}

export function setRefreshCookie(
  res: Response,
  refreshToken: string,
): void {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    maxAge: SEVEN_DAYS_MS,
  })
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
  })
}
