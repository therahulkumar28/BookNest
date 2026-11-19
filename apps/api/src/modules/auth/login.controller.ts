
import type {
  Request,
  Response,
  NextFunction,
} from 'express'

import { loginSchema } from './login.schema'
import { createLoginSession } from './login-session.service'
import { LoginError } from './login.service'
import { setRefreshCookie } from './refresh-cookie'

const REFRESH_COOKIE_NAME = 'booknest_refresh'

export async function loginController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = loginSchema.safeParse(req.body)

  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: 'Invalid login request',
    })
    return
  }

  try {
    const result = await createLoginSession(parsed.data)

    setRefreshCookie(res, result.refreshToken)

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        accessToken: result.accessToken,
        user: result.user,
      },
    })
  } catch (error) {
    if (error instanceof LoginError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
      })
      return
    }

    next(error)
  }
}
