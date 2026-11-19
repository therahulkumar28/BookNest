import { createHash } from 'node:crypto'
import type { ClientSession, Types } from 'mongoose'
import { AuthAuditModel, AUTH_AUDIT_ACTIONS } from './auth-audit.model'

type Action = (typeof AUTH_AUDIT_ACTIONS)[number]
type AuditInput = {
  action: Action
  userId?: Types.ObjectId
  sessionId?: Types.ObjectId
  email?: string
}

export function hashAuditSubject(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex')
}

export async function writeAuthAudit(
  { action, userId, sessionId, email }: AuditInput,
  session?: ClientSession,
): Promise<void> {
  const entry = {
    action, userId: userId ?? null, sessionId: sessionId ?? null,
    subjectHash: email ? hashAuditSubject(email) : null,
  }
  await AuthAuditModel.create([entry], session ? { session } : {})
}
