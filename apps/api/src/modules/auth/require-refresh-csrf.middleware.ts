
import type {
  Request,
  Response,
  NextFunction,
} from 'express'

export function requireRefreshCsrf(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const allowedOrigin = process.env.WEB_ORIGIN

  if (!allowedOrigin) {
    next(new Error('WEB_ORIGIN is not configured'))
    return
  }

  const origin = req.headers.origin

  // Browser requests must originate from our configured frontend.
  if (!origin || origin !== allowedOrigin) {
    res.status(403).json({
      success: false,
      message: 'Request origin not allowed',
    })
    return
  }

  // A custom header forces cross-origin browser requests
  // through CORS preflight.
  if (req.headers['x-booknest-request'] !== '1') {
    res.status(403).json({
      success: false,
      message: 'CSRF validation failed',
    })
    return
  }

  next()
}
