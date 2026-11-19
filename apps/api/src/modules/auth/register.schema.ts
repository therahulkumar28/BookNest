
import { z } from 'zod'

import {
  SUBSCRIPTION_PLAN_CODES,
} from '../subscription/tenant-subscription.model'

const ownerSchema = z.object({
  fullName: z.string()
    .trim()
    .min(2, 'Name must contain at least 2 characters')
    .max(120),

  email: z.email()
    .trim()
    .toLowerCase(),

  password: z.string()
    .min(12, 'Password must contain at least 12 characters')
    .max(128),
})

const librarySchema = z.object({
  name: z.string()
    .trim()
    .min(2)
    .max(150),

  contactEmail: z.email()
    .trim()
    .toLowerCase(),

  contactPhone: z.string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),

  city: z.string()
    .trim()
    .min(2)
    .max(100),

  state: z.string()
    .trim()
    .min(2)
    .max(100),
})

export const registerOwnerSchema = z.strictObject({
  owner: ownerSchema,
  library: librarySchema,

  planCode: z.enum(SUBSCRIPTION_PLAN_CODES),
})

export type RegisterOwnerInput =
  z.infer<typeof registerOwnerSchema>
