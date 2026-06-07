// =====================================================
// utils/mailer.js — Nodemailer + validación DNS
// =====================================================

const nodemailer = require('nodemailer');
const dns        = require('dns').promises;

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Verifica que el dominio del correo tenga registros MX (acepta emails)
async function emailDomainExists(email) {
  const domain = (email || '').split('@')[1];
  if (!domain) return false;
  try {
    const records = await dns.resolveMx(domain);
    return Array.isArray(records) && records.length > 0;
  } catch {
    return false;
  }
}

// Envía el mensaje del formulario de contacto al equipo de soporte
async function sendContactEmail({ fromName, fromEmail, subject, message }) {
  const recipient = process.env.CONTACT_RECIPIENT || process.env.SMTP_USER;
  return transporter.sendMail({
    from:    `"Gestión Académica" <${process.env.SMTP_USER}>`,
    replyTo: `"${fromName}" <${fromEmail}>`,
    to:      recipient,
    subject: `[Contacto] ${subject}`,
    text:    `De: ${fromName} <${fromEmail}>\n\n${message}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1E2A36">
        <h2 style="color:#3B6FA0;margin-bottom:4px">Nuevo mensaje de contacto</h2>
        <p style="margin:0 0 16px;color:#6B7B8D;font-size:13px">Gestión Académica — Formulario de contacto</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:6px 0;color:#6B7B8D;width:80px">Nombre</td><td style="padding:6px 0;font-weight:500">${fromName}</td></tr>
          <tr><td style="padding:6px 0;color:#6B7B8D">Correo</td><td style="padding:6px 0"><a href="mailto:${fromEmail}" style="color:#3B6FA0">${fromEmail}</a></td></tr>
          <tr><td style="padding:6px 0;color:#6B7B8D">Asunto</td><td style="padding:6px 0">${subject}</td></tr>
        </table>
        <hr style="border:none;border-top:1px solid #EAE5DE;margin:16px 0"/>
        <p style="white-space:pre-wrap;font-size:14px;line-height:1.6">${message}</p>
      </div>`,
  });
}

// Envía el código de 6 dígitos para recuperación de contraseña
async function sendRecoveryEmail({ toEmail, code }) {
  return transporter.sendMail({
    from:    `"Gestión Académica" <${process.env.SMTP_USER}>`,
    to:      toEmail,
    subject: 'Código de recuperación de contraseña',
    text:    `Tu código de verificación es: ${code}\n\nEste código expira en 10 minutos.\nSi no solicitaste este correo, ignóralo.`,
    html: `
      <div style="font-family:sans-serif;max-width:400px;margin:0 auto;color:#1E2A36">
        <h2 style="color:#3B6FA0">Recuperación de contraseña</h2>
        <p style="color:#6B7B8D;font-size:14px">Ingresa este código en la aplicación para continuar:</p>
        <div style="font-size:36px;font-weight:700;letter-spacing:10px;color:#1E2A36;
                    background:#F5F2EE;border-radius:10px;padding:18px 24px;
                    text-align:center;margin:16px 0">${code}</div>
        <p style="color:#9AABB8;font-size:12px;line-height:1.6">
          Este código expira en 10 minutos.<br>
          Si no solicitaste este correo, ignóralo.
        </p>
      </div>`,
  });
}

module.exports = { emailDomainExists, sendContactEmail, sendRecoveryEmail };
