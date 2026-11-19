
import mongoose, {
  Schema,
  type InferSchemaType,
} from 'mongoose'

export const SUBSCRIPTION_PLAN_CODES = [
  'FREE_TRIAL',
  'MONTHLY',
  'QUARTERLY',
  'YEARLY',
  'FIVE_YEAR',
] as const

export const SUBSCRIPTION_STATUSES = [
  'PENDING_EMAIL_VERIFICATION',
  'PENDING_PAYMENT',
  'PAYMENT_UNDER_REVIEW',
  'ACTIVE',
  'GRACE_PERIOD',
  'READ_ONLY',
  'EXPIRED',
  'CANCELLED',
] as const

const tenantSubscriptionSchema = new Schema(
  {
    libraryId: {
      type: Schema.Types.ObjectId,
      ref: 'Library',
      required: true,
      immutable: true,
    },

    planCode: {
      type: String,
      enum: SUBSCRIPTION_PLAN_CODES,
      required: true,
    },

    status: {
      type: String,
      enum: SUBSCRIPTION_STATUSES,
      default: 'PENDING_EMAIL_VERIFICATION',
      required: true,
    },

    startsAt: {
      type: Date,
      default: null,
    },

    expiresAt: {
      type: Date,
      default: null,
    },

    graceEndsAt: {
      type: Date,
      default: null,
    },

    pricePaise: {
      type: Number,
      min: 0,
      required: true,
    },

    currency: {
      type: String,
      enum: ['INR'],
      default: 'INR',
      required: true,
    },

    activatedAt: {
      type: Date,
      default: null,
    },

    activatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
)

tenantSubscriptionSchema.index({
  libraryId: 1,
  createdAt: -1,
})

export type TenantSubscription =
  InferSchemaType<typeof tenantSubscriptionSchema>

export const TenantSubscriptionModel =
  mongoose.models.TenantSubscription ||
  mongoose.model('TenantSubscription', tenantSubscriptionSchema)
