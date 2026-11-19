import mongoose, { Schema } from 'mongoose'
import { PERMISSIONS } from './permissions'

const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  libraryId: { type: Schema.Types.ObjectId, ref: 'Library', required: true, index: true },
  permissions: [{ type: String, enum: PERMISSIONS }],
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, versionKey: false })
export const StaffPermissionsModel = mongoose.models.StaffPermissions || mongoose.model('StaffPermissions', schema)
