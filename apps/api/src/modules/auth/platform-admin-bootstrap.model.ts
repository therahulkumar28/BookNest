
import mongoose, { Schema } from 'mongoose'

const platformAdminBootstrapSchema = new Schema(
  {
    _id: {
      type: String,
      required: true,
    },
    adminUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  {
    versionKey: false,
    collection: 'platform_admin_bootstrap',
  },
)

export const PlatformAdminBootstrapModel =
  mongoose.models.PlatformAdminBootstrap ||
  mongoose.model(
    'PlatformAdminBootstrap',
    platformAdminBootstrapSchema,
  )
