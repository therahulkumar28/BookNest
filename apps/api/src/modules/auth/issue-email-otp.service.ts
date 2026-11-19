
import mongoose from 'mongoose'

import { EmailOtpModel } from './email-otp.model'

import {
  generateEmailOtp,
  hashEmailOtp,
  getEmailOtpExpiry,
} from './email-otp.service'

import { EMAIL_OTP_PURPOSES } from './email-otp.model'

type OtpPurpose = (typeof EMAIL_OTP_PURPOSES)[number]

const COOLDOWN_MS = 60_000

export async function issueEmailOtp(
  userId: mongoose.Types.ObjectId,
  purpose: OtpPurpose,
): Promise<string | null> {
  const now = new Date()
  const threshold = new Date(
    now.getTime() - COOLDOWN_MS,
  )

  const otp = generateEmailOtp()
  const otpHash = hashEmailOtp(
    userId.toString(),
    purpose,
    otp,
  )

  const replacement = {
    otpHash,
    expiresAt: getEmailOtpExpiry(),
    attempts: 0,
    consumedAt: null,
    lastIssuedAt: now,
  }

  // Atomic compare-and-update.
  // Older records may not yet have lastIssuedAt.
  const updated = await EmailOtpModel.findOneAndUpdate(
    {
      userId,
      purpose,
      $or: [
        { lastIssuedAt: { $lte: threshold } },
        {
          lastIssuedAt: { $exists: false },
          createdAt: { $lte: threshold },
        },
      ],
    },
    { $set: replacement },
    { new: true },
  )

  if (updated) {
    return otp
  }

  // The record might be absent (first request or TTL cleanup).
  // A unique compound index prevents concurrent duplicate inserts.
  try {
    await EmailOtpModel.create({
      userId,
      purpose,
      ...replacement,
    })

    return otp
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 11000
    ) {
      // Another request already created the OTP.
      // Do not send this request's unused code.
      return null
    }

    throw error
  }
}
