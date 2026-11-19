
import mongoose from 'mongoose'
import type {
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from 'express'

import type { AccessTokenPayload } from './access-token.service'

/**
 * Enforces tenant isolation for library-scoped routes.
 *
 * Use after requireAuth.
 * The library ID must come from the authenticated route
 * parameter, never from a client-supplied permission claim.
 */
export function requireTenant(
  parameterName = 'libraryId',
): RequestHandler {
  return (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    const auth = res.locals.auth as
      | AccessTokenPayload
      | undefined

    if (!auth) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
      })
      return
    }

    // Platform admins use separate administration endpoints.
    // Do not silently bypass tenant isolation here.
    if (auth.role === 'PLATFORM_ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Tenant access denied',
      })
      return
    }

    const requestedLibraryId = req.params[parameterName]

    if (
      typeof requestedLibraryId !== 'string' ||
      !mongoose.isObjectIdOrHexString(requestedLibraryId)
    ) {
      res.status(400).json({
        success: false,
        message: 'Invalid library ID',
      })
      return
    }

    if (
      !auth.libraryId ||
      auth.libraryId.toLowerCase() !==
        requestedLibraryId.toLowerCase()
    ) {
      res.status(403).json({
        success: false,
        message: 'Tenant access denied',
      })
      return
    }

    res.locals.libraryId = auth.libraryId

    next()
  }
}

