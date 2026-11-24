import mongoose from 'mongoose'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./auth-audit.service', () => ({ writeAuthAudit: vi.fn() }))
import { writeAuthAudit } from './auth-audit.service'
import { recordEmailDeliveryFailure } from './email-delivery-failure.service'

const audit = vi.mocked(writeAuthAudit)
const userId = new mongoose.Types.ObjectId()

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Safe email delivery failure audit', () => {
  it('records a verification failure without OTP or email', async () => {
    await recordEmailDeliveryFailure(userId, 'VERIFICATION')
    expect(audit).toHaveBeenCalledWith({
      userId, action: 'VERIFICATION_EMAIL_DELIVERY_FAILED',
    })
    expect(Object.keys(audit.mock.calls[0][0]).sort()).toEqual(['action', 'userId'])
  })

  it('records a password reset delivery failure', async () => {
    await recordEmailDeliveryFailure(userId, 'PASSWORD_RESET')
    expect(audit).toHaveBeenCalledWith({
      userId, action: 'PASSWORD_RESET_EMAIL_DELIVERY_FAILED',
    })
  })

  it('does not fail the customer request when audit storage is down', async () => {
    audit.mockRejectedValueOnce(new Error('database down'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(recordEmailDeliveryFailure(userId, 'VERIFICATION')).resolves.toBeUndefined()
      expect(spy).toHaveBeenCalledWith('Unable to record email delivery failure')
    } finally {
      spy.mockRestore()
    }
  })
})