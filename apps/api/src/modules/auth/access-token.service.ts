
import { SignJWT, jwtVerify } from 'jose'

const ACCESS_TOKEN_LIFETIME = '15m'
const ISSUER = 'booknest-api'
const AUDIENCE = 'booknest-web'

export type AccessTokenRole =
  | 'PLATFORM_ADMIN'
  | 'LIBRARY_OWNER'
  | 'LIBRARIAN'

export interface AccessTokenPayload {
  userId: string
  role: AccessTokenRole
  libraryId: string | null
  sessionId: string
}

function getAccessTokenKey(): Uint8Array {
  const secret = process.env.JWT_ACCESS_SECRET

  if (!secret || secret.length < 32) {
    throw new Error(
      'JWT_ACCESS_SECRET must contain at least 32 characters',
    )
  }

  return new TextEncoder().encode(secret)
}

export async function signAccessToken(
  payload: AccessTokenPayload,
): Promise<string> {
  return new SignJWT({
    role: payload.role,
    libraryId: payload.libraryId,
    sessionId: payload.sessionId,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(payload.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_LIFETIME)
    .sign(getAccessTokenKey())
}

export async function verifyAccessToken(
  token: string,
): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(
    token,
    getAccessTokenKey(),
    {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    },
  )

  if (
    typeof payload.sub !== 'string' ||
    typeof payload.sessionId !== 'string' ||
    !(
      payload.role === 'PLATFORM_ADMIN' ||
      payload.role === 'LIBRARY_OWNER' ||
      payload.role === 'LIBRARIAN'
    ) ||
    !(
      payload.libraryId === null ||
      typeof payload.libraryId === 'string'
    )
  ) {
    throw new Error('Invalid access token payload')
  }

  return {
    userId: payload.sub,
    role: payload.role,
    libraryId: payload.libraryId,
    sessionId: payload.sessionId,
  }
}
