import nodemailer from 'nodemailer'

export async function sendStaffInvitationEmail(to: string, token: string): Promise<void> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM, WEB_ORIGIN } = process.env
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD || !EMAIL_FROM || !WEB_ORIGIN) {
    throw new Error('Staff invitation email configuration is incomplete')
  }
  const port = Number(SMTP_PORT)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SMTP_PORT')
  const url = new URL('/staff/accept-invitation', WEB_ORIGIN)
  url.searchParams.set('token', token)
  const transport = nodemailer.createTransport({ host: SMTP_HOST, port, secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD } })
  await transport.sendMail({ from: EMAIL_FROM, to,
    subject: 'Your BookNest staff invitation',
    text: `You have been invited to BookNest. Set your password using this link (expires in 30 minutes):\n${url.toString()}\nIf you did not expect this invitation, ignore it.`,
  })
}
