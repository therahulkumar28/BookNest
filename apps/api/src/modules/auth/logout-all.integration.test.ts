import mongoose from 'mongoose'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import { UserModel } from './user.model'
import { RefreshSessionModel } from './refresh-session.model'
import { signAccessToken } from './access-token.service'
import { requireAuth } from './require-auth.middleware'
import { logoutAllSessions } from './logout-all.service'
import { logoutAllController } from './logout-all.controller'

let repl: MongoMemoryReplSet
beforeAll(async () => {
  process.env.JWT_ACCESS_SECRET = 'booknest-integration-test-access-secret-2026'
  repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } })
  await mongoose.connect(repl.getUri())
  await Promise.all([UserModel.init(), RefreshSessionModel.init()])
}, 120_000)
afterAll(async () => { await mongoose.disconnect(); await repl?.stop() })
beforeEach(async () => {
  await RefreshSessionModel.deleteMany({})
  await UserModel.deleteMany({})
})
async function seed(email: string, count = 2) {
  const libraryId = new mongoose.Types.ObjectId()
  const user = await UserModel.create({
    fullName: 'Session Owner', email, passwordHash: 'placeholder',
    role: 'LIBRARY_OWNER', libraryId, status: 'ACTIVE', emailVerifiedAt: new Date(),
  })
  const sessions = []
  const tokens = []
  for (let i = 0; i < count; i++) {
    const s = await RefreshSessionModel.create({
      userId: user._id, familyId: new mongoose.Types.ObjectId(),
      tokenHash: `${user._id.toString()}${i.toString(16).padStart(40, '0')}`,
      expiresAt: new Date(Date.now() + 86400000), revokedAt: null,
    })
    sessions.push(s)
    tokens.push(await signAccessToken({
      userId: user._id.toString(), role: 'LIBRARY_OWNER',
      libraryId: libraryId.toString(), sessionId: s._id.toString(),
    }))
  }
  return { user, sessions, tokens }
}
async function authorize(token: string) {
  let code = 200
  let nextCalled = false
  const req = { headers: { authorization: `Bearer ${token}` } } as Request
  const res = {
    locals: {}, status(value: number) { code = value; return this },
    json(_value: unknown) { return this },
  } as unknown as Response
  await requireAuth(req, res, (() => { nextCalled = true }) as NextFunction)
  return { code, nextCalled, req, res }
}
describe('Logout all devices', () => {
  it('revokes all active device families for the user', async () => {
    const a = await seed('a@example.com', 3)
    const b = await seed('b@example.com', 1)
    expect(await logoutAllSessions(a.user._id)).toBe(3)
    const sessions = await RefreshSessionModel.find({ userId: a.user._id })
    expect(sessions).toHaveLength(3)
    expect(sessions.every(s => s.revokedAt instanceof Date && s.revocationReason === 'LOGOUT_ALL')).toBe(true)
    expect((await RefreshSessionModel.findById(b.sessions[0]._id))?.revokedAt).toBeNull()
  })
  it('immediately rejects old access tokens, including other devices', async () => {
    const a = await seed('a@example.com')
    expect((await authorize(a.tokens[0])).nextCalled).toBe(true)
    expect((await authorize(a.tokens[1])).nextCalled).toBe(true)
    await logoutAllSessions(a.user._id)
    for (const token of a.tokens) {
      const result = await authorize(token)
      expect(result.code).toBe(401)
      expect(result.nextCalled).toBe(false)
    }
  })
  it('is idempotent and preserves the original revocation timestamp', async () => {
    const a = await seed('a@example.com', 1)
    expect(await logoutAllSessions(a.user._id)).toBe(1)
    const first = await RefreshSessionModel.findById(a.sessions[0]._id)
    expect(await logoutAllSessions(a.user._id)).toBe(0)
    const second = await RefreshSessionModel.findById(a.sessions[0]._id)
    expect(second?.revokedAt?.getTime()).toBe(first?.revokedAt?.getTime())
  })
  it('requires a valid bearer token before controller invocation', async () => {
    const a = await seed('a@example.com', 1)
    const missing = await authorize('invalid')
    expect(missing.code).toBe(401)
    expect(missing.nextCalled).toBe(false)
    expect((await RefreshSessionModel.findById(a.sessions[0]._id))?.revokedAt).toBeNull()
  })
  it('controller clears refresh cookie after revocation', async () => {
    const a = await seed('a@example.com', 1)
    const auth = await authorize(a.tokens[0])
    expect(auth.nextCalled).toBe(true)
    let status = 0
    let cookieCleared = false
    let nextError: unknown
    const res = {
      locals: auth.res.locals,
      clearCookie(_name: string, _options: unknown) { cookieCleared = true; return this },
      status(value: number) { status = value; return this },
      json(_value: unknown) { return this },
    } as unknown as Response
    await logoutAllController(auth.req, res, ((error: unknown) => { nextError = error }) as NextFunction)
    expect(nextError).toBeUndefined()
    expect(status).toBe(200)
    expect(cookieCleared).toBe(true)
    expect((await RefreshSessionModel.findById(a.sessions[0]._id))?.revocationReason).toBe('LOGOUT_ALL')
  })
})
