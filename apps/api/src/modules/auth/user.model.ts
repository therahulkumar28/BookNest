
import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose'

export const USER_ROLES = [
  'PLATFORM_ADMIN',
  'LIBRARY_OWNER',
  'LIBRARIAN',
] as const

export const USER_STATUSES = [
  'PENDING_VERIFICATION',
  'ACTIVE',
  'SUSPENDED',
] as const

const userSchema = new Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },

    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },

    passwordHash: {
      type: String,
      required: true,
      select: false,
    },

    role: {
      type: String,
      enum: USER_ROLES,
      required: true,
    },

    libraryId: {
      type: Schema.Types.ObjectId,
      ref: 'Library',
      default: null,
    },

    status: {
      type: String,
      enum: USER_STATUSES,
      default: 'PENDING_VERIFICATION',
      required: true,
    },

    emailVerifiedAt: {
      type: Date,
      default: null,
    },

    createdBy: {
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

userSchema.index({ email: 1 }, { unique: true })
userSchema.index({ libraryId: 1, role: 1 })

export type User = InferSchemaType<typeof userSchema>

export const UserModel: Model<User> =
  (mongoose.models.User as Model<User> | undefined) ??
  mongoose.model<User>('User', userSchema)
