
import { Router } from 'express'

import {
  registerOwnerController,
} from './register.controller'

import {
  registrationRateLimiter,
} from './auth-rate-limit'

import {
  verifyEmailController,
} from './verify-email.controller'

import {
  otpVerificationRateLimiter,
} from './auth-rate-limit'

import {
  resendOtpController,
} from './resend-otp.controller'

import {
  otpResendRateLimiter,
} from './auth-rate-limit'

import {
  forgotPasswordController,
  resetPasswordController,
} from './password-reset.controller'

import {
  forgotPasswordRateLimiter,
  resetPasswordRateLimiter,
} from './auth-rate-limit'

import { loginController } from './login.controller'
import { loginRateLimiter } from './auth-rate-limit'

import { requireAuth } from './require-auth.middleware'
import { meController } from './me.controller'

import { refreshController } from './refresh.controller'
import { requireRefreshCsrf } from './require-refresh-csrf.middleware'
import { logoutController } from './logout.controller'
import { logoutAllController } from './logout-all.controller'

export const authRouter = Router()

authRouter.post(
  '/register',
  registrationRateLimiter,
  registerOwnerController,
)
authRouter.post(
  '/verify-email',
  otpVerificationRateLimiter,
  verifyEmailController,
)

authRouter.post(
  '/resend-otp',
  otpResendRateLimiter,
  resendOtpController,
)

authRouter.post(
  '/forgot-password',
  forgotPasswordRateLimiter,
  forgotPasswordController,
)

authRouter.post(
  '/reset-password',
  resetPasswordRateLimiter,
  resetPasswordController,
)
authRouter.post(
  '/login',
  loginRateLimiter,
  loginController,
)

authRouter.get(
  '/me',
  requireAuth,
  meController,
)

authRouter.post(
  '/refresh',
  requireRefreshCsrf,
  refreshController,
)

authRouter.post(
  '/logout',
  requireRefreshCsrf,
  logoutController,
)

// Bearer-authenticated; no refresh cookie required (e.g. lost device).
authRouter.post(
  '/logout-all',
  requireAuth,
  logoutAllController,
)
