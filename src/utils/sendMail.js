import ejs from "ejs";
import path from "path";
import { fileURLToPath } from "url";
import { createEmailTransporter } from "./email-transporter.js";
import ENV from "../config/env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Sends an email using the provided options.
 * @param {Object} options - Email configuration options.
 * @param {string} options.email - Recipient email address.
 * @param {string} options.subject - Email subject line.
 * @param {string} [options.template] - EJS template filename (without extension), located in '../ejs'.
 * @param {Object} [options.data] - Data object to pass to the EJS template.
 * @param {string} [options.text] - Plain text fallback content.
 * @param {Array<Object>} [options.attachments] - Array of attachment objects.
 * @param {string} [options.attachments[].filename] - Attachment filename.
 * @param {string} [options.attachments[].path] - File path to attachment.
 * @param {string} [options.attachments[].cid] - Content-ID for inline images (e.g., 'logo').
 * @returns {Promise<void>}
 */

const sendMail = async (options) => {
  const { email, subject, template, data, text, attachments } = options;

  let html = "";

  if (template && data) {
    const templatePath = path.join(__dirname, "../ejs", template);
    html = await ejs.renderFile(templatePath, data);
  }

  const mailOptions = {
    from: ENV.SMTP_MAIL,
    to: email,
    subject,
    html: html || undefined,
    text: text || undefined,
    attachments: attachments || undefined,
  };

  const transporter = createEmailTransporter();
  await transporter.sendMail(mailOptions);
};

export default sendMail;
