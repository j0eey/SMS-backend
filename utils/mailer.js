import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

// Load .env variables
dotenv.config();

// Gmail transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Verify connection once when starting the server
transporter.verify(function (error) {
  if (error) {
    console.error('❌ SMTP verification failed:', error);
  } else {
    console.log('✅ SMTP server is ready to take messages');
  }
});

export async function sendMail(to, subject, text, html) {
  return transporter.sendMail({
    from: `"Support" <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
    html
  });
}
