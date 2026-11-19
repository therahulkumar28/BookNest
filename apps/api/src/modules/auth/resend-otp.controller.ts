
import type {
  Request,
  Response,
  NextFunction,
} from 'express'

import { resendOtpSchema } from './resend-otp.schema'
import { resendVerificationOtp } from './resend-otp.service'

export async function resendOtpController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = resendOtpSchema.safeParse(req.body)

  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: 'Invalid email address',
    })
    return
  }

  try {
    await resendVerificationOtp(parsed.data)

    res.status(200).json({
      success: true,
      message:
        'If the account requires verification, a new code will be sent when eligible.',
    })
  } catch (error) {
    next(error)
  }
}
