
import { z } from 'zod'

export const forgotPasswordSchema = z.strictObject({
  email: z.email().trim().toLowerCase(),
})

export type ForgotPasswordInput = z.infer<
  typeof forgotPasswordSchema
>
