
import { rateLimit } from 'express-rate-limit'

export const registrationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  limit: 5,

  standardHeaders: 'draft-8',

  legacyHeaders: false,

  message: {
    success: false,
    message: 'Too many registration attempts. Please try again later.',
  },
})


export const otpVerificationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many verification attempts. Try again later.',
  },
})


export const otpResendRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many resend requests. Please try again later.',
  },
})


export const forgotPasswordRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: process.env.NODE_ENV === 'production' ? 5 : 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
})

export const resetPasswordRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === 'production' ? 10 : 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
})


export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === 'production' ? 10 : 100,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts. Please try again later.',
  },
})

export const staffInvitationAcceptanceRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === 'production' ? 10 : 100,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many invitation attempts. Please try again later.',
  },
})