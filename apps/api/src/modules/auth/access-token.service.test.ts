
import { beforeAll, describe, expect, it } from 'vitest'
import {
  signAccessToken,
  verifyAccessToken,
} from './access-token.service'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET =
    'booknest-test-secret-with-at-least-32-characters'
})

describe('Access token service', () => {
  const payload = {
    userId: '507f1f77bcf86cd799439011',
    role: 'LIBRARY_OWNER' as const,
    libraryId: '507f191e810c19729de860ea',
    sessionId: '507f1f77bcf86cd799439012',
  }

  it('signs and verifies a token', async () => {
    const token = await signAccessToken(payload)
    const verified = await verifyAccessToken(token)

    expect(verified).toEqual(payload)
  })

  it('rejects a tampered token', async () => {
    const token = await signAccessToken(payload)
    const parts = token.split('.')

    const modifiedPayload =
      (parts[1][0] === 'A' ? 'B' : 'A') +
      parts[1].slice(1)

    const tampered = [
      parts[0],
      modifiedPayload,
      parts[2],
    ].join('.')

    await expect(
      verifyAccessToken(tampered),
    ).rejects.toThrow()
  })

  it('rejects a malformed token', async () => {
    await expect(
      verifyAccessToken('invalid-token'),
    ).rejects.toThrow()
  })
})
