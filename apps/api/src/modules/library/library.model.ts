
import mongoose, {
  Schema,
  type InferSchemaType,
} from 'mongoose'

export const LIBRARY_STATUSES = [
  'PENDING_SETUP',
  'ACTIVE',
  'SUSPENDED',
] as const

const librarySchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 150,
    },

    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },

    contactEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    contactPhone: {
      type: String,
      required: true,
      trim: true,
    },

    city: {
      type: String,
      required: true,
      trim: true,
    },

    state: {
      type: String,
      required: true,
      trim: true,
    },

    country: {
      type: String,
      default: 'India',
      required: true,
    },

    timeZone: {
      type: String,
      default: 'Asia/Kolkata',
      required: true,
    },

    totalCapacity: {
      type: Number,
      default: 0,
      min: 0,
    },

    status: {
      type: String,
      enum: LIBRARY_STATUSES,
      default: 'PENDING_SETUP',
      required: true,
    },

    isPublished: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
)

// One owner can manage only one library in BookNest V1.
librarySchema.index({ ownerId: 1 }, { unique: true })

export type Library = InferSchemaType<typeof librarySchema>

export const LibraryModel =
  mongoose.models.Library ||
  mongoose.model('Library', librarySchema)
