
import {
  randomInt,
  createHmac,
  timingSafeEqual,
} from 'node:crypto'

const OTP_LENGTH = 6
const OTP_EXPIRY_MINUTES = 5

function getOtpSecret(): string {
  const secret = process.env.OTP_SECRET

  if (!secret || secret.length < 32) {
    throw new Error(
      'OTP_SECRET must contain at least 32 characters',
    )
  }

  return secret
}

export function generateEmailOtp(): string {
  return randomInt(
    0,
    10 ** OTP_LENGTH,
  )
    .toString()
    .padStart(OTP_LENGTH, '0')
}

export function hashEmailOtp(
  userId: string,
  purpose: string,
  otp: string,
): string {
  return createHmac('sha256', getOtpSecret())
    .update(`${userId}:${purpose}:${otp}`)
    .digest('hex')
}

export function verifyEmailOtpHash(
  userId: string,
  purpose: string,
  otp: string,
  storedHash: string,
): boolean {
  const expectedHash = hashEmailOtp(
    userId,
    purpose,
    otp,
  )

  const expected = Buffer.from(expectedHash, 'hex')
  const stored = Buffer.from(storedHash, 'hex')

  if (expected.length !== stored.length) {
    return false
  }

  return timingSafeEqual(expected, stored)
}

export function getEmailOtpExpiry(): Date {
  return new Date(
    Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000,
  )
}
