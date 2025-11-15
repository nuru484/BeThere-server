// src/utils/email.ts
import nodemailer from "nodemailer";
import ENV from "../config/env.js";

// Configure nodemailer transporter for Gmail
export const createEmailTransporter = () => {
  return nodemailer.createTransport({
    host: ENV.SMTP_HOST,
    service: "gmail",
    port: ENV.SMTP_PORT,
    auth: {
      user: ENV.GMAIL_USER,
      pass: ENV.GMAIL_PASSWORD,
    },
  });
};
