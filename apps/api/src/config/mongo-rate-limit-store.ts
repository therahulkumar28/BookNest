import { createHash } from 'node:crypto'
import mongoose from 'mongoose'
import type { Store, IncrementResponse } from 'express-rate-limit'

/** Fixed-window shared counter. MongoDB atomic increments work across API instances. */
export class MongoRateLimitStore implements Store {
  readonly prefix: string
  private readonly windowMs: number
  constructor(prefix: string, windowMs: number) {
    this.prefix = prefix
    this.windowMs = windowMs
  }
  private bucket(key: string): { id: string; resetTime: Date } {
    const now = Date.now()
    const end = (Math.floor(now / this.windowMs) + 1) * this.windowMs
    const digest = createHash('sha256').update(key).digest('hex')
    return { id: `${this.prefix}:${end}:${digest}`, resetTime: new Date(end) }
  }
  private collection() {
    if (mongoose.connection.readyState !== 1) throw new Error('Rate limiter database unavailable')
    return mongoose.connection.collection('api_rate_limits')
  }
  async increment(key: string): Promise<IncrementResponse> {
    const { id, resetTime } = this.bucket(key)
    const doc = await this.collection().findOneAndUpdate(
      { _id: id as never },
      { $inc: { hits: 1 }, $setOnInsert: { expiresAt: resetTime } },
      { upsert: true, returnDocument: 'after' },
    )
    if (!doc) throw new Error('Rate limiter counter unavailable')
    return { totalHits: Number(doc.hits), resetTime }
  }
  async decrement(key: string): Promise<void> {
    const { id } = this.bucket(key)
    await this.collection().updateOne({ _id: id as never, hits: { $gt: 0 } }, { $inc: { hits: -1 } })
  }
  async resetKey(key: string): Promise<void> {
    const { id } = this.bucket(key)
    await this.collection().deleteOne({ _id: id as never })
  }
}

/** Run at API startup; MongoDB TTL deletion is eventual, but bucket IDs ensure expiration. */
export async function ensureRateLimitIndexes(): Promise<void> {
  await mongoose.connection.collection('api_rate_limits').createIndex(
    { expiresAt: 1 }, { expireAfterSeconds: 0, name: 'expiresAt_ttl' },
  )
}

export function rateLimitStore(prefix: string, windowMs: number): Store | undefined {
  return process.env.NODE_ENV === 'production'
    ? new MongoRateLimitStore(prefix, windowMs)
    : undefined
}
