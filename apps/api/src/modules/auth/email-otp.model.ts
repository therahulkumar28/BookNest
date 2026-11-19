
import mongoose, {
    Schema,
    type InferSchemaType,
} from 'mongoose'

export const EMAIL_OTP_PURPOSES = [
    'VERIFY_EMAIL',
    'RESET_PASSWORD',
] as const

const emailOtpSchema = new Schema(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },

        purpose: {
            type: String,
            enum: EMAIL_OTP_PURPOSES,
            required: true,
        },

        otpHash: {
            type: String,
            required: true,
            select: false,
        },

        expiresAt: {
            type: Date,
            required: true,
        },

        attempts: {
            type: Number,
            default: 0,
            min: 0,
        },

        consumedAt: {
            type: Date,
            default: null,
        },

        createdAt: {
            type: Date,
            default: Date.now,
        },
        lastIssuedAt: {
            type: Date,
            default: Date.now,
            required: true,
        },
    },
    {
        versionKey: false,
    },
)

emailOtpSchema.index(
    { userId: 1, purpose: 1 },
    { unique: true },
)

emailOtpSchema.index(
    { expiresAt: 1 },
    { expireAfterSeconds: 0 },
)

export type EmailOtp =
    InferSchemaType<typeof emailOtpSchema>

export const EmailOtpModel =
    mongoose.models.EmailOtp ||
    mongoose.model('EmailOtp', emailOtpSchema)
