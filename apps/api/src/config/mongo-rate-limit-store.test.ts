import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MongoRateLimitStore, ensureRateLimitIndexes } from './mongo-rate-limit-store'
let mongo: MongoMemoryServer
beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri())
  await ensureRateLimitIndexes()
}, 120_000)
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop() })
describe('shared MongoDB rate limit store', () => {
  it('shares atomic counters across instances', async () => {
    const a = new MongoRateLimitStore('login', 900000)
    const b = new MongoRateLimitStore('login', 900000)
    const key = `test-${new mongoose.Types.ObjectId()}`
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? a : b).increment(key)))
    expect(results.map(r => r.totalHits).sort((x,y) => x-y)).toEqual(Array.from({ length: 12 }, (_, i) => i+1))
    expect((await a.increment(key)).totalHits).toBe(13)
  })
  it('isolates endpoints and can reset counters', async () => {
    const a = new MongoRateLimitStore('register', 900000)
    const b = new MongoRateLimitStore('login', 900000)
    const key = `test-${new mongoose.Types.ObjectId()}`
    expect((await a.increment(key)).totalHits).toBe(1)
    expect((await b.increment(key)).totalHits).toBe(1)
    await a.resetKey(key)
    expect((await a.increment(key)).totalHits).toBe(1)
  })
})
