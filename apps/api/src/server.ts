
import 'dotenv/config'

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'

const app = express()

app.use(helmet())

app.use(
  cors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
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

const PORT = Number(process.env.PORT ?? 5000)

app.listen(PORT, () => {
  console.log(`BookNest API running on port ${PORT}`)
})
