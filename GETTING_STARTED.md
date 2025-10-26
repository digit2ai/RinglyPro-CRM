# 🚀 Getting Started with RinglyPro CRM Authentication

## Quick Start (5 Minutes)

### Step 1: Run Database Migration

```bash
npm run migrate
```

This adds password reset fields to your users table.

### Step 2: Start Your Server

```bash
npm start
```

Server will start on `http://localhost:3000`

### Step 3: Test the Authentication

Open your browser and visit:

```
http://localhost:3000/login
```

---

## ✅ What You Can Do Right Now

### 1. Register a New User

**URL:** `http://localhost:3000/signup`

Fill in:
- Email
- Password
- First/Last Name
- Business Information
- Accept Terms

**Result:** You get:
- User account created
- Rachel AI number provisioned
- Automatic login
- JWT token stored
- Redirected to dashboard

### 2. Login

**URL:** `http://localhost:3000/login`

Use the credentials you just created.

**Result:**
- JWT token generated
- User data loaded
- Redirected to dashboard
- Token auto-refreshes every 6 days

### 3. Test Password Reset

**URL:** `http://localhost:3000/forgot-password`

Steps:
1. Enter your email
2. Check server console for reset link (development mode)
3. Copy the token from the URL
4. Visit the reset link
5. Set new password
6. Login with new password

### 4. View Your Profile

**API:** `GET /api/auth/profile`

```bash
# Get your JWT token from localStorage after login
curl http://localhost:3000/api/auth/profile \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 5. Test Protected Page

**URL:** `http://localhost:3000/example-protected-page.html`

This page demonstrates:
- Authentication check
- Token information
- User profile display
- Authenticated API calls
- Manual token refresh
- Token verification

---

## 🎯 Common Tasks

### Add Authentication to Your Own Pages

```html
<!-- Include the auth library -->
<script src="/js/auth.js"></script>

<script>
    // Require authentication - redirects to login if needed
    Auth.requireAuth();

    // Your page code here
    console.log('User is authenticated!');
</script>
```

### Make Authenticated API Calls

```javascript
// Simple GET request
const response = await Auth.makeAuthenticatedRequest('/api/auth/profile');
const data = await response.json();
console.log(data);

// POST request with body
const response = await Auth.makeAuthenticatedRequest('/api/auth/update-profile', {
    method: 'POST',
    body: JSON.stringify({
        firstName: 'Jane',
        businessName: 'New Business'
    })
});
```

### Get User Information

```javascript
// From cached data (fast)
const user = Auth.getUser();
console.log(`Welcome, ${user.firstName}!`);

// From server (fresh data)
const profile = await Auth.getProfile();
console.log(profile.user);
```

### Update User Profile

```javascript
const updatedUser = await Auth.updateProfile({
    firstName: 'Jane',
    lastName: 'Smith',
    businessName: 'New Company Name'
});

console.log('Profile updated:', updatedUser);
```

### Logout

```javascript
// Simple logout
Auth.logout();

// Or use a button
<button onclick="Auth.logout()">Logout</button>
```

---

## 📊 Available API Endpoints

### Public (No Auth Required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login user |
| POST | `/api/auth/forgot-password` | Request password reset |
| POST | `/api/auth/reset-password` | Reset password with token |
| GET | `/api/auth/verify-reset-token/:token` | Verify reset token |

### Protected (Auth Required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth/profile` | Get user profile |
| POST | `/api/auth/update-profile` | Update user profile |
| POST | `/api/auth/refresh-token` | Refresh JWT token |
| POST | `/api/auth/logout` | Logout user |
| GET | `/api/auth/verify` | Verify token validity |

---

## 🧪 Testing Checklist

Quick tests to verify everything works:

- [ ] Register new user → ✅ Account created
- [ ] Login with credentials → ✅ Redirected to dashboard
- [ ] Access `/example-protected-page.html` → ✅ Shows user info
- [ ] Click logout → ✅ Redirected to login
- [ ] Try accessing protected page → ✅ Redirected to login
- [ ] Request password reset → ✅ Check console for link
- [ ] Use reset link → ✅ Can change password
- [ ] Login with new password → ✅ Success
- [ ] Make API call to `/api/auth/profile` → ✅ Returns user data

---

## 🛠️ Development Tools

### Check Token in Browser Console

```javascript
// Is user authenticated?
Auth.isAuthenticated()

// Get token
Auth.getToken()

// Parse token payload
Auth.parseToken()

// Time until expiration
Auth.getTimeUntilExpiration()

// Verify token with server
await Auth.verifyToken()
```

### Run Automated Tests

```bash
node test-password-reset.js
```

This tests:
- Password reset request
- Non-existent email handling
- Invalid token rejection
- Password validation
- Rate limiting

---

## 🔧 Customization

### Change Session Timeout

```javascript
// Default: 1 hour
Auth.config.sessionTimeout = 30 * 60 * 1000; // 30 minutes
```

### Change Token Refresh Interval

```javascript
// Default: 6 days
Auth.config.tokenRefreshInterval = 3 * 24 * 60 * 60 * 1000; // 3 days
```

### Custom Redirect URLs

```javascript
Auth.config.loginUrl = '/my-login';
Auth.config.dashboardUrl = '/my-dashboard';
```

---

## 🚀 Production Setup

### 1. Environment Variables

Create `.env` file:

```bash
# Required
JWT_SECRET=your-super-secret-key-minimum-32-characters-random
DATABASE_URL=postgresql://user:password@localhost:5432/ringlypro

# Email Service (choose one)
SENDGRID_API_KEY=your_sendgrid_api_key
# OR
MAILGUN_API_KEY=your_mailgun_api_key
MAILGUN_DOMAIN=mg.yourdomain.com
# OR
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=us-east-1

# Optional
WEBHOOK_BASE_URL=https://yourdomain.com
EMAIL_FROM=noreply@yourdomain.com
NODE_ENV=production
```

### 2. Configure Email Service

Edit `src/services/emailService.js` and uncomment your email provider:

**For SendGrid:**
```javascript
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
await sgMail.send(emailContent);
```

**For AWS SES:**
```javascript
const AWS = require('aws-sdk');
const ses = new AWS.SES({ region: process.env.AWS_REGION });
await ses.sendEmail(params).promise();
```

**For Mailgun:**
```javascript
const mailgun = require('mailgun-js')({
  apiKey: process.env.MAILGUN_API_KEY,
  domain: process.env.MAILGUN_DOMAIN
});
await mailgun.messages().send(emailContent);
```

### 3. Enable HTTPS

Your hosting provider (Heroku, AWS, etc.) should handle this.

### 4. Deploy

```bash
git add .
git commit -m "Add complete authentication system"
git push origin main
```

---

## 📚 Documentation Reference

| Document | Purpose |
|----------|---------|
| **GETTING_STARTED.md** (this file) | Quick start guide |
| **AUTHENTICATION_SUMMARY.md** | Complete overview |
| **AUTH_SYSTEM_GUIDE.md** | Full API reference |
| **PASSWORD_RESET_GUIDE.md** | Password reset details |
| **PROTECTED_ROUTES_GUIDE.md** | Auth.js usage guide |
| **PASSWORD_RESET_CHECKLIST.md** | Testing checklist |
| **[docs/AI_COPILOT_BUTTON_FIX.md](docs/AI_COPILOT_BUTTON_FIX.md)** | AI Copilot debugging & architecture |

---

## 💡 Common Use Cases

### Protect a New Page

```html
<!DOCTYPE html>
<html>
<head>
    <title>My Protected Page</title>
</head>
<body>
    <h1>Secret Content</h1>

    <script src="/js/auth.js"></script>
    <script>
        Auth.requireAuth(); // Add this line
    </script>
</body>
</html>
```

### Create a User Dashboard

```html
<div id="dashboard">
    <h1>Welcome, <span id="userName"></span>!</h1>
    <p>Email: <span id="userEmail"></span></p>
    <p>Business: <span id="businessName"></span></p>
</div>

<script src="/js/auth.js"></script>
<script>
    Auth.requireAuth();

    async function loadDashboard() {
        const profile = await Auth.getProfile();
        const user = profile.user;

        document.getElementById('userName').textContent = user.firstName;
        document.getElementById('userEmail').textContent = user.email;
        document.getElementById('businessName').textContent = user.businessName;
    }

    loadDashboard();
</script>
```

### Create a Settings Page

```html
<form id="settingsForm">
    <input type="text" id="firstName" placeholder="First Name">
    <input type="text" id="lastName" placeholder="Last Name">
    <input type="text" id="businessName" placeholder="Business Name">
    <button type="submit">Save Changes</button>
</form>

<script src="/js/auth.js"></script>
<script>
    Auth.requireAuth();

    // Load current values
    async function loadSettings() {
        const profile = await Auth.getProfile();
        document.getElementById('firstName').value = profile.user.firstName;
        document.getElementById('lastName').value = profile.user.lastName;
        document.getElementById('businessName').value = profile.user.businessName;
    }

    // Save changes
    document.getElementById('settingsForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const updates = {
            firstName: document.getElementById('firstName').value,
            lastName: document.getElementById('lastName').value,
            businessName: document.getElementById('businessName').value
        };

        try {
            await Auth.updateProfile(updates);
            alert('Settings saved!');
        } catch (error) {
            alert('Failed to save: ' + error.message);
        }
    });

    loadSettings();
</script>
```

---

## 🐛 Troubleshooting

### "Redirects to login immediately"

**Check:**
- Browser has token in localStorage
- Token hasn't expired (7 days)
- Server is running

**Fix:**
```javascript
// Check in browser console
console.log('Token:', Auth.getToken());
console.log('Is authenticated:', Auth.isAuthenticated());
```

### "API calls return 401"

**Check:**
- Token is being sent in header
- Token hasn't expired
- JWT_SECRET matches between requests

**Fix:**
```javascript
// Verify token
await Auth.verifyToken();

// Or refresh token
await Auth.refreshToken();
```

### "Password reset emails not sending"

**Development:**
- Check server console for reset link
- Link is logged, not emailed

**Production:**
- Verify email service is configured
- Check API keys are set
- Review server logs for errors

---

## ✨ What's Next?

Now that authentication is set up, you can:

1. **Build Features** - All your pages can use `Auth.requireAuth()`
2. **Customize UI** - Update login/signup pages to match your brand
3. **Add OAuth** - Integrate Google/Microsoft login
4. **Enable 2FA** - Add two-factor authentication
5. **Create Admin Panel** - Manage users and permissions
6. **Add Analytics** - Track user activity and sessions
7. **Implement Webhooks** - Notify on user events
8. **Build Mobile App** - Use same JWT tokens

---

## 🎓 Learning Resources

- [JWT.io](https://jwt.io/) - Learn about JWT tokens
- [OWASP Auth Guide](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [bcrypt Documentation](https://www.npmjs.com/package/bcrypt)
- [Express Rate Limit](https://www.npmjs.com/package/express-rate-limit)

---

## 📞 Need Help?

1. Check the documentation files
2. Review server console logs
3. Test with `example-protected-page.html`
4. Run `node test-password-reset.js`
5. Check browser console for errors

---

## ✅ Quick Wins

Things you can do right now:

- [ ] Create a new user account
- [ ] Login and explore dashboard
- [ ] Test password reset flow
- [ ] Visit example protected page
- [ ] Make authenticated API call
- [ ] Update your profile
- [ ] Test logout functionality

---

**Status:** 🎉 Ready to Use!

**Version:** 2.0.0

**Last Updated:** October 3, 2025

**Happy Coding!** 🚀
