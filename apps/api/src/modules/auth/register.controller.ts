
import type {
  Request,
  Response,
  NextFunction,
} from 'express'

import { registerOwnerSchema } from './register.schema'
import {
  registerOwner,
  RegistrationError,
} from './register.service'

export async function registerOwnerController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = registerOwnerSchema.safeParse(req.body)

  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: 'Invalid registration details',
      errors: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    })
    return
  }

  try {
    const result = await registerOwner(parsed.data)

    res.status(201).json({
      success: true,
      message: 'Registration successful. Email verification is required.',
      data: result,
    })
  } catch (error) {
    if (error instanceof RegistrationError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
      })
      return
    }

    next(error)
  }
}
