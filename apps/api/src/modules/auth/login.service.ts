
import { UserModel } from './user.model'
import { verifyPassword } from './password.service'
import { TenantSubscriptionModel } from '../subscription/tenant-subscription.model'
import type { LoginInput } from './login.schema'

export class LoginError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message)
    this.name = 'LoginError'
  }
}

export async function validateLogin(input: LoginInput) {
  const user = await UserModel.findOne({
    email: input.email,
  }).select('+passwordHash')

  if (!user) {
    throw new LoginError(401, 'Invalid email or password')
  }

  const passwordMatches = await verifyPassword(
    input.password,
    user.passwordHash,
  )

  if (!passwordMatches) {
    throw new LoginError(401, 'Invalid email or password')
  }

  if (user.status === 'SUSPENDED') {
    throw new LoginError(403, 'Account is suspended')
  }

  if (
    user.status === 'PENDING_VERIFICATION' ||
    !user.emailVerifiedAt
  ) {
    throw new LoginError(403, 'Email verification is required')
  }

  if (user.status !== 'ACTIVE') {
    throw new LoginError(403, 'Account is not active')
  }
if (user.role === 'PLATFORM_ADMIN') {
  if (user.libraryId) {
    throw new LoginError(403, 'Invalid administrator configuration')
  }

  return {
    userId: user._id.toString(),
    email: user.email,
    role: user.role,
    libraryId: null,
    subscriptionStatus: null,
    accessLevel: null,
  }
}
  if (!user.libraryId) {
    throw new LoginError(403, 'Library is not assigned')
  }

  const subscription = await TenantSubscriptionModel.findOne({
    libraryId: user.libraryId,
  })

  if (!subscription) {
    throw new LoginError(403, 'Subscription not found')
  }

  let accessLevel: 'FULL' | 'PAYMENT_ONLY' | 'READ_ONLY'

  switch (subscription.status) {
    case 'ACTIVE':
    case 'GRACE_PERIOD':
      accessLevel = 'FULL'
      break

    case 'PENDING_PAYMENT':
    case 'PAYMENT_UNDER_REVIEW':
      accessLevel = 'PAYMENT_ONLY'
      break

    case 'READ_ONLY':
    case 'EXPIRED':
      accessLevel = 'READ_ONLY'
      break

    default:
      throw new LoginError(403, 'Subscription does not allow login')
  }

  return {
    userId: user._id.toString(),
    email: user.email,
    role: user.role,
    libraryId: user.libraryId.toString(),
    subscriptionStatus: subscription.status,
    accessLevel,
  }
}
