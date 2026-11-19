
import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from './password.service'

describe('Password service', () => {
  const password = 'BookNestTestPassword2026!'

  it('creates an Argon2id hash', async () => {
    const hash = await hashPassword(password)

    expect(hash).toMatch(/^\$argon2id\$/)
    expect(hash).not.toBe(password)
  })

  it('accepts the correct password', async () => {
    const hash = await hashPassword(password)

    // BookNest wrapper: plain password first, hash second.
    expect(await verifyPassword(password, hash)).toBe(true)
  })

  it('rejects the wrong password', async () => {
    const hash = await hashPassword(password)

    expect(
      await verifyPassword('WrongPassword2026!', hash),
    ).toBe(false)
  })
})
