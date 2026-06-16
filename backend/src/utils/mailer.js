// =====================================================================
// mailer.js
//
// IMPORTANT: sends the e-mail verification message. The function is
// designed to be called WITHOUT awaiting it from the registration
// route, so that the HTTP response to the user is returned
// immediately ("the corresponding message is shown after the
// registration; the confirmation e-mail should be sent
// asynchronously").
// =====================================================================

const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  // NOTE: if SMTP credentials are not configured, fall back to a
  // "console transport" so the app still works during local
  // development/testing without crashing.
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    transporter = {
      sendMail: async (options) => {
        console.log('--- SMTP NOT CONFIGURED. Verification e-mail (printed instead) ---');
        console.log('To:', options.to);
        console.log('Subject:', options.subject);
        console.log('Link:', options.text);
        console.log('--------------------------------------------------------------');
        return { messageId: 'console-fallback' };
      },
    };
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 465,
    secure: String(process.env.SMTP_SECURE).toLowerCase() !== 'false',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
}

async function sendVerificationEmail(toEmail, token) {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const apiBase = process.env.API_PUBLIC_URL || '';
  // IMPORTANT: the link points to the BACKEND verification endpoint,
  // which then redirects the user's browser to the frontend login page
  // with a status query parameter.
  const verifyUrl = `${apiBase}/api/auth/verify/${token}`;

  const mailer = getTransporter();
  await mailer.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER || 'no-reply@example.com',
    to: toEmail,
    subject: 'Confirm your e-mail address',
    text: `Please confirm your e-mail by opening this link: ${verifyUrl}\n\nIf you didn't create this account, you can ignore this e-mail.`,
    html: `<p>Please confirm your e-mail address by clicking the link below:</p>
           <p><a href="${verifyUrl}">${verifyUrl}</a></p>
           <p>If you didn't create this account, you can ignore this e-mail.</p>`,
  });
}

module.exports = { sendVerificationEmail };
