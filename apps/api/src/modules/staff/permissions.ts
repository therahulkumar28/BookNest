export const PERMISSIONS = [
  'students.read', 'students.create', 'students.update',
  'memberships.read', 'memberships.create',
  'attendance.check_in', 'attendance.check_out', 'attendance.correct',
  'finance.payments.record', 'finance.refunds.request', 'reports.read',
] as const
export type Permission = (typeof PERMISSIONS)[number]
const allowed = new Set<string>(PERMISSIONS)
export function parsePermissions(value: unknown): Permission[] {
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string' && allowed.has(v))) {
    throw new Error('Invalid permissions')
  }
  return [...new Set(value)] as Permission[]
}
