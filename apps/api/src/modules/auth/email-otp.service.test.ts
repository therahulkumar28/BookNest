
import { beforeAll, describe, expect, it } from 'vitest'

import {
  generateEmailOtp,
  hashEmailOtp,
  verifyEmailOtpHash,
  getEmailOtpExpiry,
} from './email-otp.service'

beforeAll(() => {
  process.env.OTP_SECRET =
    'booknest-test-otp-secret-at-least-32-characters'
})

describe('Email OTP service', () => {
  const userId = '507f1f77bcf86cd799439011'
  const purpose = 'VERIFY_EMAIL'

  it('generates a six-digit OTP', () => {
    for (let i = 0; i < 100; i++) {
      expect(generateEmailOtp()).toMatch(/^\d{6}$/)
    }
  })

  it('hashes the OTP without storing its plaintext', () => {
    const otp = '012345'
    const hash = hashEmailOtp(userId, purpose, otp)

    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    expect(hash).not.toBe(otp)
  })

  it('accepts the correct OTP', () => {
    const hash = hashEmailOtp(userId, purpose, '123456')

    expect(
      verifyEmailOtpHash(userId, purpose, '123456', hash),
    ).toBe(true)
  })

  it('rejects an incorrect OTP', () => {
    const hash = hashEmailOtp(userId, purpose, '123456')

    expect(
      verifyEmailOtpHash(userId, purpose, '654321', hash),
    ).toBe(false)
  })

  it('prevents OTP reuse across purposes and users', () => {
    const hash = hashEmailOtp(userId, purpose, '123456')

    expect(
      verifyEmailOtpHash(
        userId,
        'RESET_PASSWORD',
        '123456',
        hash,
      ),
    ).toBe(false)

    expect(
      verifyEmailOtpHash(
        '507f1f77bcf86cd799439099',
        purpose,
        '123456',
        hash,
      ),
    ).toBe(false)
  })

  it('rejects an invalid stored hash', () => {
    expect(
      verifyEmailOtpHash(userId, purpose, '123456', 'invalid'),
    ).toBe(false)
  })

  it('expires approximately five minutes later', () => {
    const before = Date.now()
    const expiry = getEmailOtpExpiry().getTime()
    const after = Date.now()

    expect(expiry).toBeGreaterThanOrEqual(before + 300000)
    expect(expiry).toBeLessThanOrEqual(after + 300000)
  })
})
