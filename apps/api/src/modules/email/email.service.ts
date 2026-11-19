
import nodemailer from 'nodemailer'

function getEmailConfig() {
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASSWORD,
    EMAIL_FROM,
  } = process.env

  if (
    !SMTP_HOST ||
    !SMTP_PORT ||
    !SMTP_USER ||
    !SMTP_PASSWORD ||
    !EMAIL_FROM
  ) {
    throw new Error('Email configuration is incomplete')
  }

  const port = Number(SMTP_PORT)

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Invalid SMTP_PORT')
  }

  return {
    host: SMTP_HOST,
    port,
    user: SMTP_USER,
    password: SMTP_PASSWORD,
    from: EMAIL_FROM,
  }
}

function createTransport() {
  const config = getEmailConfig()

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: {
      user: config.user,
      pass: config.password,
    },
  })
}

export async function sendVerificationOtpEmail(
  to: string,
  otp: string,
): Promise<void> {
  const config = getEmailConfig()
  const transporter = createTransport()

  await transporter.sendMail({
    from: config.from,
    to,
    subject: 'Verify your BookNest email',
    text: [
      'Welcome to BookNest!',
      '',
      `Your email verification code is: ${otp}`,
      '',
      'This code expires in 5 minutes.',
      'If you did not register for BookNest, ignore this email.',
    ].join('\n'),
  })
}

export async function verifyEmailConnection(): Promise<void> {
  const transporter = createTransport()
  await transporter.verify()
}


export async function sendPasswordResetOtpEmail(
  to: string,
  otp: string,
): Promise<void> {
  const config = getEmailConfig()
  const transporter = createTransport()

  await transporter.sendMail({
    from: config.from,
    to,
    subject: 'Reset your BookNest password',
    text: [
      'We received a request to reset your password.',
      '',
      `Your password reset code is: ${otp}`,
      '',
      'This code expires in 5 minutes.',
      'If you did not request this, ignore this email.',
    ].join('\n'),
  })
}
