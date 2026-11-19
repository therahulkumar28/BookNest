
import type { Request, Response, NextFunction } from 'express'
import { forgotPasswordSchema } from './forgot-password.schema'
import { resetPasswordSchema } from './reset-password.schema'
import { requestPasswordReset } from './forgot-password.service'
import {
  resetPassword,
  PasswordResetError,
} from './reset-password.service'

export async function forgotPasswordController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = forgotPasswordSchema.safeParse(req.body)

  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: 'Invalid email address',
    })
    return
  }

  try {
    await requestPasswordReset(parsed.data)

    res.status(200).json({
      success: true,
      message:
        'If the account is eligible, a password reset code will be sent.',
    })
  } catch (error) {
    next(error)
  }
}

export async function resetPasswordController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = resetPasswordSchema.safeParse(req.body)

  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: 'Invalid reset request',
    })
    return
  }

  try {
    await resetPassword(parsed.data)

    res.status(200).json({
      success: true,
      message: 'Password reset successfully',
    })
  } catch (error) {
    if (error instanceof PasswordResetError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
      })
      return
    }

    next(error)
  }
}
