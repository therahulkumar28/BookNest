import { rateLimit } from 'express-rate-limit'

export const staffInvitationAcceptanceRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === 'production' ? 10 : 100,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: 'Too many invitation attempts. Please try again later.' },
})
