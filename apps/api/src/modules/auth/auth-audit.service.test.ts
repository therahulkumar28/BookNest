import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('./auth-audit.model', () => ({
  AUTH_AUDIT_ACTIONS: ['LOGIN_SUCCEEDED', 'LOGIN_REJECTED', 'PASSWORD_RESET_COMPLETED', 'LOGOUT_ALL'],
  AuthAuditModel: { create: vi.fn().mockResolvedValue([]) },
}))

import { AuthAuditModel } from './auth-audit.model'
import { hashAuditSubject, writeAuthAudit } from './auth-audit.service'

describe('authentication audit safety', () => {
  beforeEach(() => vi.clearAllMocks())

  it('normalizes and hashes rejected login subjects', () => {
    expect(hashAuditSubject(' Person@Example.COM ')).toBe(hashAuditSubject('person@example.com'))
    expect(hashAuditSubject('person@example.com')).toMatch(/^[a-f0-9]{64}$/)
  })

  it('stores only allowlisted fields, never raw email or secrets', async () => {
    await writeAuthAudit({ action: 'LOGIN_REJECTED', email: 'person@example.com' })
    const entry = vi.mocked(AuthAuditModel.create).mock.calls[0][0] as Record<string, unknown>[]
    expect(entry[0]).toEqual({
      action: 'LOGIN_REJECTED', userId: null, sessionId: null,
      subjectHash: hashAuditSubject('person@example.com'),
    })
    expect(JSON.stringify(entry)).not.toContain('person@example.com')
  })
})
