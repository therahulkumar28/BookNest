
import { describe, expect, it } from 'vitest'
import {
    generateRefreshToken,
    hashRefreshToken,
    getRefreshTokenExpiry,
} from './refresh-token.service'

describe('Refresh token utilities', () => {
    it('generates distinct tokens', () => {
        const first = generateRefreshToken()
        const second = generateRefreshToken()

        expect(first).not.toBe(second)
        expect(first.length).toBeGreaterThanOrEqual(40)
    })

    it('hashes tokens consistently', () => {
        const token = generateRefreshToken()
        const hash = hashRefreshToken(token)

        expect(hash).toBe(hashRefreshToken(token))
        expect(hash).not.toBe(token)
        expect(hash).toMatch(/^[a-f0-9]{64}$/)
    })

    it('sets expiry approximately seven days ahead', () => {
        const before = Date.now()
        const expiry = getRefreshTokenExpiry().getTime()
        const after = Date.now()
        const sevenDays = 7 * 24 * 60 * 60 * 1000

        expect(expiry).toBeGreaterThanOrEqual(before + sevenDays)
        expect(expiry).toBeLessThanOrEqual(after + sevenDays)
    })
})
