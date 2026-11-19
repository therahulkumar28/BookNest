import mongoose, { Schema } from 'mongoose'

export const AUTH_AUDIT_ACTIONS = [
  'LOGIN_SUCCEEDED', 'LOGIN_REJECTED', 'PASSWORD_RESET_COMPLETED', 'LOGOUT_ALL',
] as const

const authAuditSchema = new Schema({
  action: { type: String, enum: AUTH_AUDIT_ACTIONS, required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  // SHA-256 of normalized email for rejected logins; never store the email or password.
  subjectHash: { type: String, default: null },
  sessionId: { type: Schema.Types.ObjectId, default: null },
}, { timestamps: true, versionKey: false, collection: 'auth_audit' })

authAuditSchema.index({ userId: 1, createdAt: -1 })
export const AuthAuditModel = mongoose.models.AuthAudit ||
  mongoose.model('AuthAudit', authAuditSchema)
