import { Router } from 'express'
import { staffInvitationAcceptanceRateLimiter } from './staff-invitation-rate-limit'
import mongoose from 'mongoose'
import { z } from 'zod'
import { requireAuth } from '../auth/require-auth.middleware'
import { requireRole } from '../auth/require-role.middleware'
import { requireSubscription } from '../auth/require-subscription.middleware'
import { getAuthenticatedUser } from '../auth/auth-context'
import { PERMISSIONS } from './permissions'
import { inviteStaff, acceptStaffInvitation, listStaff, changeStaffPermissions, changeStaffStatus, resendStaffInvitation, StaffError } from './staff.service'

export const staffRouter = Router()
const permissionsSchema = z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length).transform((items) => [...new Set(items)])
const inviteSchema = z.strictObject({ fullName: z.string().trim().min(2).max(120), email: z.email().trim().toLowerCase(), permissions: permissionsSchema })
const acceptSchema = z.strictObject({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/), password: z.string().min(12).max(128) })
const permissionSchema = z.strictObject({ permissions: permissionsSchema })
const statusSchema = z.strictObject({ status: z.enum(['ACTIVE', 'SUSPENDED']) })

function handle(error: unknown, res: import('express').Response, next: import('express').NextFunction) {
  if (error instanceof z.ZodError) { res.status(400).json({ success: false, message: 'Invalid request', details: error.issues }); return }
  if (error instanceof StaffError) { res.status(error.statusCode).json({ success: false, message: error.message }); return }
  next(error)
}
function validStaffId(value: unknown): value is string { return typeof value === 'string' && mongoose.isObjectIdOrHexString(value) }

// Public setup is guarded by a cryptographically random single-use invitation token.
staffRouter.post('/accept-invitation', staffInvitationAcceptanceRateLimiter, async (req, res, next) => {
  try { const body = acceptSchema.parse(req.body); await acceptStaffInvitation(body.token, body.password); res.status(200).json({ success: true }) }
  catch (error) { handle(error, res, next) }
})

staffRouter.use(requireAuth, requireRole('LIBRARY_OWNER'), requireSubscription('MANAGE_LIBRARY'))
staffRouter.post('/', async (req, res, next) => {
  try { const body = inviteSchema.parse(req.body); const auth = getAuthenticatedUser(res)
    if (!auth.libraryId) { res.status(403).json({ success: false, message: 'Library assignment required' }); return }
    const data = await inviteStaff(auth.userId, auth.libraryId, body.fullName, body.email, body.permissions)
    res.status(201).json({ success: true, data })
  } catch (error) { handle(error, res, next) }
})
staffRouter.get('/', async (_req, res, next) => {
  try { const auth = getAuthenticatedUser(res)
    if (!auth.libraryId) { res.status(403).json({ success: false, message: 'Library assignment required' }); return }
    res.json({ success: true, data: await listStaff(auth.libraryId) })
  } catch (error) { handle(error, res, next) }
})
staffRouter.patch('/:id/permissions', async (req, res, next) => {
  try { if (!validStaffId(req.params.id)) { res.status(400).json({ success: false, message: 'Invalid staff ID' }); return }
    const body = permissionSchema.parse(req.body); const auth = getAuthenticatedUser(res)
    if (!auth.libraryId) { res.status(403).json({ success: false, message: 'Library assignment required' }); return }
    await changeStaffPermissions(auth.userId, auth.libraryId, req.params.id, body.permissions)
    res.json({ success: true })
  } catch (error) { handle(error, res, next) }
})
staffRouter.patch('/:id/status', async (req, res, next) => {
  try { if (!validStaffId(req.params.id)) { res.status(400).json({ success: false, message: 'Invalid staff ID' }); return }
    const body = statusSchema.parse(req.body); const auth = getAuthenticatedUser(res)
    if (!auth.libraryId) { res.status(403).json({ success: false, message: 'Library assignment required' }); return }
    await changeStaffStatus(auth.libraryId, req.params.id, body.status, auth.userId)
    res.json({ success: true })
  } catch (error) { handle(error, res, next) }
})

staffRouter.post('/:id/resend-invitation', async (req, res, next) => {
  try {
    if (!validStaffId(req.params.id)) { res.status(400).json({ success: false, message: 'Invalid staff ID' }); return }
    const auth = getAuthenticatedUser(res)
    if (!auth.libraryId) { res.status(403).json({ success: false, message: 'Library assignment required' }); return }
    const data = await resendStaffInvitation(auth.userId, auth.libraryId, req.params.id)
    res.json({ success: true, data })
  } catch (error) { handle(error, res, next) }
})
