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
    const supportEmail = 'info@ringlypro.com';

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

/**
 * Send partnership agreement confirmation email to partner
 * @param {Object} options Partnership email options
 * @param {String} options.email Partner's email
 * @param {String} options.firstName Partner's first name
 * @param {String} options.lastName Partner's last name
 * @param {String} options.company Company name (optional)
 */
async function sendPartnershipConfirmationEmail({ email, firstName, lastName, company }) {
    if (!SENDGRID_API_KEY) {
        console.log('SendGrid not configured - skipping partnership confirmation email');
        return { success: false, reason: 'SendGrid not configured' };
    }

    const partnerName = company || `${firstName} ${lastName}`;
    const dashboardUrl = APP_URL;
    const roadmapUrl = `${APP_URL}/partnership-roadmap`;

    const msg = {
        to: email,
        from: {
            email: 'mstagg@digit2ai.com',
            name: 'Manuel Stagg - RinglyPro Partnership'
        },
        subject: `Welcome to the RinglyPro Partnership Program, ${firstName}!`,
        text: `Dear ${firstName},

Thank you for joining the RinglyPro Partnership Program!

We've received your partnership agreement and are excited to have ${partnerName} as an official partner.

WHAT HAPPENS NEXT:

1. AGREEMENT REVIEW
   Our team will review your partnership agreement within 1-2 business days.

2. ACCOUNT ACTIVATION
   Once approved, you'll receive access to your partner dashboard with your unique referral link.

3. START EARNING
   Begin sharing your referral link and earn 50% of profits from your referred customers!

YOUR PARTNERSHIP BENEFITS:
- 50% profit share on all referred customers
- Lifetime recurring revenue from your referrals
- Monthly payouts
- Dedicated partner support

NEXT STEPS:
Visit your partnership roadmap: ${roadmapUrl}

Questions? Contact us:
Manuel Stagg - Founder
Phone: (656) 600-1400
Email: mstagg@digit2ai.com

We're thrilled to partner with you!

Best regards,
The RinglyPro Partnership Team`,
        html: `<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 0; background: #f5f5f7; }
        .header { background: linear-gradient(135deg, #0b1e3e 0%, #1e3a5f 100%); padding: 40px 30px; text-align: center; }
        .header h1 { color: white; margin: 0; font-size: 28px; }
        .header p { color: rgba(255,255,255,0.9); margin: 10px 0 0; font-size: 16px; }
        .content { background: white; padding: 40px 30px; }
        .logo { text-align: center; margin-bottom: 30px; }
        .success-box { background: #f0fdf4; border: 2px solid #22c55e; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0; }
        .success-icon { font-size: 48px; margin-bottom: 10px; }
        .step { background: #f8fafc; border-left: 4px solid #FF914D; padding: 20px; margin: 15px 0; border-radius: 0 8px 8px 0; }
        .step-number { background: #FF914D; color: white; border-radius: 50%; width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; font-weight: bold; margin-right: 12px; font-size: 16px; }
        .step-title { font-weight: bold; color: #0b1e3e; font-size: 16px; }
        .benefits-box { background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%); border: 2px solid #FF914D; border-radius: 12px; padding: 25px; margin: 25px 0; }
        .benefit-item { display: flex; align-items: center; margin: 12px 0; }
        .benefit-icon { color: #FF914D; font-size: 20px; margin-right: 12px; }
        .button { display: inline-block; background: linear-gradient(135deg, #FF914D 0%, #ff6b35 100%); color: white; padding: 16px 36px; text-decoration: none; border-radius: 50px; margin: 20px 0; font-weight: bold; font-size: 16px; box-shadow: 0 4px 12px rgba(255, 145, 77, 0.3); }
        .contact-box { background: #f0f9ff; border-radius: 12px; padding: 20px; margin: 25px 0; }
        .footer { text-align: center; color: #6b7280; padding: 30px; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🤝 Welcome to RinglyPro Partnership!</h1>
            <p>Your Partnership Agreement Has Been Received</p>
        </div>
        <div class="content">
            <div class="success-box">
                <div class="success-icon">✅</div>
                <h2 style="color: #22c55e; margin: 10px 0;">Partnership Agreement Submitted!</h2>
                <p style="margin: 10px 0; color: #64748b;">Thank you for partnering with RinglyPro, ${firstName}!</p>
            </div>

            <p>Dear <strong>${firstName}</strong>,</p>
            <p>We've received your partnership agreement for <strong>${partnerName}</strong> and are excited to have you as an official RinglyPro partner!</p>

            <h2 style="color: #0b1e3e; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; margin-top: 30px;">What Happens Next?</h2>

            <div class="step">
                <span class="step-number">1</span>
                <span class="step-title">Agreement Review</span>
                <p style="margin: 10px 0 0; color: #64748b;">Our team will review your partnership agreement within 1-2 business days.</p>
            </div>

            <div class="step">
                <span class="step-number">2</span>
                <span class="step-title">Account Activation</span>
                <p style="margin: 10px 0 0; color: #64748b;">Once approved, you'll receive access to your partner dashboard with your unique referral link.</p>
            </div>

            <div class="step">
                <span class="step-number">3</span>
                <span class="step-title">Start Earning</span>
                <p style="margin: 10px 0 0; color: #64748b;">Begin sharing your referral link and earn 50% of profits from your referred customers!</p>
            </div>

            <div class="benefits-box">
                <h3 style="color: #0b1e3e; margin-top: 0; text-align: center;">Your Partnership Benefits</h3>
                <div class="benefit-item">
                    <span class="benefit-icon">💰</span>
                    <strong>50% profit share</strong> on all referred customers
                </div>
                <div class="benefit-item">
                    <span class="benefit-icon">🔄</span>
                    <strong>Lifetime recurring revenue</strong> from your referrals
                </div>
                <div class="benefit-item">
                    <span class="benefit-icon">📅</span>
                    <strong>Monthly payouts</strong> directly to your account
                </div>
                <div class="benefit-item">
                    <span class="benefit-icon">🎯</span>
                    <strong>Dedicated partner support</strong> team
                </div>
            </div>

            <div style="text-align: center; margin: 30px 0;">
                <a href="${roadmapUrl}" class="button">View Partnership Roadmap</a>
            </div>

            <div class="contact-box">
                <h3 style="color: #0b1e3e; margin-top: 0;">Questions About Your Partnership?</h3>
                <p style="margin: 10px 0;"><strong>Manuel Stagg - Founder</strong></p>
                <p style="margin: 5px 0;">📱 Phone: <a href="tel:6566001400" style="color: #FF914D; text-decoration: none;">(656) 600-1400</a></p>
                <p style="margin: 5px 0;">✉️ Email: <a href="mailto:mstagg@digit2ai.com" style="color: #FF914D; text-decoration: none;">mstagg@digit2ai.com</a></p>
            </div>

            <p style="margin-top: 30px;">We're thrilled to partner with you and help you build a successful revenue stream!</p>
            <p><strong>The RinglyPro Partnership Team</strong></p>
        </div>
        <div class="footer">
            <p><strong>RinglyPro Partnership Program</strong></p>
            <p style="font-size: 12px; color: #9ca3af; margin-top: 10px;">&copy; ${new Date().getFullYear()} RinglyPro. All rights reserved.</p>
            <p style="font-size: 12px; margin-top: 10px;"><a href="${APP_URL}" style="color: #FF914D; text-decoration: none;">Visit Dashboard</a> | <a href="${roadmapUrl}" style="color: #FF914D; text-decoration: none;">Partnership Roadmap</a></p>
        </div>
    </div>
</body>
</html>`
    };

    try {
        await sgMail.send(msg);
        console.log(`Partnership confirmation email sent to: ${email}`);
        return { success: true };
    } catch (error) {
        console.error('SendGrid partnership email error:', error.response ? error.response.body : error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Send partnership notification to admin
 * @param {Object} partnerData Partner information
 */
async function sendPartnershipAdminNotification(partnerData) {
    if (!SENDGRID_API_KEY) {
        console.log('SendGrid not configured - skipping admin notification');
        return { success: false, reason: 'SendGrid not configured' };
    }

    const adminEmail = 'mstagg@digit2ai.com';
    const { firstName, lastName, email, phone, company, address, city, state, zip, taxId, timestamp } = partnerData;

    const msg = {
        to: adminEmail,
        from: {
            email: 'mstagg@digit2ai.com',
            name: 'RinglyPro Partnership System'
        },
        subject: `New Partnership Agreement: ${firstName} ${lastName}`,
        text: `NEW PARTNERSHIP AGREEMENT SUBMITTED

Partner Information:
- Name: ${firstName} ${lastName}
- Company: ${company || 'N/A'}
- Email: ${email}
- Phone: ${phone}

Business Details:
- Address: ${address}, ${city}, ${state} ${zip}
- Tax ID: ${taxId}

Submission Time: ${timestamp || new Date().toISOString()}

Next Steps:
1. Review the partnership agreement
2. Approve the partner in the system
3. Provide partner dashboard access

Login to review: ${APP_URL}/admin`,
        html: `<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f7; }
        .header { background: #0b1e3e; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .header h1 { color: white; margin: 0; font-size: 24px; }
        .content { background: white; padding: 30px; border: 1px solid #e5e7eb; }
        .info-box { background: #f8fafc; border-left: 4px solid #FF914D; padding: 15px; margin: 15px 0; border-radius: 0 8px 8px 0; }
        .info-label { font-weight: bold; color: #0b1e3e; display: inline-block; width: 120px; }
        .button { display: inline-block; background: #FF914D; color: white; padding: 14px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
        .footer { text-align: center; color: #6b7280; padding: 20px; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🆕 New Partnership Agreement</h1>
        </div>
        <div class="content">
            <p style="background: #fef3c7; padding: 15px; border-radius: 8px; border: 1px solid #f59e0b;"><strong>⚠️ Action Required:</strong> A new partnership agreement has been submitted and requires review.</p>

            <h2 style="color: #0b1e3e; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">Partner Information</h2>
            <div class="info-box">
                <p><span class="info-label">Name:</span> ${firstName} ${lastName}</p>
                <p><span class="info-label">Company:</span> ${company || 'N/A'}</p>
                <p><span class="info-label">Email:</span> <a href="mailto:${email}">${email}</a></p>
                <p><span class="info-label">Phone:</span> <a href="tel:${phone}">${phone}</a></p>
            </div>

            <h2 style="color: #0b1e3e; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">Business Details</h2>
            <div class="info-box">
                <p><span class="info-label">Address:</span> ${address}</p>
                <p><span class="info-label">City/State:</span> ${city}, ${state} ${zip}</p>
                <p><span class="info-label">Tax ID:</span> ${taxId}</p>
            </div>

            <div class="info-box" style="border-left-color: #3b82f6;">
                <p><span class="info-label">Submitted:</span> ${timestamp || new Date().toISOString()}</p>
            </div>

            <h3 style="color: #0b1e3e;">Next Steps:</h3>
            <ol style="color: #64748b;">
                <li>Review the partnership agreement details</li>
                <li>Approve the partner in the system</li>
                <li>Provide partner dashboard access and unique referral link</li>
            </ol>

            <div style="text-align: center;">
                <a href="${APP_URL}/admin" class="button">Review in Admin Dashboard</a>
            </div>
        </div>
        <div class="footer">
            <p><strong>RinglyPro Partnership System</strong></p>
            <p style="font-size: 12px; color: #9ca3af;">Automated notification - Do not reply</p>
        </div>
    </div>
</body>
</html>`
    };

    try {
        await sgMail.send(msg);
        console.log(`Partnership admin notification sent to: ${adminEmail}`);
        return { success: true };
    } catch (error) {
        console.error('SendGrid admin notification error:', error.response ? error.response.body : error.message);
        return { success: false, error: error.message };
    }
}

module.exports = {
    sendPasswordResetEmail,
    sendWelcomeEmail,
    sendPartnershipConfirmationEmail,
    sendPartnershipAdminNotification
};
