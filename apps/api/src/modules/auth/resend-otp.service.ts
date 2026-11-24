
import { recordEmailDeliveryFailure } from './email-delivery-failure.service'

import { UserModel } from './user.model'

import { issueEmailOtp } from './issue-email-otp.service'

import { sendVerificationOtpEmail } from '../email/email.service'

import type { ResendOtpInput } from './resend-otp.schema'

export async function resendVerificationOtp(
  input: ResendOtpInput,
): Promise<void> {
  const user = await UserModel.findOne({
    email: input.email,
    role: 'LIBRARY_OWNER',
    emailVerifiedAt: null,
    status: 'PENDING_VERIFICATION',
  })

  // Generic response prevents account enumeration.
  if (!user) return

  const otp = await issueEmailOtp(
    user._id,
    'VERIFY_EMAIL',
  )

  // Cooldown active or another request won the race.
  if (!otp) return

  try {
    await sendVerificationOtpEmail(user.email, otp)
  } catch {
    await recordEmailDeliveryFailure(user._id, 'VERIFICATION')
  }
}
