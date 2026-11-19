import type { RequestHandler } from 'express'
import type { Permission } from '../staff/permissions'
import { StaffPermissionsModel } from '../staff/staff-permissions.model'
import type { AuthenticatedUser } from './require-auth.middleware'

export function requirePermission(permission: Permission): RequestHandler {
  return async (_req, res, next) => {
    const auth = res.locals.auth as AuthenticatedUser | undefined
    if (!auth) { res.status(401).json({ success: false, message: 'Authentication required' }); return }
    if (!auth.libraryId || auth.role === 'PLATFORM_ADMIN') {
      res.status(403).json({ success: false, message: 'Permission denied' }); return
    }
    if (auth.role === 'LIBRARY_OWNER') { next(); return }
    if (auth.role !== 'LIBRARIAN') {
      res.status(403).json({ success: false, message: 'Permission denied' }); return
    }
    try {
      const exists = await StaffPermissionsModel.exists({ userId: auth.userId, libraryId: auth.libraryId, permissions: permission })
      if (!exists) { res.status(403).json({ success: false, message: 'Permission denied' }); return }
      next()
    } catch (error) { next(error) }
  }
}
