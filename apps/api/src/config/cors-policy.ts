import type { CorsOptions } from 'cors'
import { env } from './env'

// Credentialed browser requests must use one exact trusted origin.
// Do not use '*' with credentials or reflect arbitrary request origins.
export const corsOptions: CorsOptions = {
  origin: env.WEB_ORIGIN,
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-BookNest-Request'],
  optionsSuccessStatus: 204,
}
