import express from 'express'
import cors from 'cors'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Server } from 'node:http'
import { corsOptions } from './cors-policy'
import { env } from './env'

let server: Server
let baseUrl: string

beforeAll(async () => {
  const app = express()
  app.use(cors(corsOptions))
  app.post('/api/v1/auth/refresh', (_req, res) => res.json({ success: true }))
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing test port')
  baseUrl = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
  if (server) await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
})

describe('Browser credentialed CORS policy', () => {
  it('allows the configured frontend to send the CSRF header with credentials', async () => {
    const response = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'OPTIONS',
      headers: {
        Origin: env.WEB_ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,x-booknest-request',
      },
    })
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe(env.WEB_ORIGIN)
    expect(response.headers.get('access-control-allow-credentials')).toBe('true')
    expect(response.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('x-booknest-request')
  })

  it('does not grant an untrusted origin access to credentials', async () => {
    const response = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://untrusted.example',
        'Access-Control-Request-Method': 'POST',
      },
    })
    expect(response.headers.get('access-control-allow-origin')).not.toBe('https://untrusted.example')
  })
})
