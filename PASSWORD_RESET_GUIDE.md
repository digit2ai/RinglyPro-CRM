# Password Reset Functionality - RinglyPro CRM

## Overview

The RinglyPro CRM now includes a complete password reset system that allows users to securely reset their passwords via email.

## Features

✅ **Secure Token-Based Reset** - Uses cryptographically secure random tokens
✅ **Time-Limited Tokens** - Reset links expire after 1 hour
✅ **Email Integration** - Sends password reset emails (development mode logs to console)
✅ **Beautiful UI** - Modern, responsive UI with password strength indicator
✅ **Security Best Practices** - Prevents email enumeration, validates tokens
✅ **User-Friendly Flow** - Clear instructions and error messages

## Architecture

### Backend Components

1. **User Model Updates** (`src/models/User.js`)
   - `password_reset_token` - Stores the reset token
   - `password_reset_expires` - Token expiration timestamp

2. **Email Service** (`src/services/emailService.js`)
   - Sends password reset emails
   - Includes HTML and text templates
   - Development mode: logs to console
   - Production ready: supports SendGrid, AWS SES, Mailgun

3. **API Endpoints** (`src/routes/auth.js`)
   - `POST /api/auth/forgot-password` - Request password reset
   - `POST /api/auth/reset-password` - Reset password with token
   - `GET /api/auth/verify-reset-token/:token` - Verify token validity

### Frontend Components

1. **Forgot Password Page** (`views/forgot-password.ejs`)
   - Email input form
   - Success confirmation
   - Troubleshooting tips

2. **Reset Password Page** (`views/reset-password.ejs`)
   - Token verification
   - New password form
   - Password strength indicator
   - Real-time validation

## User Flow

```
1. User clicks "Forgot Password?" on login page
   ↓
2. User enters email address
   ↓
3. System generates secure token and sends email
   ↓
4. User clicks reset link in email
   ↓
5. System verifies token is valid and not expired
   ↓
6. User enters new password
   ↓
7. System updates password and clears token
   ↓
8. User redirected to login with success message
```

## Security Features

### Token Generation
- Uses Node.js `crypto.randomBytes(32)` for secure random tokens
- 64-character hexadecimal string (256 bits of entropy)
- One-time use - token is cleared after successful reset

### Token Expiration
- Tokens expire after 1 hour
- Checked on both verification and reset endpoints
- Expired tokens cannot be reused

### Email Enumeration Prevention
- Always returns success message, regardless of email existence
- Prevents attackers from discovering valid email addresses
- Logs suspicious activity for security monitoring

### Password Requirements
- Minimum 8 characters
- Real-time validation
- Password strength indicator
- Must match confirmation

## API Documentation

### 1. Request Password Reset

**Endpoint:** `POST /api/auth/forgot-password`

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "If that email exists, a password reset link has been sent."
}
```

**Notes:**
- Always returns success to prevent email enumeration
- If email doesn't exist, no email is sent but response is identical
- Token is valid for 1 hour

---

### 2. Reset Password

**Endpoint:** `POST /api/auth/reset-password`

**Request Body:**
```json
{
  "token": "abc123...xyz789",
  "password": "newSecurePassword123"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Password has been reset successfully. You can now log in with your new password."
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "Invalid or expired password reset token"
}
```

**Validation:**
- Password must be at least 8 characters
- Token must be valid and not expired
- Token is single-use only

---

### 3. Verify Reset Token

**Endpoint:** `GET /api/auth/verify-reset-token/:token`

**Success Response (200):**
```json
{
  "success": true,
  "valid": true,
  "message": "Token is valid",
  "email": "user@example.com"
}
```

**Error Response (400):**
```json
{
  "success": false,
  "valid": false,
  "error": "Invalid or expired password reset token"
}
```

## Database Migration

To add the password reset fields to your existing database:

```bash
# Run the migration
npm run migrate

# Or manually add the columns:
ALTER TABLE users ADD COLUMN password_reset_token VARCHAR(255);
ALTER TABLE users ADD COLUMN password_reset_expires TIMESTAMP;
```

## Email Service Setup

### Development Mode
In development, emails are logged to the console instead of being sent:

```
📧 Password Reset Email (Development Mode)
═══════════════════════════════════════════
To: user@example.com
Subject: Reset Your RinglyPro Password
Reset URL: http://localhost:3000/reset-password?token=abc123...
═══════════════════════════════════════════
```

### Production Setup

Choose an email provider and configure:

#### Option 1: SendGrid
```bash
npm install @sendgrid/mail
```

Set environment variable:
```bash
SENDGRID_API_KEY=your_api_key_here
```

#### Option 2: AWS SES
```bash
npm install aws-sdk
```

Set environment variables:
```bash
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
```

#### Option 3: Mailgun
```bash
npm install mailgun-js
```

Set environment variables:
```bash
MAILGUN_API_KEY=your_api_key
MAILGUN_DOMAIN=your_domain.com
```

Update `src/services/emailService.js` to integrate your chosen provider.

## Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/forgot-password` | GET | Forgot password form page |
| `/reset-password?token=xxx` | GET | Reset password form page |
| `/api/auth/forgot-password` | POST | Request password reset |
| `/api/auth/reset-password` | POST | Submit new password |
| `/api/auth/verify-reset-token/:token` | GET | Verify token is valid |

## Testing the Flow

### Manual Testing

1. **Start the server:**
   ```bash
   npm start
   ```

2. **Request password reset:**
   ```bash
   curl -X POST http://localhost:3000/api/auth/forgot-password \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com"}'
   ```

3. **Check console for reset link** (development mode)

4. **Verify token:**
   ```bash
   curl http://localhost:3000/api/auth/verify-reset-token/TOKEN_HERE
   ```

5. **Reset password:**
   ```bash
   curl -X POST http://localhost:3000/api/auth/reset-password \
     -H "Content-Type: application/json" \
     -d '{"token":"TOKEN_HERE","password":"newPassword123"}'
   ```

6. **Test login with new password:**
   ```bash
   curl -X POST http://localhost:3000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"newPassword123"}'
   ```

### UI Testing

1. Navigate to: `http://localhost:3000/login`
2. Click "Forgot password?"
3. Enter your email address
4. Check console for reset link (development mode)
5. Copy the token from the URL
6. Navigate to: `http://localhost:3000/reset-password?token=YOUR_TOKEN`
7. Enter new password
8. Submit and verify redirect to login
9. Login with new password

## Error Handling

The system handles various error scenarios:

- **Invalid email format** - Validation error
- **Non-existent email** - Success response (prevents enumeration)
- **Expired token** - Clear error message
- **Invalid token** - Clear error message
- **Weak password** - Real-time validation feedback
- **Password mismatch** - Clear error message
- **Network errors** - User-friendly error display

## Customization

### Email Templates

Customize email templates in `src/services/emailService.js`:

- `getPasswordResetTemplate()` - HTML version
- `getPasswordResetTextVersion()` - Plain text version

### Token Expiration

Change token expiration time in `src/routes/auth.js`:

```javascript
// Default: 1 hour (3600000 ms)
const resetTokenExpiry = new Date(Date.now() + 3600000);

// Change to 30 minutes:
const resetTokenExpiry = new Date(Date.now() + 1800000);

// Change to 2 hours:
const resetTokenExpiry = new Date(Date.now() + 7200000);
```

### Password Requirements

Update requirements in `src/routes/auth.js`:

```javascript
// Current: minimum 8 characters
if (password.length < 8) {
  return res.status(400).json({
    error: 'Password must be at least 8 characters long'
  });
}

// Add more requirements:
if (!/[A-Z]/.test(password)) {
  return res.status(400).json({
    error: 'Password must contain at least one uppercase letter'
  });
}
```

## Troubleshooting

### Token not found in database
- Check database sync: `npm run sync-models`
- Run migration: `npm run migrate`
- Verify User model has new fields

### Email not sending
- Check console logs in development mode
- Verify email service configuration
- Check SMTP settings (if using SMTP)
- Verify API keys (if using SendGrid/SES/Mailgun)

### Token expired immediately
- Check server time is correct
- Verify timezone settings
- Check token expiration time in code

### Password not updating
- Check bcrypt is installed
- Verify salt rounds configuration
- Check database permissions
- Review server logs for errors

## Security Considerations

1. **HTTPS Required** - Use HTTPS in production to protect tokens in transit
2. **Rate Limiting** - Add rate limiting to prevent brute force attacks
3. **Token Storage** - Tokens stored hashed in database (recommended for production)
4. **Account Lockout** - Consider account lockout after multiple failed attempts
5. **2FA** - Consider adding two-factor authentication for enhanced security

## Future Enhancements

- [ ] Email template customization UI
- [ ] Account lockout after failed attempts
- [ ] Password history to prevent reuse
- [ ] Two-factor authentication integration
- [ ] SMS-based password reset option
- [ ] Security questions as alternative
- [ ] Admin password reset capability
- [ ] Audit log for password changes

## Support

For issues or questions:
- Check server logs for detailed error messages
- Review this documentation
- Contact: support@ringlypro.com

---

**Last Updated:** October 3, 2025
**Version:** 2.0.0
**Status:** ✅ Production Ready
