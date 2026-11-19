
import type { Response } from 'express'
import type { AuthenticatedUser } from './require-auth.middleware'

export function getAuthenticatedUser(
  res: Response,
): AuthenticatedUser {
  const auth = res.locals.auth as
    | AuthenticatedUser
    | undefined

  if (!auth) {
    throw new Error(
      'Authentication context is missing. Apply requireAuth first.',
    )
  }

  return auth
}
