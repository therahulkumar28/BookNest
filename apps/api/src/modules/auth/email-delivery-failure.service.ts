import type { Types } from 'mongoose'
import { writeAuthAudit } from './auth-audit.service'

type EmailKind = 'VERIFICATION' | 'PASSWORD_RESET'

/** Best-effort diagnostics. Never persist email addresses, OTPs or SMTP errors. */
export async function recordEmailDeliveryFailure(
  userId: Types.ObjectId,
  kind: EmailKind,
): Promise<void> {
  try {
    await writeAuthAudit({
      userId,
      action: kind === 'VERIFICATION'
        ? 'VERIFICATION_EMAIL_DELIVERY_FAILED'
        : 'PASSWORD_RESET_EMAIL_DELIVERY_FAILED',
    })
  } catch {
    // Logging must never break registration or reveal account existence.
    console.error('Unable to record email delivery failure')
  }
}