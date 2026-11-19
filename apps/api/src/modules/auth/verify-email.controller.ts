
import type {
  Request,
  Response,
  NextFunction,
} from 'express'

import { verifyEmailSchema } from './verify-email.schema'

import {
  verifyOwnerEmail,
  EmailVerificationError,
} from './verify-email.service'

export async function verifyEmailController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = verifyEmailSchema.safeParse(req.body)

  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: 'Invalid verification request',
    })
    return
  }

  try {
    const result = await verifyOwnerEmail(parsed.data)

    res.status(200).json({
      success: true,
      message: 'Email verified successfully',
      data: result,
    })
  } catch (error) {
    if (error instanceof EmailVerificationError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
      })
      return
    }

    next(error)
  }
}
