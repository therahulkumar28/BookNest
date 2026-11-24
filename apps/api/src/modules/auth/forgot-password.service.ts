
import { recordEmailDeliveryFailure } from './email-delivery-failure.service'

import { UserModel } from './user.model'

import { issueEmailOtp } from './issue-email-otp.service'

import { sendPasswordResetOtpEmail } from '../email/email.service'

import type { ForgotPasswordInput } from './forgot-password.schema'

export async function requestPasswordReset(
  input: ForgotPasswordInput,
): Promise<void> {
  const user = await UserModel.findOne({
    email: input.email,
    emailVerifiedAt: { $ne: null },
    status: 'ACTIVE',
  })

  // Do not reveal whether the account exists.
  if (!user) return

  const otp = await issueEmailOtp(
    user._id,
    'RESET_PASSWORD',
  )

  if (!otp) return

  try {
    await sendPasswordResetOtpEmail(user.email, otp)
  } catch {
    await recordEmailDeliveryFailure(user._id, 'PASSWORD_RESET')
  }
}
