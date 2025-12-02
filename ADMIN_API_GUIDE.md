# Admin API Guide - Photo Studio

## How to Upload Enhanced Photos & Complete Orders

You have **3 options** to interact with the Photo Studio admin endpoints:

---

## ⭐ **Option 1: Web Interface (Easiest)**

I've created a simple web page you can open in your browser!

### Steps:
1. **Open the admin tool:**

   **🌐 Web URL:** https://aiagent.ringlypro.com/admin-upload-tool.html

   Or open locally:
   ```
   open public/admin-upload-tool.html
   ```

2. **Login with your credentials:**
   - Email: `mstagg@digit2ai.com`
   - Password: Your admin password

3. **Upload enhanced photos:**
   - Enter Order ID (from email notification)
   - Click "Choose Files" and select your enhanced photos
   - Click "Upload Enhanced Photos"

4. **Mark order complete:**
   - Enter same Order ID
   - Click "Mark Order Complete & Notify Customer"
   - Customer receives email with download link

**That's it!** The web interface handles all API calls for you.

---

## 💻 **Option 2: Using Postman (GUI Tool)**

Postman is a popular API testing tool with a nice GUI.

### Download Postman:
https://www.postman.com/downloads/

### Step 1: Login to Get Token

1. **Create new request in Postman:**
   - Method: `POST`
   - URL: `https://aiagent.ringlypro.com/api/auth/login`

2. **Go to "Body" tab:**
   - Select `raw` and `JSON`
   - Enter:
   ```json
   {
     "email": "mstagg@digit2ai.com",
     "password": "YOUR_PASSWORD"
   }
   ```

3. **Click "Send"**
   - Copy the `token` from response
   - You'll use this token for all subsequent requests

### Step 2: Upload Enhanced Photos

1. **Create new request:**
   - Method: `POST`
   - URL: `https://aiagent.ringlypro.com/api/photo-studio/admin/order/2/upload-enhanced`
   - (Replace `2` with your Order ID)

2. **Set Authorization:**
   - Go to "Authorization" tab
   - Type: `Bearer Token`
   - Token: Paste the token from Step 1

3. **Set Body:**
   - Go to "Body" tab
   - Select `form-data`
   - Add rows with:
     - Key: `photos` (change type to `File` using dropdown)
     - Value: Click "Select Files" and choose your enhanced photos
   - Add multiple rows for multiple photos (all use key name `photos`)

4. **Click "Send"**
   - You'll see response with upload results

### Step 3: Mark Order Complete

1. **Create new request:**
   - Method: `PUT`
   - URL: `https://aiagent.ringlypro.com/api/photo-studio/admin/order/2/complete`
   - (Replace `2` with your Order ID)

2. **Set Authorization:**
   - Type: `Bearer Token`
   - Token: Same token from Step 1

3. **Set Headers:**
   - Key: `Content-Type`
   - Value: `application/json`

4. **Click "Send"**
   - Customer receives email notification

---

## 🔧 **Option 3: Using cURL (Command Line)**

For those comfortable with terminal/command line.

### Step 1: Login to Get Token

```bash
# Login
curl -X POST https://aiagent.ringlypro.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "mstagg@digit2ai.com",
    "password": "YOUR_PASSWORD"
  }'
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "mstagg@digit2ai.com",
    "isAdmin": true
  }
}
```

**Copy the token** - you'll need it for next steps.

### Step 2: Upload Enhanced Photos

```bash
# Upload enhanced photos (replace YOUR_TOKEN and file paths)
curl -X POST https://aiagent.ringlypro.com/api/photo-studio/admin/order/2/upload-enhanced \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "photos=@/path/to/enhanced_photo1.jpg" \
  -F "photos=@/path/to/enhanced_photo2.jpg" \
  -F "photos=@/path/to/enhanced_photo3.jpg"
```

**Tips:**
- Replace `2` with your Order ID
- Replace `YOUR_TOKEN` with the actual token from Step 1
- Replace `/path/to/...` with actual file paths
- You can add as many `-F "photos=@..."` lines as needed (up to 50 files)

**Example with real paths:**
```bash
curl -X POST https://aiagent.ringlypro.com/api/photo-studio/admin/order/2/upload-enhanced \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -F "photos=@/Users/mstagg/Downloads/enhanced_1.jpg" \
  -F "photos=@/Users/mstagg/Downloads/enhanced_2.jpg" \
  -F "photos=@/Users/mstagg/Downloads/enhanced_3.jpg"
```

**Response:**
```json
{
  "success": true,
  "message": "Uploaded 3 of 3 enhanced photo(s)",
  "uploads": [
    {
      "success": true,
      "filename": "enhanced_1.jpg",
      "enhancedPhotoId": 1,
      "url": "https://presigned-s3-url..."
    },
    ...
  ],
  "order": {
    "id": 2,
    "total_enhanced_photos": 3
  }
}
```

### Step 3: Mark Order Complete

```bash
# Mark order as completed (triggers customer email)
curl -X PUT https://aiagent.ringlypro.com/api/photo-studio/admin/order/2/complete \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

**Response:**
```json
{
  "success": true,
  "message": "Order marked as completed and customer notified",
  "orderId": 2,
  "customerEmail": "customer@example.com"
}
```

---

## 🔄 **Complete Workflow Example**

Here's a typical workflow using cURL:

```bash
# 1. Login and save token to variable
TOKEN=$(curl -s -X POST https://aiagent.ringlypro.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"mstagg@digit2ai.com","password":"YOUR_PASSWORD"}' \
  | grep -o '"token":"[^"]*' | cut -d'"' -f4)

echo "Token: $TOKEN"

# 2. Upload enhanced photos for Order #2
curl -X POST https://aiagent.ringlypro.com/api/photo-studio/admin/order/2/upload-enhanced \
  -H "Authorization: Bearer $TOKEN" \
  -F "photos=@enhanced_1.jpg" \
  -F "photos=@enhanced_2.jpg" \
  -F "photos=@enhanced_3.jpg"

# 3. Mark order complete
curl -X PUT https://aiagent.ringlypro.com/api/photo-studio/admin/order/2/complete \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
```

---

## 📱 **Option 4: Create a Simple Script**

Create a bash script to make it even easier!

Create a file called `upload-photos.sh`:

```bash
#!/bin/bash

# Configuration
API_BASE="https://aiagent.ringlypro.com/api"
EMAIL="mstagg@digit2ai.com"
ORDER_ID=$1

# Check if order ID provided
if [ -z "$ORDER_ID" ]; then
    echo "Usage: ./upload-photos.sh <ORDER_ID>"
    echo "Example: ./upload-photos.sh 2"
    exit 1
fi

# Login
echo "Logging in..."
read -sp "Password: " PASSWORD
echo ""

TOKEN=$(curl -s -X POST $API_BASE/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    echo "❌ Login failed!"
    exit 1
fi

echo "✅ Logged in successfully!"

# Upload photos from current directory
echo ""
echo "Uploading enhanced photos..."

# Build curl command with all JPG/PNG files in current directory
CURL_CMD="curl -X POST $API_BASE/photo-studio/admin/order/$ORDER_ID/upload-enhanced -H \"Authorization: Bearer $TOKEN\""

for file in *.{jpg,jpeg,png,JPG,JPEG,PNG}; do
    if [ -f "$file" ]; then
        CURL_CMD="$CURL_CMD -F \"photos=@$file\""
        echo "  - $file"
    fi
done

# Execute upload
echo ""
eval $CURL_CMD
echo ""

# Ask if should complete order
echo ""
read -p "Mark order $ORDER_ID as completed? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Marking order as completed..."
    curl -X PUT $API_BASE/photo-studio/admin/order/$ORDER_ID/complete \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json"
    echo ""
    echo "✅ Order completed! Customer has been notified."
fi
```

**Make it executable:**
```bash
chmod +x upload-photos.sh
```

**Usage:**
```bash
# Put your enhanced photos in a folder
cd /path/to/enhanced/photos

# Run the script with order ID
./upload-photos.sh 2
```

The script will:
1. Prompt for your password
2. Login and get token automatically
3. Upload ALL JPG/PNG files in current directory
4. Ask if you want to mark order complete
5. Send customer notification if you say yes

---

## 🎯 **Recommended Approach**

**For ease of use:** Use **Option 1** (Web Interface) - Just open `admin-upload-tool.html` in your browser!

**For power users:** Use **Option 4** (Bash Script) - One command uploads all photos

**For testing/debugging:** Use **Option 2** (Postman) - Visual interface to see requests/responses

**For automation:** Use **Option 3** (cURL) - Integrate into other workflows

---

## 🆘 **Troubleshooting**

### "Authentication required" or "401 Unauthorized"
- Your token expired (24h validity)
- Login again to get a new token

### "Admin access required" or "403 Forbidden"
- Not logged in with mstagg@digit2ai.com
- Check you're using the correct admin credentials

### Upload fails with "AWS S3 is not configured"
- Contact support - server configuration issue
- Check environment variables on Render.com

### "Order not found"
- Double-check the Order ID
- Check the email notification for correct ID

### Photos don't upload
- Check file format (JPEG, PNG, WebP only)
- Check file size (max 50MB per file)
- Check total files (max 50 files)
- Ensure files aren't corrupted

### Customer didn't receive email
- Check spam/junk folder
- Verify SendGrid is configured
- Check application logs on Render.com
- Email goes to customer's registered email address

---

## 📞 **Support**

Need help?
- Email: info@ringlypro.com
- Check logs: Render.com → RinglyPro-CRM → Logs
- Workflow docs: See [PHOTO_STUDIO_ADMIN_WORKFLOW.md](PHOTO_STUDIO_ADMIN_WORKFLOW.md)
