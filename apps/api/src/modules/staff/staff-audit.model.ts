import mongoose, { Schema } from 'mongoose'

export const STAFF_AUDIT_ACTIONS = [
  'STAFF_INVITED', 'STAFF_INVITATION_RESENT', 'STAFF_INVITATION_ACCEPTED',
  'STAFF_PERMISSIONS_CHANGED', 'STAFF_SUSPENDED', 'STAFF_ACTIVATED',
] as const

const schema = new Schema({
  libraryId: { type: Schema.Types.ObjectId, ref: 'Library', required: true, index: true },
  staffId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, enum: STAFF_AUDIT_ACTIONS, required: true },
  details: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true, versionKey: false })
schema.index({ libraryId: 1, createdAt: -1 })
export const StaffAuditModel = mongoose.models.StaffAudit || mongoose.model('StaffAudit', schema)
