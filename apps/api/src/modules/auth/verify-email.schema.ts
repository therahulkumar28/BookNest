
import { z } from 'zod'

export const verifyEmailSchema = z.strictObject({
  email: z.email().trim().toLowerCase(),

  otp: z.string().regex(
    /^\d{6}$/,
    'OTP must contain exactly 6 digits',
  ),
})

export type VerifyEmailInput = z.infer<
  typeof verifyEmailSchema
>
