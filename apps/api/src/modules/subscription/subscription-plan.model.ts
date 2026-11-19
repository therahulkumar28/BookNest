
import mongoose, {
  Schema,
  type InferSchemaType,
} from 'mongoose'

import { SUBSCRIPTION_PLAN_CODES } from './tenant-subscription.model'

const subscriptionPlanSchema = new Schema(
  {
    code: {
      type: String,
      enum: SUBSCRIPTION_PLAN_CODES,
      required: true,
      immutable: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    durationDays: {
      type: Number,
      min: 1,
      default: null,
    },

    durationMonths: {
      type: Number,
      min: 1,
      default: null,
    },

    pricePaise: {
    type: Number,
    required: true,
    min: 0,
    validate: Number.isSafeInteger,
    },

    currency: {
      type: String,
      enum: ['INR'],
      default: 'INR',
      required: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    displayOrder: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
)

subscriptionPlanSchema.index({ code: 1 }, { unique: true })

export type SubscriptionPlan =
  InferSchemaType<typeof subscriptionPlanSchema>

export const SubscriptionPlanModel =
  mongoose.models.SubscriptionPlan ||
  mongoose.model('SubscriptionPlan', subscriptionPlanSchema)
