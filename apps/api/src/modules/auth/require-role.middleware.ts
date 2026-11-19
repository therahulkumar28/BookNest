
import type {
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from 'express'

import type {
  AccessTokenRole,
} from './access-token.service'

import type {
  AuthenticatedUser,
} from './require-auth.middleware'

export function requireRole(
  ...allowedRoles: AccessTokenRole[]
): RequestHandler {
  if (allowedRoles.length === 0) {
    throw new Error(
      'requireRole must specify at least one allowed role',
    )
  }

  return (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    const auth = res.locals.auth as
      | AuthenticatedUser
      | undefined

    // Fail closed if requireAuth was not applied.
    if (!auth) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
      })
      return
    }

    if (!allowedRoles.includes(auth.role)) {
      res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
      })
      return
    }

    next()
  }
}
