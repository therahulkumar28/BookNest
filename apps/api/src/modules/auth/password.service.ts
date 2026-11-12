
import argon2 from 'argon2'

const PASSWORD_HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const

export async function hashPassword(
  plainPassword: string,
): Promise<string> {
  return argon2.hash(plainPassword, PASSWORD_HASH_OPTIONS)
}

export async function verifyPassword(
  plainPassword: string,
  storedHash: string,
): Promise<boolean> {
  try {
    return await argon2.verify(storedHash, plainPassword)
  } catch {
    return false
  }
}
