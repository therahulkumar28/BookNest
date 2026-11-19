
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import mongoose from 'mongoose'
import { env } from './config/env'
import { connectDatabase, disconnectDatabase } from './config/database'
import { authRouter } from './modules/auth/auth.routes'
import type { ErrorRequestHandler } from 'express'
import { staffRouter } from './modules/staff/staff.routes'

const app = express()

app.use(helmet())

app.use(
  cors({
    origin: env.WEB_ORIGIN,
  }),
)

app.use(express.json({ limit: '1mb' }))

app.get('/api/v1/health', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'BookNest API is running',
    timestamp: new Date().toISOString(),
  })
})

app.get('/api/v1/ready', (_req, res) => {
  const databaseConnected = mongoose.connection.readyState === 1

  res.status(databaseConnected ? 200 : 503).json({
    success: databaseConnected,
    database: databaseConnected ? 'connected' : 'disconnected',
  })
})
app.use('/api/v1/auth', authRouter)
app.use('/api/v1/staff', staffRouter)
const errorHandler: ErrorRequestHandler = (
  error,
  _req,
  res,
  _next,
) => {
  console.error('Unhandled API error:', error)

  res.status(500).json({
    success: false,
    message: 'An unexpected server error occurred',
  })
}

app.use(errorHandler)

async function startServer(): Promise<void> {
  try {
    await connectDatabase()

    const server = app.listen(env.PORT, () => {
      console.log(`BookNest API running on port ${env.PORT}`)
    })

    async function shutdown(): Promise<void> {
      console.log('Shutting down BookNest API')

      server.close(async (error) => {
        if (error) {
          console.error('HTTP server shutdown failed:', error)
          process.exitCode = 1
        }

        try {
          await disconnectDatabase()
        } catch (databaseError) {
          console.error('Database shutdown failed:', databaseError)
          process.exitCode = 1
        }
      })
    }

    process.once('SIGINT', () => void shutdown())
    process.once('SIGTERM', () => void shutdown())
  } catch (error) {
    console.error('BookNest API startup failed:', error)
    process.exitCode = 1
  }
}

void startServer()
