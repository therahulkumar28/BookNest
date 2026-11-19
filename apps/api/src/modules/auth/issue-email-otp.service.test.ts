
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'

import { EmailOtpModel } from './email-otp.model'
import { issueEmailOtp } from './issue-email-otp.service'

let mongoServer: MongoMemoryServer

const userId = new mongoose.Types.ObjectId()
const purpose = 'VERIFY_EMAIL' as const

beforeAll(async () => {
  process.env.OTP_SECRET =
    'booknest-test-otp-secret-at-least-32-characters'

  mongoServer = await MongoMemoryServer.create()

  await mongoose.connect(mongoServer.getUri())

  // Ensure unique indexes exist before concurrency tests.
  await EmailOtpModel.init()
}, 120_000)

afterAll(async () => {
  await mongoose.disconnect()
  if (mongoServer) await mongoServer.stop()
})

beforeEach(async () => {
  await EmailOtpModel.deleteMany({})
})

describe('Atomic OTP issuance', () => {
  it('creates an OTP for the first request', async () => {
    const otp = await issueEmailOtp(userId, purpose)

    expect(otp).toMatch(/^\d{6}$/)

    const records = await EmailOtpModel.find({
      userId,
      purpose,
    })

    expect(records).toHaveLength(1)
  })

  it('blocks a request during the 60-second cooldown', async () => {
    const first = await issueEmailOtp(userId, purpose)
    const second = await issueEmailOtp(userId, purpose)

    expect(first).toMatch(/^\d{6}$/)
    expect(second).toBeNull()
  })

  it('allows only one concurrent first issuance', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        issueEmailOtp(userId, purpose),
      ),
    )

    const successful = results.filter(
      (otp) => otp !== null,
    )

    expect(successful).toHaveLength(1)

    const count = await EmailOtpModel.countDocuments({
      userId,
      purpose,
    })

    expect(count).toBe(1)
  })

  it('allows only one concurrent replacement', async () => {
    await issueEmailOtp(userId, purpose)

    await EmailOtpModel.updateOne(
      { userId, purpose },
      {
        $set: {
          lastIssuedAt: new Date(
            Date.now() - 61_000,
          ),
        },
      },
    )

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        issueEmailOtp(userId, purpose),
      ),
    )

    const successful = results.filter(
      (otp) => otp !== null,
    )

    expect(successful).toHaveLength(1)

    const count = await EmailOtpModel.countDocuments({
      userId,
      purpose,
    })

    expect(count).toBe(1)
  })

  it('allows issuance after TTL record deletion', async () => {
    await issueEmailOtp(userId, purpose)

    await EmailOtpModel.deleteMany({
      userId,
      purpose,
    })

    const otp = await issueEmailOtp(userId, purpose)

    expect(otp).toMatch(/^\d{6}$/)
  })
})
