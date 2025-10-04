# Complete Authentication System - RinglyPro CRM

## Overview

RinglyPro CRM now has a **production-ready, enterprise-grade authentication system** with comprehensive security features.

## 🔐 Features

### Core Authentication
- ✅ **JWT-based authentication** with 7-day expiration
- ✅ **Password hashing** with bcrypt (12 salt rounds)
- ✅ **Email/password login**
- ✅ **User registration** with Twilio auto-provisioning
- ✅ **Password reset** via email with secure tokens
- ✅ **Protected routes** with JWT middleware
- ✅ **Token refresh** mechanism
- ✅ **Logout** functionality

### Security Features
- ✅ **Rate limiting** on all auth endpoints
- ✅ **Brute force protection** (5 login attempts per 15 min)
- ✅ **Email enumeration prevention**
- ✅ **Secure password requirements** (minimum 8 characters)
- ✅ **One-time reset tokens** (1-hour expiration)
- ✅ **Client-side and server-side validation**

### User Experience
- ✅ **Beautiful, responsive UI** (login, signup, forgot/reset password)
- ✅ **Real-time password strength indicator**
- ✅ **Clear error messages**
- ✅ **Auto-redirect** on authentication state
- ✅ **Remember me** functionality
- ✅ **Automatic token refresh**

---

## 📚 API Endpoints

### Public Endpoints (No Authentication Required)

#### 1. User Registration
```http
POST /api/auth/register
```

**Rate Limit:** 3 requests per hour per IP

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "firstName": "John",
  "lastName": "Doe",
  "businessName": "Acme Corp",
  "businessPhone": "+18005551234",
  "businessType": "professional",
  "phoneNumber": "+18005555678",
  "websiteUrl": "https://acme.com",
  "businessDescription": "Professional services company",
  "businessHours": {
    "open": "09:00",
    "close": "17:00"
  },
  "services": "Consulting, Training",
  "termsAccepted": true
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Registration successful! Welcome to RinglyPro!",
  "data": {
    "user": {
      "id": 1,
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "businessName": "Acme Corp",
      "freeTrialMinutes": 100
    },
    "client": {
      "id": 1,
      "rachelNumber": "+18001234567",
      "rachelEnabled": true
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "nextSteps": {
      "dashboard": "/dashboard",
      "setupPhone": "/setup/phone",
      "testAI": "/test-assistant"
    }
  }
}
```

---

#### 2. User Login
```http
POST /api/auth/login
```

**Rate Limit:** 5 attempts per 15 minutes per IP (successful logins don't count)

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "data": {
    "user": {
      "id": 1,
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "businessName": "Acme Corp",
      "onboardingCompleted": true
    },
    "client": {
      "id": 1,
      "rachelNumber": "+18001234567",
      "rachelEnabled": true
    },
    "redirectTo": "/dashboard"
  }
}
```

**Error Response (401):**
```json
{
  "error": "Invalid email or password"
}
```

**Rate Limit Response (429):**
```json
{
  "success": false,
  "error": "Too many login attempts. Please try again in 15 minutes."
}
```

---

#### 3. Request Password Reset
```http
POST /api/auth/forgot-password
```

**Rate Limit:** 3 requests per hour per IP

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "If that email exists, a password reset link has been sent."
}
```

**Note:** Always returns success to prevent email enumeration.

---

#### 4. Reset Password
```http
POST /api/auth/reset-password
```

**Rate Limit:** 100 requests per 15 minutes

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

---

#### 5. Verify Reset Token
```http
GET /api/auth/verify-reset-token/:token
```

**Success Response (200):**
```json
{
  "success": true,
  "valid": true,
  "message": "Token is valid",
  "email": "user@example.com"
}
```

---

### Protected Endpoints (Authentication Required)

All protected endpoints require the `Authorization` header:
```
Authorization: Bearer <your-jwt-token>
```

---

#### 6. Get User Profile
```http
GET /api/auth/profile
```

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "businessName": "Acme Corp",
      "businessType": "professional",
      "businessPhone": "+18005551234",
      "phoneNumber": "+18005555678",
      "websiteUrl": "https://acme.com",
      "businessDescription": "Professional services",
      "businessHours": {...},
      "services": "Consulting",
      "freeTrialMinutes": 100,
      "emailVerified": false,
      "onboardingCompleted": true,
      "createdAt": "2025-10-03T12:00:00.000Z",
      "updatedAt": "2025-10-03T12:00:00.000Z"
    },
    "client": {
      "id": 1,
      "businessName": "Acme Corp",
      "rachelEnabled": true
    }
  }
}
```

---

#### 7. Update User Profile
```http
POST /api/auth/update-profile
```

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Request Body** (all fields optional):
```json
{
  "firstName": "Jane",
  "lastName": "Smith",
  "businessName": "New Business Name",
  "businessType": "healthcare",
  "phoneNumber": "+18005559999",
  "websiteUrl": "https://newsite.com",
  "businessDescription": "Updated description",
  "businessHours": {
    "open": "08:00",
    "close": "18:00"
  },
  "services": "New services"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "user": {...}
  }
}
```

---

#### 8. Refresh Token
```http
POST /api/auth/refresh-token
```

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "7d"
}
```

---

#### 9. Logout
```http
POST /api/auth/logout
```

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

**Note:** Client should remove token from localStorage.

---

#### 10. Verify Token
```http
GET /api/auth/verify
```

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Success Response (200):**
```json
{
  "success": true,
  "valid": true,
  "user": {
    "userId": 1,
    "email": "user@example.com",
    "businessName": "Acme Corp"
  }
}
```

---

## 🔒 Security Implementation

### Rate Limiting

| Endpoint | Limit | Window | Purpose |
|----------|-------|--------|---------|
| `/api/auth/login` | 5 requests | 15 min | Prevent brute force |
| `/api/auth/register` | 3 requests | 1 hour | Prevent spam |
| `/api/auth/forgot-password` | 3 requests | 1 hour | Prevent email spam |
| `/api/auth/reset-password` | 100 requests | 15 min | General protection |
| Other auth endpoints | 100 requests | 15 min | General protection |

### Password Security

1. **Hashing:** bcrypt with 12 salt rounds
2. **Requirements:** Minimum 8 characters
3. **Reset tokens:** Cryptographically secure (256 bits)
4. **Token expiration:** 1 hour for reset tokens
5. **Single-use:** Reset tokens cleared after use

### JWT Tokens

- **Algorithm:** HS256
- **Expiration:** 7 days
- **Payload:**
  ```json
  {
    "userId": 1,
    "email": "user@example.com",
    "businessName": "Acme Corp",
    "businessType": "professional",
    "clientId": 1
  }
  ```

---

## 🎨 Frontend Pages

### Login Page
**Route:** `/login`

Features:
- Email and password fields
- Password visibility toggle
- Remember me checkbox
- "Forgot password?" link
- Auto-redirect if already logged in
- Error message display
- Loading states

---

### Signup Page
**Route:** `/signup`

Features:
- Multi-step registration form
- Business information collection
- Terms acceptance
- Password strength indicator
- Real-time validation
- Auto-login after registration

---

### Forgot Password Page
**Route:** `/forgot-password`

Features:
- Email input
- Success confirmation screen
- Troubleshooting tips
- Link back to login
- Rate limiting feedback

---

### Reset Password Page
**Route:** `/reset-password?token=xxx`

Features:
- Token verification on load
- Password strength indicator
- Real-time validation
- Password requirements checklist
- Confirm password matching
- Success/error screens

---

### Dashboard Page
**Route:** `/` or `/dashboard`

Features:
- Authentication check on load
- Auto-redirect to login if not authenticated
- User info display
- Logout button
- Protected API calls with JWT

---

## 💻 Client-Side Usage

### Storing JWT Token

After successful login or registration:
```javascript
// Store token
localStorage.setItem('token', data.token);

// Redirect to dashboard
window.location.href = '/dashboard';
```

### Making Authenticated Requests

```javascript
const token = localStorage.getItem('token');

const response = await fetch('/api/auth/profile', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
```

### Checking Authentication Status

```javascript
async function checkAuth() {
  const token = localStorage.getItem('token');

  if (!token) {
    window.location.href = '/login';
    return;
  }

  try {
    const response = await fetch('/api/auth/verify', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
  } catch (error) {
    console.error('Auth check failed:', error);
  }
}
```

### Refreshing Token

```javascript
async function refreshToken() {
  const token = localStorage.getItem('token');

  const response = await fetch('/api/auth/refresh-token', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  const data = await response.json();

  if (data.success) {
    localStorage.setItem('token', data.token);
  }
}

// Refresh token every 6 days (before 7-day expiration)
setInterval(refreshToken, 6 * 24 * 60 * 60 * 1000);
```

### Logout

```javascript
async function logout() {
  const token = localStorage.getItem('token');

  // Call logout endpoint (optional)
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
  } catch (error) {
    console.error('Logout error:', error);
  }

  // Clear token and redirect
  localStorage.removeItem('token');
  window.location.href = '/login';
}
```

---

## 🛠️ Middleware Usage

### In Route Files

```javascript
const { authenticateToken, getUserClient } = require('../middleware/auth');

// Protect a single route
router.get('/protected', authenticateToken, (req, res) => {
  res.json({
    message: 'This is protected',
    user: req.user // { userId, email, businessName, clientId }
  });
});

// Get user AND client data
router.get('/with-client', authenticateToken, getUserClient, (req, res) => {
  res.json({
    user: req.user,
    client: req.client // { id, businessName, ... }
  });
});
```

---

## 🧪 Testing

### Manual Testing

1. **Test Registration:**
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "firstName": "Test",
    "lastName": "User",
    "businessName": "Test Business",
    "businessPhone": "+18005551234",
    "termsAccepted": true
  }'
```

2. **Test Login:**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

3. **Test Profile (Protected):**
```bash
curl http://localhost:3000/api/auth/profile \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

4. **Test Rate Limiting:**
```bash
# Try 6 failed login attempts rapidly
for i in {1..6}; do
  curl -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}'
  echo "\nAttempt $i"
done
```

---

## 📝 Configuration

### Environment Variables

```bash
# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Email Configuration (for password reset)
EMAIL_FROM=noreply@ringlypro.com
EMAIL_FROM_NAME=RinglyPro
WEBHOOK_BASE_URL=https://yourdomain.com

# Twilio (for user provisioning)
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/ringlypro

# Optional: Email Service (for production)
SENDGRID_API_KEY=your_sendgrid_key
# OR
MAILGUN_API_KEY=your_mailgun_key
MAILGUN_DOMAIN=your_domain.com
# OR
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
AWS_REGION=us-east-1
```

### Customizing Rate Limits

Edit `src/routes/auth.js`:

```javascript
// Make login more strict (2 attempts per hour)
const loginLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 2,
    message: {
        success: false,
        error: 'Too many login attempts. Please try again in 1 hour.'
    }
});
```

### Customizing JWT Expiration

Edit `src/routes/auth.js`:

```javascript
// Change from 7 days to 24 hours
const token = jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { expiresIn: '24h' } // Changed from '7d'
);
```

---

## 🚀 Production Checklist

Before deploying to production:

- [ ] Change `JWT_SECRET` to a strong, random value (min 32 characters)
- [ ] Set up real email service (SendGrid/AWS SES/Mailgun)
- [ ] Enable HTTPS for all routes
- [ ] Set secure cookie flags if using session cookies
- [ ] Configure CORS properly for your domain
- [ ] Set up database backups
- [ ] Enable PostgreSQL SSL connections
- [ ] Monitor rate limit hits
- [ ] Set up error tracking (Sentry, etc.)
- [ ] Add logging for security events
- [ ] Test password reset email delivery
- [ ] Verify Twilio number provisioning works
- [ ] Add health check monitoring
- [ ] Set up CDN for static assets
- [ ] Enable gzip compression
- [ ] Add security headers (helmet)

---

## 🔐 Security Best Practices

1. **Never log passwords** - Even encrypted/hashed ones
2. **Use HTTPS** - Always in production
3. **Validate input** - Both client and server side
4. **Rate limit** - Prevent abuse
5. **Use strong secrets** - For JWT and session keys
6. **Hash passwords** - With bcrypt (never MD5/SHA1)
7. **Expire tokens** - Don't use permanent tokens
8. **Clear tokens** - On logout and password change
9. **Monitor failed logins** - Alert on suspicious activity
10. **Keep dependencies updated** - Regular security patches

---

## 📊 Monitoring

### Key Metrics to Track

- Failed login attempts per IP
- Rate limit hits
- Password reset requests
- Registration attempts
- Token refresh frequency
- Average session duration
- Concurrent users

### Logging

All auth endpoints log to console:
- Login attempts (success/failure)
- Registration attempts
- Password reset requests
- Token refreshes
- Profile updates

---

## 🐛 Troubleshooting

### "Invalid token" error
- Check token hasn't expired (7 days)
- Verify JWT_SECRET matches between requests
- Ensure Authorization header format: `Bearer <token>`

### Rate limit reached
- Wait for rate limit window to expire
- Check IP isn't being shared (proxy/VPN)
- Adjust rate limits if needed for your use case

### Password reset not working
- Check email service is configured
- Look for reset link in console (development mode)
- Verify token hasn't expired (1 hour)
- Check database has password_reset_token columns

### User can't login after password reset
- Ensure password meets requirements (8+ chars)
- Check password is being hashed correctly
- Verify reset token was cleared after use

---

## 📚 Additional Resources

- [JWT.io](https://jwt.io/) - JWT debugger and info
- [OWASP Authentication Cheatsheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [bcrypt](https://www.npmjs.com/package/bcrypt) - Password hashing
- [express-rate-limit](https://www.npmjs.com/package/express-rate-limit) - Rate limiting

---

**Last Updated:** October 3, 2025
**Version:** 2.0.0
**Status:** ✅ Production Ready
