/** An explicit one-time operator opt-in is required on production. */
export function assertBootstrapEnvironment(nodeEnv: string | undefined, approval: string | undefined): void {
  if (nodeEnv === 'production' && approval !== 'YES') {
    throw new Error('Production bootstrap requires BOOKNEST_ALLOW_PRODUCTION_BOOTSTRAP=YES for this process')
  }
  if (nodeEnv !== 'production' && nodeEnv !== 'development' && nodeEnv !== 'test') {
    throw new Error('Set NODE_ENV to development, test, or production explicitly')
  }
}
