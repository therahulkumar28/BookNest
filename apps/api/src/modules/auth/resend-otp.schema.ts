
import { z } from 'zod'

export const resendOtpSchema = z.strictObject({
  email: z.email().trim().toLowerCase(),
})

export type ResendOtpInput = z.infer<
  typeof resendOtpSchema
>
