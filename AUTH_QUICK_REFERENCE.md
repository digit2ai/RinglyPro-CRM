# 🔐 Authentication Quick Reference Card

## 🚀 Get Started in 3 Steps

```bash
# 1. Run migration
npm run migrate

# 2. Start server
npm start

# 3. Visit
http://localhost:3000/login
```

---

## 📝 Auth.js - Essential Methods

```javascript
// Include in your HTML
<script src="/js/auth.js"></script>

// Require authentication (add to protected pages)
Auth.requireAuth();

// Make authenticated API call
const response = await Auth.makeAuthenticatedRequest('/api/endpoint');

// Get user data
const user = Auth.getUser();
const profile = await Auth.getProfile(); // Fresh from server

// Update profile
await Auth.updateProfile({ firstName: 'Jane' });

// Logout
Auth.logout();

// Token info
Auth.getToken();
Auth.isTokenExpired();
Auth.getTimeUntilExpiration(); // "6 days 12 hours"

// Refresh token manually
await Auth.refreshToken();

// Verify token
await Auth.verifyToken();
```

---

## 🎯 API Endpoints Cheat Sheet

### Public Endpoints

```bash
# Register
POST /api/auth/register
Body: { email, password, firstName, lastName, businessName, ... }

# Login
POST /api/auth/login
Body: { email, password }

# Forgot Password
POST /api/auth/forgot-password
Body: { email }

# Reset Password
POST /api/auth/reset-password
Body: { token, password }

# Verify Reset Token
GET /api/auth/verify-reset-token/:token
```

### Protected Endpoints (Require JWT)

```bash
# Get Profile
GET /api/auth/profile
Header: Authorization: Bearer <token>

# Update Profile
POST /api/auth/update-profile
Header: Authorization: Bearer <token>
Body: { firstName, lastName, businessName, ... }

# Refresh Token
POST /api/auth/refresh-token
Header: Authorization: Bearer <token>

# Logout
POST /api/auth/logout
Header: Authorization: Bearer <token>

# Verify Token
GET /api/auth/verify
Header: Authorization: Bearer <token>
```

---

## 🔧 Quick Copy-Paste Examples

### Protect a Page

```html
<!DOCTYPE html>
<html>
<head>
    <script src="/js/auth.js"></script>
</head>
<body>
    <h1>Protected Content</h1>
    <script>
        Auth.requireAuth(); // Add this line
    </script>
</body>
</html>
```

### Show User Name

```html
<h1>Welcome, <span id="userName"></span>!</h1>

<script src="/js/auth.js"></script>
<script>
    Auth.requireAuth();
    const user = Auth.getUser();
    document.getElementById('userName').textContent = user.firstName;
</script>
```

### Logout Button

```html
<button onclick="Auth.logout()">Logout</button>
<script src="/js/auth.js"></script>
```

### API Call Example

```javascript
// GET request
const response = await Auth.makeAuthenticatedRequest('/api/auth/profile');
const data = await response.json();

// POST request
const response = await Auth.makeAuthenticatedRequest('/api/auth/update-profile', {
    method: 'POST',
    body: JSON.stringify({ firstName: 'Jane' })
});
```

### Load User Dashboard

```javascript
Auth.requireAuth();

async function loadDashboard() {
    const profile = await Auth.getProfile();
    console.log('User:', profile.user);
    console.log('Client:', profile.client);
}

loadDashboard();
```

---

## 🛡️ Security Quick Facts

| Feature | Value |
|---------|-------|
| Token Algorithm | HS256 |
| Token Expiration | 7 days |
| Auto-Refresh | Every 6 days |
| Session Timeout | 1 hour inactivity |
| Password Hash | bcrypt (12 rounds) |
| Reset Token | 256-bit random |
| Reset Expiration | 1 hour |

### Rate Limits

| Endpoint | Limit |
|----------|-------|
| Login | 5 / 15 min |
| Register | 3 / hour |
| Password Reset | 3 / hour |

---

## 📁 File Locations

```
src/
├── routes/auth.js           # Auth API endpoints
├── middleware/auth.js       # JWT middleware
├── models/User.js           # User model
├── services/emailService.js # Email service

public/
└── js/auth.js              # Frontend auth library

views/
├── login.ejs               # Login page
├── signup.ejs              # Signup page
├── forgot-password.ejs     # Forgot password
└── reset-password.ejs      # Reset password

migrations/
└── add-password-reset-fields.js  # DB migration

Documentation/
├── GETTING_STARTED.md           # Start here
├── AUTH_SYSTEM_GUIDE.md         # Full API docs
├── PROTECTED_ROUTES_GUIDE.md    # Auth.js guide
├── PASSWORD_RESET_GUIDE.md      # Password reset
└── AUTHENTICATION_SUMMARY.md    # Overview
```

---

## 🧪 Testing Commands

```bash
# Run automated tests
node test-password-reset.js

# Test specific endpoint
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Test protected endpoint
curl http://localhost:3000/api/auth/profile \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🎨 UI Pages

| URL | Purpose |
|-----|---------|
| `/login` | Login page |
| `/signup` | Registration page |
| `/forgot-password` | Request password reset |
| `/reset-password?token=xxx` | Reset password |
| `/` | Dashboard (protected) |
| `/example-protected-page.html` | Example page |

---

## ⚙️ Configuration

```javascript
// Customize in your page
Auth.config.sessionTimeout = 30 * 60 * 1000;        // 30 min
Auth.config.tokenRefreshInterval = 3 * 24 * 60 * 60 * 1000; // 3 days
Auth.config.loginUrl = '/my-login';
Auth.config.dashboardUrl = '/my-dashboard';
```

### Environment Variables

```bash
JWT_SECRET=your-secret-key-32-chars-minimum
DATABASE_URL=postgresql://user:pass@localhost:5432/db
WEBHOOK_BASE_URL=https://yourdomain.com
EMAIL_FROM=noreply@yourdomain.com

# Email service (choose one)
SENDGRID_API_KEY=xxx
# OR
MAILGUN_API_KEY=xxx
MAILGUN_DOMAIN=xxx
# OR
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
AWS_REGION=us-east-1
```

---

## 🐛 Quick Debugging

### Browser Console

```javascript
// Check authentication
Auth.isAuthenticated()

// View token
Auth.getToken()

// Parse token payload
Auth.parseToken()

// Check expiration
Auth.getTimeUntilExpiration()

// Test API
await Auth.makeAuthenticatedRequest('/api/auth/profile').then(r => r.json())
```

### Common Fixes

```javascript
// Token expired → Refresh
await Auth.refreshToken();

// Not authenticated → Logout and login again
Auth.logout();

// API 401 error → Check token
console.log('Token valid:', await Auth.verifyToken());
```

---

## 📊 Feature Checklist

**Core Auth:**
- ✅ User Registration
- ✅ User Login
- ✅ User Logout
- ✅ JWT Tokens (7-day)
- ✅ Password Hashing

**Password Reset:**
- ✅ Forgot Password
- ✅ Email with Reset Link
- ✅ Reset Password Form
- ✅ Token Validation

**Protected Routes:**
- ✅ Client-side Protection
- ✅ Server-side Validation
- ✅ Auto Token Refresh
- ✅ Session Timeout
- ✅ Activity Tracking

**Security:**
- ✅ Rate Limiting
- ✅ Email Enumeration Prevention
- ✅ HTTPS Ready
- ✅ Input Validation

**UX:**
- ✅ Beautiful UI Pages
- ✅ Error Messages
- ✅ Loading States
- ✅ Mobile Responsive

---

## 💡 Pro Tips

1. **Always call `Auth.requireAuth()`** on protected pages
2. **Use `Auth.makeAuthenticatedRequest()`** for API calls
3. **Token auto-refreshes** - no manual intervention needed
4. **Session extends** on user activity automatically
5. **Check console logs** for password reset links in dev mode
6. **Test with `example-protected-page.html`** first
7. **Set strong JWT_SECRET** in production (32+ chars)
8. **Enable HTTPS** in production always
9. **Configure email service** before production
10. **Monitor rate limits** to avoid blocking users

---

## 🚀 Production Deployment

```bash
# 1. Set environment variables
export JWT_SECRET="your-super-secret-key-minimum-32-characters"
export DATABASE_URL="postgresql://..."
export SENDGRID_API_KEY="your-key"  # Or other email service

# 2. Run migration
npm run migrate

# 3. Start production server
NODE_ENV=production npm start

# 4. Verify
curl https://yourdomain.com/health
```

---

## 📚 Documentation Links

- **[GETTING_STARTED.md](./GETTING_STARTED.md)** - Start here
- **[AUTH_SYSTEM_GUIDE.md](./AUTH_SYSTEM_GUIDE.md)** - Full API reference
- **[PROTECTED_ROUTES_GUIDE.md](./PROTECTED_ROUTES_GUIDE.md)** - Auth.js guide
- **[AUTHENTICATION_SUMMARY.md](./AUTHENTICATION_SUMMARY.md)** - Overview

---

## ✅ Quick Test

```bash
# 1. Start server
npm start

# 2. Visit signup
open http://localhost:3000/signup

# 3. Create account

# 4. Visit protected page
open http://localhost:3000/example-protected-page.html

# 5. Test password reset
open http://localhost:3000/forgot-password
```

---

**Print this page and keep it handy!** 📄

**Version:** 2.0.0 | **Status:** ✅ Production Ready
