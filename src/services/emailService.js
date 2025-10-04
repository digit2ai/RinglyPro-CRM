// src/services/emailService.js - Email service using SendGrid
const sgMail = require('@sendgrid/mail');

// Initialize SendGrid with API key
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@ringlypro.com';
const FROM_NAME = process.env.FROM_NAME || 'RinglyPro Support';
const APP_URL = process.env.APP_URL || 'https://aiagent.ringlypro.com';

if (SENDGRID_API_KEY) {
    sgMail.setApiKey(SENDGRID_API_KEY);
    console.log('✅ SendGrid email service initialized');
} else {
    console.log('⚠️  SendGrid API key not found - emails will not be sent');
}

/**
 * Send password reset email
 */
async function sendPasswordResetEmail(email, resetToken, userName) {
    if (!SENDGRID_API_KEY) {
        console.log('⚠️  SendGrid not configured - skipping email send');
        console.log(\`🔗 Reset link: \${APP_URL}/reset-password?token=\${resetToken}\`);
        return { success: false, reason: 'SendGrid not configured' };
    }

    const resetLink = \`\${APP_URL}/reset-password?token=\${resetToken}\`;

    const msg = {
        to: email,
        from: {
            email: FROM_EMAIL,
            name: FROM_NAME
        },
        subject: 'Reset Your RinglyPro Password',
        text: \`Hello \${userName || 'there'},

You requested to reset your password for your RinglyPro account.

Click the link below to reset your password:
\${resetLink}

This link will expire in 1 hour for security reasons.

If you didn't request this password reset, please ignore this email.

Best regards,
The RinglyPro Team\`,
        html: \`<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .header h1 { color: white; margin: 0; }
        .content { background: white; padding: 30px; border: 1px solid #e5e7eb; }
        .button { display: inline-block; background: #4f46e5; color: white; padding: 14px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .footer { text-align: center; color: #6b7280; margin-top: 20px; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔐 RinglyPro Password Reset</h1>
        </div>
        <div class="content">
            <p>Hello <strong>\${userName || 'there'}</strong>,</p>
            <p>You requested to reset your password for your RinglyPro account.</p>
            <p>Click the button below to reset your password:</p>
            <div style="text-align: center;">
                <a href="\${resetLink}" class="button">Reset My Password</a>
            </div>
            <p style="color: #f59e0b;"><strong>⏰ Important:</strong> This link will expire in 1 hour.</p>
            <p style="font-size: 14px; color: #6b7280;">If the button doesn't work, copy this link: <br><code>\${resetLink}</code></p>
            <hr>
            <p style="font-size: 14px; color: #6b7280;">If you didn't request this, please ignore this email.</p>
        </div>
        <div class="footer">
            <p>RinglyPro - AI-Powered Voice Assistant</p>
        </div>
    </div>
</body>
</html>\`
    };

    try {
        await sgMail.send(msg);
        console.log(\`✅ Password reset email sent to: \${email}\`);
        return { success: true };
    } catch (error) {
        console.error('❌ SendGrid error:', error.response?.body || error.message);
        return { success: false, error: error.message };
    }
}

module.exports = {
    sendPasswordResetEmail
};
