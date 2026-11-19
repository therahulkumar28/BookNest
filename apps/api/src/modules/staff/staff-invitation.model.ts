import mongoose, { Schema } from 'mongoose'
const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  libraryId: { type: Schema.Types.ObjectId, ref: 'Library', required: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
  lastSentAt: { type: Date, default: null },
  resendCount: { type: Number, default: 0 },
  resendWindowStartedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false })
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
export const StaffInvitationModel = mongoose.models.StaffInvitation || mongoose.model('StaffInvitation', schema)
