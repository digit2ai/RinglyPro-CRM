# Protected Routes Implementation Guide

## Overview

RinglyPro CRM now features **enterprise-grade protected routes** with automatic token refresh, session timeout handling, and comprehensive security features.

## 🎯 What's Included

### Frontend Authentication Helper (`/js/auth.js`)

A complete JavaScript authentication library with:

- ✅ **Token Management** - Secure JWT storage and retrieval
- ✅ **Automatic Token Refresh** - Refreshes tokens every 6 days (before 7-day expiration)
- ✅ **Session Timeout** - Auto-logout after 1 hour of inactivity
- ✅ **Activity Tracking** - Monitors user activity to extend sessions
- ✅ **API Helpers** - Easy-to-use methods for authenticated requests
- ✅ **Token Validation** - Verify tokens with server
- ✅ **Logout Handling** - Clean logout with server notification

### Server-Side Enhancements

- ✅ **Hybrid Dashboard Authentication** - Optional server-side + required client-side
- ✅ **Protected API Endpoints** - JWT middleware on all sensitive routes
- ✅ **Rate Limiting** - Prevents abuse on all auth endpoints
- ✅ **Token Refresh Endpoint** - Extends sessions without re-login

---

## 📖 Using the Auth Helper

### Basic Setup

Include the auth helper in your HTML pages:

```html
<script src="/js/auth.js"></script>
```

### Require Authentication

Redirect to login if user is not authenticated:

```javascript
// At the top of your protected page
Auth.requireAuth();
```

### Get Current Token

```javascript
const token = Auth.getToken();
```

### Make Authenticated API Requests

```javascript
// Simple GET request
const response = await Auth.makeAuthenticatedRequest('/api/auth/profile');
const data = await response.json();

// POST request with body
const response = await Auth.makeAuthenticatedRequest('/api/auth/update-profile', {
    method: 'POST',
    body: JSON.stringify({
        firstName: 'John',
        lastName: 'Doe'
    })
});
```

### Get User Data

```javascript
// From localStorage (cached)
const user = Auth.getUser();

// From server (fresh)
const profile = await Auth.getProfile();
```

### Update User Profile

```javascript
const updatedUser = await Auth.updateProfile({
    firstName: 'Jane',
    businessName: 'New Business Name'
});
```

### Logout

```javascript
// Option 1: Direct logout
Auth.logout();

// Option 2: With logout button
<button onclick="Auth.logout()">Logout</button>
```

### Token Information

```javascript
// Parse token payload
const payload = Auth.parseToken();
console.log(payload.email); // user@example.com

// Check if token is expired
const isExpired = Auth.isTokenExpired();

// Get expiration time
const expiration = Auth.getTokenExpiration();
console.log(expiration); // Date object

// Get human-readable time until expiration
const timeLeft = Auth.getTimeUntilExpiration();
console.log(timeLeft); // "6 days 12 hours"
```

---

## 🔄 Automatic Features

### Token Refresh

Tokens are automatically refreshed every 6 days:

```javascript
// Happens automatically - no code needed!
// But you can manually refresh if needed:
await Auth.refreshToken();
```

**How it works:**
1. Timer runs every 6 days
2. Calls `/api/auth/refresh-token` endpoint
3. Updates token in localStorage
4. Continues seamlessly

### Session Timeout

User is logged out after 1 hour of inactivity:

```javascript
// Happens automatically!
// Tracks: mousedown, keydown, scroll, touchstart, click
```

**How it works:**
1. Monitors user activity
2. Resets timer on any interaction
3. After 1 hour of no activity:
   - Shows confirmation dialog
   - User can extend session or logout
4. If extended, refreshes token

**Customize timeout:**
```javascript
// Change to 30 minutes
Auth.config.sessionTimeout = 30 * 60 * 1000;
```

---

## 🛡️ Security Features

### Protected Routes

Dashboard and all sensitive pages have:

1. **Client-side check** - Instant redirect if no token
2. **Server-side validation** - Optional token verification
3. **API protection** - All API calls require valid JWT

### Rate Limiting

All auth endpoints are rate-limited:

| Endpoint | Limit | Window |
|----------|-------|--------|
| Login | 5 attempts | 15 min |
| Register | 3 attempts | 1 hour |
| Password Reset | 3 requests | 1 hour |
| Other Auth | 100 requests | 15 min |

### Token Security

- **Algorithm:** HS256
- **Expiration:** 7 days
- **Storage:** localStorage (client-side)
- **Transmission:** Authorization header (Bearer)
- **Refresh:** Automatic every 6 days

---

## 📝 Code Examples

### Example 1: Simple Protected Page

```html
<!DOCTYPE html>
<html>
<head>
    <title>Protected Page</title>
    <script src="/js/auth.js"></script>
</head>
<body>
    <h1>Protected Content</h1>
    <button onclick="Auth.logout()">Logout</button>

    <script>
        // Require authentication
        Auth.requireAuth();

        // Load user data
        const user = Auth.getUser();
        console.log('Welcome,', user.firstName);
    </script>
</body>
</html>
```

### Example 2: Dashboard with User Info

```html
<div id="userInfo">Loading...</div>

<script src="/js/auth.js"></script>
<script>
    Auth.requireAuth();

    async function loadUserInfo() {
        try {
            const profile = await Auth.getProfile();

            document.getElementById('userInfo').innerHTML = `
                <h2>Welcome, ${profile.user.firstName}!</h2>
                <p>Email: ${profile.user.email}</p>
                <p>Business: ${profile.user.businessName}</p>
            `;
        } catch (error) {
            console.error('Failed to load profile:', error);
        }
    }

    loadUserInfo();
</script>
```

### Example 3: Update Profile Form

```html
<form id="profileForm">
    <input type="text" id="firstName" placeholder="First Name">
    <input type="text" id="lastName" placeholder="Last Name">
    <button type="submit">Update Profile</button>
</form>

<script src="/js/auth.js"></script>
<script>
    Auth.requireAuth();

    document.getElementById('profileForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const updates = {
            firstName: document.getElementById('firstName').value,
            lastName: document.getElementById('lastName').value
        };

        try {
            const updatedUser = await Auth.updateProfile(updates);
            alert('Profile updated successfully!');
        } catch (error) {
            alert('Failed to update profile: ' + error.message);
        }
    });
</script>
```

### Example 4: Custom API Call

```html
<button onclick="loadData()">Load Data</button>
<div id="data"></div>

<script src="/js/auth.js"></script>
<script>
    Auth.requireAuth();

    async function loadData() {
        try {
            const response = await Auth.makeAuthenticatedRequest('/api/custom-endpoint');

            if (response.ok) {
                const data = await response.json();
                document.getElementById('data').textContent = JSON.stringify(data, null, 2);
            } else {
                throw new Error('Request failed');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Failed to load data');
        }
    }
</script>
```

---

## 🧪 Testing

### Manual Testing

1. **Test Protected Page Access:**
   - Visit `/example-protected-page.html` without logging in
   - Should redirect to `/login`
   - Login and revisit
   - Should show protected content

2. **Test Token Refresh:**
   - Login to dashboard
   - Wait 6 days (or modify `tokenRefreshInterval` to 1 minute for testing)
   - Check console logs for "Token refreshed successfully"
   - Verify you can still make API calls

3. **Test Session Timeout:**
   - Login to dashboard
   - Don't interact for 1 hour (or modify `sessionTimeout` to 1 minute for testing)
   - Should see timeout confirmation dialog
   - Choose "Stay logged in" - should refresh token
   - Choose "Logout" - should redirect to login

4. **Test Activity Tracking:**
   - Login to dashboard
   - Interact with page (click, scroll, type)
   - Verify session doesn't timeout while active

### Automated Testing

```bash
# Visit the example protected page
open http://localhost:3000/example-protected-page.html

# Test all auth endpoints
node test-password-reset.js
```

### Browser Console Testing

```javascript
// Check if authenticated
Auth.isAuthenticated();

// Get token payload
Auth.parseToken();

// Check token expiration
Auth.getTimeUntilExpiration();

// Test API call
await Auth.makeAuthenticatedRequest('/api/auth/profile').then(r => r.json());

// Manually refresh token
await Auth.refreshToken();

// Verify token
await Auth.verifyToken();

// Logout
Auth.logout();
```

---

## 🚀 Deployment

### Environment Variables

```bash
# Required
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters
DATABASE_URL=postgresql://user:pass@localhost:5432/ringlypro

# Optional
SESSION_TIMEOUT=3600000  # 1 hour in milliseconds
TOKEN_REFRESH_INTERVAL=518400000  # 6 days in milliseconds
```

### Production Checklist

- [ ] Set strong `JWT_SECRET` (32+ characters)
- [ ] Enable HTTPS for all routes
- [ ] Configure CORS for your domain
- [ ] Set secure cookie flags (if using cookies)
- [ ] Enable rate limiting
- [ ] Set up error monitoring (Sentry, etc.)
- [ ] Configure session timeout appropriately
- [ ] Test token refresh in production
- [ ] Test session timeout behavior
- [ ] Verify all protected routes require auth

---

## 🔧 Customization

### Change Session Timeout

```javascript
// In your page, after including auth.js
Auth.config.sessionTimeout = 30 * 60 * 1000; // 30 minutes
```

### Change Token Refresh Interval

```javascript
Auth.config.tokenRefreshInterval = 3 * 24 * 60 * 60 * 1000; // 3 days
```

### Custom Login/Dashboard URLs

```javascript
Auth.config.loginUrl = '/custom-login';
Auth.config.dashboardUrl = '/custom-dashboard';
```

### Disable Activity Tracking

```javascript
// Don't call Auth.init() or modify setupActivityTracking
```

---

## 📊 API Reference

### Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `Auth.requireAuth()` | Redirect to login if not authenticated | `boolean` |
| `Auth.isAuthenticated()` | Check if user has token | `boolean` |
| `Auth.getToken()` | Get stored JWT token | `string` |
| `Auth.setToken(token)` | Store JWT token | `void` |
| `Auth.getUser()` | Get cached user data | `object` |
| `Auth.setUser(user)` | Store user data | `void` |
| `Auth.logout()` | Logout and redirect | `Promise<void>` |
| `Auth.refreshToken()` | Manually refresh token | `Promise<boolean>` |
| `Auth.verifyToken()` | Verify token with server | `Promise<boolean>` |
| `Auth.getProfile()` | Get user profile from API | `Promise<object>` |
| `Auth.updateProfile(updates)` | Update user profile | `Promise<object>` |
| `Auth.makeAuthenticatedRequest(url, options)` | Make API call with auth | `Promise<Response>` |
| `Auth.parseToken(token)` | Parse JWT payload | `object` |
| `Auth.isTokenExpired(token)` | Check if token expired | `boolean` |
| `Auth.getTokenExpiration(token)` | Get expiration Date | `Date` |
| `Auth.getTimeUntilExpiration(token)` | Human-readable time left | `string` |

### Configuration

| Property | Default | Description |
|----------|---------|-------------|
| `tokenKey` | `'token'` | localStorage key for token |
| `userKey` | `'user'` | localStorage key for user data |
| `loginUrl` | `'/login'` | Login page URL |
| `dashboardUrl` | `'/'` | Dashboard URL after login |
| `apiBaseUrl` | `''` | API base URL |
| `tokenRefreshInterval` | `518400000` | 6 days in ms |
| `sessionTimeout` | `3600000` | 1 hour in ms |

---

## 🐛 Troubleshooting

### "Redirects to login immediately"
- Check localStorage has valid token
- Verify token hasn't expired
- Check browser console for errors

### "Token refresh not working"
- Check `/api/auth/refresh-token` endpoint is accessible
- Verify JWT_SECRET matches between requests
- Check server logs for errors

### "Session timeout not triggering"
- Verify activity tracking is enabled
- Check `sessionTimeout` configuration
- Test with shorter timeout (1 minute)

### "API calls fail with 401"
- Token may be expired - try refreshing
- Verify Authorization header format: `Bearer <token>`
- Check server JWT_SECRET is set

### "Activity tracking not working"
- Verify `Auth.init()` is called
- Check event listeners are attached
- Test in different browser

---

## 🎓 Best Practices

1. **Always use `Auth.requireAuth()`** on protected pages
2. **Use `Auth.makeAuthenticatedRequest()`** for API calls
3. **Handle logout gracefully** - clear all user data
4. **Test session timeout** with realistic scenarios
5. **Monitor token expiration** in production
6. **Use HTTPS** in production always
7. **Implement proper error handling** for auth failures
8. **Log security events** for monitoring
9. **Keep Auth.js updated** with security patches
10. **Test across browsers** for compatibility

---

## 📚 Additional Resources

- [JWT.io](https://jwt.io/) - JWT token debugger
- [Auth System Guide](./AUTH_SYSTEM_GUIDE.md) - Complete API reference
- [Password Reset Guide](./PASSWORD_RESET_GUIDE.md) - Password reset flow
- [Example Protected Page](./public/example-protected-page.html) - Working example

---

**Last Updated:** October 3, 2025
**Version:** 2.0.0
**Status:** ✅ Production Ready
