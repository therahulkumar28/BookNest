
import type { Request, Response } from 'express'
import { getAuthenticatedUser } from './auth-context'

export function meController(
  _req: Request,
  res: Response,
): void {
  const auth = getAuthenticatedUser(res)

  res.status(200).json({
    success: true,
    data: {
      userId: auth.userId,
      role: auth.role,
      libraryId: auth.libraryId,
    },
  })
}
