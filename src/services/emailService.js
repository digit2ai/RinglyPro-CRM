// =====================================================
// Email Service for RinglyPro CRM
// File: src/services/emailService.js
// =====================================================

const crypto = require('crypto');

/**
 * Email Service Class
 * Handles sending emails for password reset, verification, etc.
 *
 * NOTE: This is a basic implementation that logs emails to console.
 * For production, integrate with:
 * - SendGrid
 * - AWS SES
 * - Mailgun
 * - Postmark
 * - Nodemailer with SMTP
 */
class EmailService {
    constructor() {
        this.fromEmail = process.env.EMAIL_FROM || 'noreply@ringlypro.com';
        this.fromName = process.env.EMAIL_FROM_NAME || 'RinglyPro';
        this.baseUrl = process.env.WEBHOOK_BASE_URL || 'http://localhost:3000';
    }

    /**
     * Send password reset email
     * @param {string} email - User's email address
     * @param {string} resetToken - Password reset token
     * @param {string} userName - User's name
     */
    async sendPasswordResetEmail(email, resetToken, userName = '') {
        const resetUrl = `${this.baseUrl}/reset-password?token=${resetToken}`;

        const emailContent = {
            to: email,
            from: `${this.fromName} <${this.fromEmail}>`,
            subject: 'Reset Your RinglyPro Password',
            html: this.getPasswordResetTemplate(resetUrl, userName),
            text: this.getPasswordResetTextVersion(resetUrl, userName)
        };

        // For development: Log to console
        if (process.env.NODE_ENV !== 'production') {
            console.log('📧 Password Reset Email (Development Mode)');
            console.log('═══════════════════════════════════════════');
            console.log('To:', emailContent.to);
            console.log('Subject:', emailContent.subject);
            console.log('Reset URL:', resetUrl);
            console.log('Token:', resetToken);
            console.log('═══════════════════════════════════════════');
            console.log('\n' + emailContent.text + '\n');
            return { success: true, mode: 'development' };
        }

        // For production: Use actual email service
        return await this.sendEmail(emailContent);
    }

    /**
     * Send email verification email
     * @param {string} email - User's email address
     * @param {string} verificationToken - Email verification token
     * @param {string} userName - User's name
     */
    async sendVerificationEmail(email, verificationToken, userName = '') {
        const verifyUrl = `${this.baseUrl}/verify-email?token=${verificationToken}`;

        const emailContent = {
            to: email,
            from: `${this.fromName} <${this.fromEmail}>`,
            subject: 'Verify Your RinglyPro Email',
            html: this.getVerificationTemplate(verifyUrl, userName),
            text: this.getVerificationTextVersion(verifyUrl, userName)
        };

        if (process.env.NODE_ENV !== 'production') {
            console.log('📧 Email Verification (Development Mode)');
            console.log('═══════════════════════════════════════════');
            console.log('To:', emailContent.to);
            console.log('Subject:', emailContent.subject);
            console.log('Verify URL:', verifyUrl);
            console.log('═══════════════════════════════════════════');
            return { success: true, mode: 'development' };
        }

        return await this.sendEmail(emailContent);
    }

    /**
     * Send welcome email after registration
     * @param {string} email - User's email address
     * @param {string} userName - User's name
     * @param {object} clientInfo - Client/business information
     */
    async sendWelcomeEmail(email, userName, clientInfo = {}) {
        const emailContent = {
            to: email,
            from: `${this.fromName} <${this.fromEmail}>`,
            subject: 'Welcome to RinglyPro!',
            html: this.getWelcomeTemplate(userName, clientInfo),
            text: this.getWelcomeTextVersion(userName, clientInfo)
        };

        if (process.env.NODE_ENV !== 'production') {
            console.log('📧 Welcome Email (Development Mode)');
            console.log('To:', emailContent.to);
            return { success: true, mode: 'development' };
        }

        return await this.sendEmail(emailContent);
    }

    /**
     * Generate a secure random token
     * @param {number} bytes - Number of random bytes (default: 32)
     * @returns {string} - Hex token
     */
    generateToken(bytes = 32) {
        return crypto.randomBytes(bytes).toString('hex');
    }

    /**
     * Send email using configured email provider
     * @param {object} emailContent - Email details
     * @private
     */
    async sendEmail(emailContent) {
        // TODO: Integrate with actual email service
        // Example integrations:

        // SendGrid:
        // const sgMail = require('@sendgrid/mail');
        // sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        // await sgMail.send(emailContent);

        // AWS SES:
        // const AWS = require('aws-sdk');
        // const ses = new AWS.SES({ region: process.env.AWS_REGION });
        // await ses.sendEmail(params).promise();

        // Mailgun:
        // const mailgun = require('mailgun-js')({
        //   apiKey: process.env.MAILGUN_API_KEY,
        //   domain: process.env.MAILGUN_DOMAIN
        // });
        // await mailgun.messages().send(emailContent);

        console.warn('⚠️ Email service not configured. Set up SendGrid, SES, or Mailgun in production.');
        return { success: false, error: 'Email service not configured' };
    }

    // ===== EMAIL TEMPLATES =====

    getPasswordResetTemplate(resetUrl, userName) {
        return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: white; padding: 30px; border: 1px solid #e5e7eb; }
        .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔐 Password Reset Request</h1>
        </div>
        <div class="content">
            <p>Hi ${userName || 'there'},</p>
            <p>We received a request to reset your RinglyPro password. Click the button below to create a new password:</p>
            <p style="text-align: center;">
                <a href="${resetUrl}" class="button">Reset Password</a>
            </p>
            <p><strong>This link will expire in 1 hour.</strong></p>
            <p>If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.</p>
            <p>For security, this link can only be used once.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
            <p style="font-size: 12px; color: #6b7280;">If the button doesn't work, copy and paste this URL into your browser:</p>
            <p style="font-size: 12px; color: #3b82f6; word-break: break-all;">${resetUrl}</p>
        </div>
        <div class="footer">
            <p>This email was sent by RinglyPro CRM</p>
            <p>If you have questions, contact us at support@ringlypro.com</p>
        </div>
    </div>
</body>
</html>
        `;
    }

    getPasswordResetTextVersion(resetUrl, userName) {
        return `
Hi ${userName || 'there'},

We received a request to reset your RinglyPro password.

Reset your password by clicking this link:
${resetUrl}

This link will expire in 1 hour.

If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.

For security, this link can only be used once.

---
RinglyPro CRM
If you have questions, contact us at support@ringlypro.com
        `.trim();
    }

    getVerificationTemplate(verifyUrl, userName) {
        return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: white; padding: 30px; border: 1px solid #e5e7eb; }
        .button { display: inline-block; background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>✉️ Verify Your Email</h1>
        </div>
        <div class="content">
            <p>Hi ${userName || 'there'},</p>
            <p>Thanks for signing up for RinglyPro! Please verify your email address by clicking the button below:</p>
            <p style="text-align: center;">
                <a href="${verifyUrl}" class="button">Verify Email</a>
            </p>
            <p>Once verified, you'll have full access to all RinglyPro features.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
            <p style="font-size: 12px; color: #6b7280;">If the button doesn't work, copy and paste this URL into your browser:</p>
            <p style="font-size: 12px; color: #10b981; word-break: break-all;">${verifyUrl}</p>
        </div>
        <div class="footer">
            <p>This email was sent by RinglyPro CRM</p>
        </div>
    </div>
</body>
</html>
        `;
    }

    getVerificationTextVersion(verifyUrl, userName) {
        return `
Hi ${userName || 'there'},

Thanks for signing up for RinglyPro! Please verify your email address by clicking this link:
${verifyUrl}

Once verified, you'll have full access to all RinglyPro features.

---
RinglyPro CRM
        `.trim();
    }

    getWelcomeTemplate(userName, clientInfo) {
        return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: white; padding: 30px; border: 1px solid #e5e7eb; }
        .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .info-box { background: #f3f4f6; padding: 15px; border-radius: 6px; margin: 15px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎉 Welcome to RinglyPro!</h1>
        </div>
        <div class="content">
            <p>Hi ${userName},</p>
            <p>Welcome to RinglyPro CRM! Your account has been successfully created.</p>
            ${clientInfo.rachelNumber ? `
            <div class="info-box">
                <p><strong>📞 Your Rachel AI Number:</strong> ${clientInfo.rachelNumber}</p>
                <p><strong>🎯 Business:</strong> ${clientInfo.businessName || 'Your Business'}</p>
                <p><strong>⏱️ Free Trial Minutes:</strong> 100 minutes</p>
            </div>
            ` : ''}
            <p><strong>Next Steps:</strong></p>
            <ul>
                <li>Set up your business hours and preferences</li>
                <li>Configure your Rachel AI assistant</li>
                <li>Test your voice AI system</li>
                <li>Start taking calls with AI-powered assistance</li>
            </ul>
            <p style="text-align: center;">
                <a href="${this.baseUrl}/dashboard" class="button">Go to Dashboard</a>
            </p>
            <p>If you have any questions, our support team is here to help!</p>
        </div>
        <div class="footer">
            <p>This email was sent by RinglyPro CRM</p>
        </div>
    </div>
</body>
</html>
        `;
    }

    getWelcomeTextVersion(userName, clientInfo) {
        return `
Hi ${userName},

Welcome to RinglyPro CRM! Your account has been successfully created.

${clientInfo.rachelNumber ? `
Your Rachel AI Number: ${clientInfo.rachelNumber}
Business: ${clientInfo.businessName || 'Your Business'}
Free Trial Minutes: 100 minutes
` : ''}

Next Steps:
- Set up your business hours and preferences
- Configure your Rachel AI assistant
- Test your voice AI system
- Start taking calls with AI-powered assistance

Visit your dashboard: ${this.baseUrl}/dashboard

If you have any questions, our support team is here to help!

---
RinglyPro CRM
        `.trim();
    }
}

module.exports = new EmailService();
