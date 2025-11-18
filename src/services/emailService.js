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
 * Send welcome email to new users with instructions on how to use RinglyPro
 * @param {Object} options Welcome email options
 * @param {String} options.email User's email
 * @param {String} options.firstName User's first name
 * @param {String} options.lastName User's last name
 * @param {String} options.businessName Business name
 * @param {String} options.ringlyproNumber Assigned Twilio number
 * @param {String} options.ccEmail CC recipient email (admin notification)
 */
async function sendWelcomeEmail({ email, firstName, lastName, businessName, ringlyproNumber, ccEmail }) {
    if (!SENDGRID_API_KEY) {
        console.log('SendGrid not configured - skipping welcome email');
        return { success: false, reason: 'SendGrid not configured' };
    }

    const dashboardUrl = APP_URL + '/dashboard';
    const supportEmail = 'support@ringlypro.com';

    const msg = {
        to: email,
        cc: ccEmail || undefined,
        from: {
            email: FROM_EMAIL,
            name: FROM_NAME
        },
        subject: `Welcome to RinglyPro, ${firstName}! Let's Get You Started`,
        text: `Welcome to RinglyPro, ${firstName}!

Thank you for signing up for RinglyPro - your AI-powered voice assistant for ${businessName}.

YOUR RINGLYPRO NUMBER: ${ringlyproNumber}

GETTING STARTED:

1. LOG IN TO YOUR DASHBOARD
   Visit: ${dashboardUrl}

2. ACTIVATE RACHEL AI
   Go to your Dashboard and toggle "Rachel AI" to ON to activate your AI assistant.

3. SET UP CALL FORWARDING
   Forward your business calls to your RinglyPro number (${ringlyproNumber}).
   This allows Rachel AI to answer calls when you're busy.

4. CUSTOMIZE YOUR GREETING
   Visit Dashboard > Settings to personalize how Rachel greets your callers.

5. MANAGE APPOINTMENTS
   Rachel can book appointments for you! Configure your availability in Settings.

YOUR FREE TRIAL:
You have 100 free minutes to try RinglyPro. After that, it's just $0.10/minute.

NEED HELP?
- Visit our documentation at ${APP_URL}/docs
- Email us at ${supportEmail}
- Call our support line

We're excited to have you on board!

Best regards,
The RinglyPro Team`,
        html: `<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .header h1 { color: white; margin: 0; font-size: 28px; }
        .header p { color: rgba(255,255,255,0.9); margin: 10px 0 0; }
        .content { background: white; padding: 30px; border: 1px solid #e5e7eb; }
        .phone-box { background: #f0f9ff; border: 2px solid #3b82f6; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
        .phone-number { font-size: 24px; font-weight: bold; color: #1e40af; letter-spacing: 1px; }
        .step { background: #f8fafc; border-left: 4px solid #4f46e5; padding: 15px; margin: 15px 0; border-radius: 0 8px 8px 0; }
        .step-number { background: #4f46e5; color: white; border-radius: 50%; width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; font-weight: bold; margin-right: 10px; }
        .step-title { font-weight: bold; color: #1e3a5f; }
        .button { display: inline-block; background: #4f46e5; color: white; padding: 14px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
        .trial-box { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px; margin: 20px 0; }
        .footer { text-align: center; color: #6b7280; margin-top: 20px; font-size: 14px; padding: 20px; background: #f9fafb; border-radius: 0 0 10px 10px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Welcome to RinglyPro!</h1>
            <p>Your AI-Powered Voice Assistant</p>
        </div>
        <div class="content">
            <p>Hello <strong>${firstName}</strong>,</p>
            <p>Thank you for signing up for RinglyPro! We're excited to help <strong>${businessName}</strong> never miss another call.</p>

            <div class="phone-box">
                <p style="margin: 0 0 10px; color: #64748b;">Your RinglyPro Number</p>
                <div class="phone-number">${ringlyproNumber}</div>
            </div>

            <h2 style="color: #1e3a5f; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">Getting Started</h2>

            <div class="step">
                <span class="step-number">1</span>
                <span class="step-title">Log In to Your Dashboard</span>
                <p style="margin: 10px 0 0; color: #64748b;">Access all your settings and call history at <a href="${dashboardUrl}">${dashboardUrl}</a></p>
            </div>

            <div class="step">
                <span class="step-number">2</span>
                <span class="step-title">Activate Rachel AI</span>
                <p style="margin: 10px 0 0; color: #64748b;">Toggle "Rachel AI" to ON in your Dashboard to start receiving AI-answered calls.</p>
            </div>

            <div class="step">
                <span class="step-number">3</span>
                <span class="step-title">Set Up Call Forwarding</span>
                <p style="margin: 10px 0 0; color: #64748b;">Forward your business calls to <strong>${ringlyproNumber}</strong> so Rachel can answer when you're busy.</p>
            </div>

            <div class="step">
                <span class="step-number">4</span>
                <span class="step-title">Customize Your Greeting</span>
                <p style="margin: 10px 0 0; color: #64748b;">Personalize how Rachel greets your callers in Dashboard > Settings.</p>
            </div>

            <div class="step">
                <span class="step-number">5</span>
                <span class="step-title">Configure Appointments</span>
                <p style="margin: 10px 0 0; color: #64748b;">Let Rachel book appointments for you! Set your availability in Settings.</p>
            </div>

            <div style="text-align: center;">
                <a href="${dashboardUrl}" class="button">Go to Dashboard</a>
            </div>

            <div class="trial-box">
                <strong>Your Free Trial</strong>
                <p style="margin: 5px 0 0;">You have <strong>100 free minutes</strong> to try RinglyPro. After that, it's just $0.10/minute with no contracts or commitments.</p>
            </div>

            <h3 style="color: #1e3a5f;">Need Help?</h3>
            <ul style="color: #64748b;">
                <li>Email us at <a href="mailto:${supportEmail}">${supportEmail}</a></li>
                <li>Visit our help center at <a href="${APP_URL}/docs">${APP_URL}/docs</a></li>
            </ul>

            <p>We're here to help you succeed!</p>
            <p><strong>The RinglyPro Team</strong></p>
        </div>
        <div class="footer">
            <p>RinglyPro - Never Miss Another Call</p>
            <p style="font-size: 12px; color: #9ca3af;">&copy; ${new Date().getFullYear()} RinglyPro. All rights reserved.</p>
        </div>
    </div>
</body>
</html>`
    };

    try {
        await sgMail.send(msg);
        console.log(`Welcome email sent to: ${email}` + (ccEmail ? ` (CC: ${ccEmail})` : ''));
        return { success: true };
    } catch (error) {
        console.error('SendGrid welcome email error:', error.response ? error.response.body : error.message);
        return { success: false, error: error.message };
    }
}

async function sendPasswordResetEmail(email, resetToken, userName) {
    if (!SENDGRID_API_KEY) {
        console.log('⚠️  SendGrid not configured - skipping email send');
        console.log('🔗 Reset link: ' + APP_URL + '/reset-password?token=' + resetToken);
        return { success: false, reason: 'SendGrid not configured' };
    }

    const resetLink = APP_URL + '/reset-password?token=' + resetToken;

    const msg = {
        to: email,
        from: {
            email: FROM_EMAIL,
            name: FROM_NAME
        },
        subject: 'Reset Your RinglyPro Password',
        text: 'Hello ' + (userName || 'there') + ',\n\nYou requested to reset your password for your RinglyPro account.\n\nClick the link below to reset your password:\n' + resetLink + '\n\nThis link will expire in 1 hour for security reasons.\n\nIf you did not request this password reset, please ignore this email.\n\nBest regards,\nThe RinglyPro Team',
        html: '<!DOCTYPE html><html><head><style>body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }.container { max-width: 600px; margin: 0 auto; padding: 20px; }.header { background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }.header h1 { color: white; margin: 0; }.content { background: white; padding: 30px; border: 1px solid #e5e7eb; }.button { display: inline-block; background: #4f46e5; color: white; padding: 14px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }.footer { text-align: center; color: #6b7280; margin-top: 20px; font-size: 14px; }</style></head><body><div class="container"><div class="header"><h1>🔐 RinglyPro Password Reset</h1></div><div class="content"><p>Hello <strong>' + (userName || 'there') + '</strong>,</p><p>You requested to reset your password for your RinglyPro account.</p><p>Click the button below to reset your password:</p><div style="text-align: center;"><a href="' + resetLink + '" class="button">Reset My Password</a></div><p style="color: #f59e0b;"><strong>⏰ Important:</strong> This link will expire in 1 hour.</p><p style="font-size: 14px; color: #6b7280;">If the button does not work, copy this link: <br><code>' + resetLink + '</code></p><hr><p style="font-size: 14px; color: #6b7280;">If you did not request this, please ignore this email.</p></div><div class="footer"><p>RinglyPro - AI-Powered Voice Assistant</p></div></div></body></html>'
    };

    try {
        await sgMail.send(msg);
        console.log('✅ Password reset email sent to: ' + email);
        return { success: true };
    } catch (error) {
        console.error('❌ SendGrid error:', error.response ? error.response.body : error.message);
        return { success: false, error: error.message };
    }
}

module.exports = {
    sendPasswordResetEmail,
    sendWelcomeEmail
};
