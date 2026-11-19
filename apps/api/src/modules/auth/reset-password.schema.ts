
import { z } from 'zod'

export const resetPasswordSchema = z.strictObject({
  email: z.email().trim().toLowerCase(),

  otp: z.string().regex(/^\d{6}$/),

  newPassword: z.string().min(
    12,
    'Password must contain at least 12 characters',
  ),
})

export type ResetPasswordInput = z.infer<
  typeof resetPasswordSchema
>
