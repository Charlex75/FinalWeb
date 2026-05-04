import nodemailer from 'nodemailer';
import config from '../config/index';

// TODO(human): configure Nodemailer transport in .env
// Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS (Gmail / SendGrid / Mailtrap)
// Until configured, all send calls are silently skipped.

function getTransporter() {
  return nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.port === 465,
    auth: {
      user: config.email.user,
      pass: config.email.pass,
    },
  });
}

function isConfigured(): boolean {
  return Boolean(config.email.host && config.email.user && config.email.pass);
}

export const mailService = {
  async sendVerificationEmail(to: string, name: string, code: string): Promise<void> {
    if (!isConfigured()) return;
    await getTransporter().sendMail({
      from:    config.email.from,
      to,
      subject: 'Verifica tu cuenta — BildyApp',
      html: `
        <h2>Hola, ${name}</h2>
        <p>Tu código de verificación es:</p>
        <h1 style="letter-spacing:8px;font-family:monospace">${code}</h1>
        <p>El código expira en <strong>24 horas</strong>.</p>
      `,
    });
  },

  async sendInviteEmail(
    to: string,
    inviterName: string,
    tempPassword: string,
  ): Promise<void> {
    if (!isConfigured()) return;
    await getTransporter().sendMail({
      from:    config.email.from,
      to,
      subject: `${inviterName} te ha invitado a BildyApp`,
      html: `
        <h2>Has sido invitado/a a BildyApp</h2>
        <p><strong>${inviterName}</strong> te ha añadido como colaborador/a.</p>
        <p>Inicia sesión con este email y la siguiente contraseña temporal:</p>
        <p style="font-family:monospace;font-size:1.2em">${tempPassword}</p>
        <p>Cámbiala tras iniciar sesión.</p>
      `,
    });
  },
};
