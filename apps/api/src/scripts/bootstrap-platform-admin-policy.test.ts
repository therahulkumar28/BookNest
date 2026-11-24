import { describe, expect, it } from 'vitest'
import { assertBootstrapEnvironment } from './bootstrap-platform-admin-policy'
describe('Platform Admin production bootstrap guard', () => {
  it('rejects production without explicit operator approval', () => {
    expect(() => assertBootstrapEnvironment('production', undefined)).toThrow()
    expect(() => assertBootstrapEnvironment('production', 'yes')).toThrow()
  })
  it('allows explicit production opt-in', () => {
    expect(() => assertBootstrapEnvironment('production', 'YES')).not.toThrow()
  })
  it('rejects ambiguous environments', () => {
    expect(() => assertBootstrapEnvironment(undefined, 'YES')).toThrow()
  })
})
