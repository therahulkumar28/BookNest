import mongoose from 'mongoose'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'

import {
  PlatformAdminBootstrapModel,
} from './platform-admin-bootstrap.model'

let replicaSet: MongoMemoryReplSet

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
  })

  await mongoose.connect(replicaSet.getUri())
  await PlatformAdminBootstrapModel.init()
}, 120_000)

afterAll(async () => {
  await mongoose.disconnect()
  await replicaSet?.stop()
})

beforeEach(async () => {
  await PlatformAdminBootstrapModel.deleteMany({})
})

describe('Platform Admin bootstrap claim', () => {
  it('permits the first bootstrap claim', async () => {
    const record = await PlatformAdminBootstrapModel.create({
      _id: 'INITIAL_PLATFORM_ADMIN',
      adminUserId: new mongoose.Types.ObjectId(),
    })

    expect(record._id).toBe('INITIAL_PLATFORM_ADMIN')
  })

  it('rejects a second bootstrap claim', async () => {
    await PlatformAdminBootstrapModel.create({
      _id: 'INITIAL_PLATFORM_ADMIN',
      adminUserId: new mongoose.Types.ObjectId(),
    })

    await expect(
      PlatformAdminBootstrapModel.create({
        _id: 'INITIAL_PLATFORM_ADMIN',
        adminUserId: new mongoose.Types.ObjectId(),
      }),
    ).rejects.toMatchObject({
      code: 11000,
    })
  })
})
