# Server Restart Required

## ⚠️ Important: New Routes Added

The following new routes have been added and require a server restart:

1. `/photo-studio-auth` - Sign up/Login page
2. `/photo-studio-portal` - Upload portal (already existed)
3. `/api/photo-uploads/*` - Upload API endpoints

## 🔄 How to Restart

### If using PM2 (Production):
```bash
pm2 restart all
# or restart specific app
pm2 restart ringlypro-crm
```

### If using npm run dev (Development):
```bash
# Stop the current server (Ctrl+C)
# Then restart:
npm run dev
```

### If using nodemon (Development):
```bash
# Nodemon should auto-restart if file changes detected
# If not, manually restart:
# Stop (Ctrl+C), then:
npm run dev
```

### If running with node directly:
```bash
# Stop the server (Ctrl+C or kill process)
# Then restart:
node src/server.js
```

## ✅ Verify Server is Running

After restart, test the new endpoints:

```bash
# Test auth page (should return HTML, not JSON error)
curl https://aiagent.ringlypro.com/photo-studio-auth

# Test portal page
curl https://aiagent.ringlypro.com/photo-studio-portal

# Test API endpoints (should require auth)
curl https://aiagent.ringlypro.com/api/photo-studio/packages
```

## 🐛 If Still Getting "Endpoint not found"

1. **Check server logs:**
   ```bash
   # If using PM2:
   pm2 logs

   # If using npm/node:
   # Check console output
   ```

2. **Verify routes loaded:**
   Look for these log messages on startup:
   ```
   ✅ Photo Studio routes loaded successfully
   ✅ Photo Upload routes loaded successfully
   ✅ Photo Studio routes mounted at /api/photo-studio
   ✅ Photo Upload routes mounted at /api/photo-uploads
   ```

3. **Check for errors:**
   ```bash
   # Check error logs
   tail -f logs/app.log

   # Or PM2 error logs
   pm2 logs --err
   ```

4. **Verify app.js was saved:**
   ```bash
   grep -n "photo-studio-auth" src/app.js
   # Should show line 407: app.get('/photo-studio-auth'...
   ```

5. **Check views directory:**
   ```bash
   ls -la views/photo-studio*.ejs
   # Should show:
   # photo-studio-auth.ejs
   # photo-studio-portal.ejs
   # photo-studio-success.ejs
   ```

## 📝 Common Issues

### Issue: "Cannot find module 'photo-uploads'"
**Solution:**
```bash
# Routes file might have wrong path
# Check: src/routes/photo-uploads.js exists
ls src/routes/photo-uploads.js

# If missing, file was not created properly
```

### Issue: "Error: Failed to lookup view"
**Solution:**
```bash
# EJS files missing or wrong location
# Verify:
ls views/photo-studio-auth.ejs
ls views/photo-studio-portal.ejs
```

### Issue: CORS error from ringlypro.com
**Solution:**
Make sure CORS is configured to allow ringlypro.com:
```javascript
// In src/app.js
app.use(cors({
  origin: [
    'https://ringlypro.com',
    'https://www.ringlypro.com',
    'https://aiagent.ringlypro.com'
  ],
  credentials: true
}));
```

## 🎯 Expected Behavior After Restart

1. Visit: `https://aiagent.ringlypro.com/photo-studio-auth`
   - Should see signup/login form (not JSON error)

2. Visit: `https://ringlypro.com/photo-studio`
   - Click "Get Started"
   - Should redirect to auth page

3. Complete signup
   - Should redirect back to landing page
   - Should have authToken in localStorage

4. Click "Get Started" again
   - Should create Stripe checkout
   - Should NOT get "Endpoint not found" error

---

**Once restarted, the complete flow should work!** 🚀
