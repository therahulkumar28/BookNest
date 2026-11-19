
import mongoose, { Schema } from 'mongoose'

export type RefreshRevocationReason =
  | 'ROTATED'
  | 'LOGOUT'
  | 'LOGOUT_ALL'
  | 'PASSWORD_RESET'
  | 'REUSE_DETECTED'
  | 'ACCOUNT_DISABLED'

export interface RefreshSession {
  userId: mongoose.Types.ObjectId
  tokenHash: string
  expiresAt: Date
  revokedAt: Date | null
  createdAt: Date
  updatedAt: Date
  familyId: mongoose.Types.ObjectId
  revocationReason: RefreshRevocationReason | null
}

const refreshSessionSchema = new Schema<RefreshSession>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    tokenHash: {
      type: String,
      required: true,
      unique: true,
      select: false,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    revokedAt: {
      type: Date,
      default: null,
    },
    revocationReason: {
      type: String,
      enum: [
        'ROTATED',
        'LOGOUT',
        'LOGOUT_ALL',
        'PASSWORD_RESET',
        'REUSE_DETECTED',
        'ACCOUNT_DISABLED',
      ],
      default: null,
    },
    familyId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
)

// Expired sessions are eventually removed by MongoDB.
// Authorization must still check expiresAt directly.
refreshSessionSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 },
)

export const RefreshSessionModel =
  mongoose.models.RefreshSession ||
  mongoose.model<RefreshSession>(
    'RefreshSession',
    refreshSessionSchema,
  )
