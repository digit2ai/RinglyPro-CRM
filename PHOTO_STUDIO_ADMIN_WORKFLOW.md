# Photo Studio Admin Workflow

## Complete End-to-End Process

### 1. Customer Uploads Photos
- Customer purchases a package (Demo $1, Starter $150, Pro $350, Elite $500)
- Customer uploads photos via Photo Studio Portal
- When all photos uploaded, order status → **"processing"**
- **Admin receives email** at `mstagg@digit2ai.com` with:
  - Order details
  - Customer information
  - Direct S3 URLs to all uploaded photos
  - Links to Portal and S3 Console

### 2. Admin Downloads Original Photos
Two ways to access photos:

**Option A: Use S3 URLs from email**
- Click photo URLs in the admin notification email
- Photos are presigned URLs (valid for 7 days)
- Download directly to your computer

**Option B: AWS S3 Console**
- Login to AWS Console: https://s3.console.aws.amazon.com
- Bucket: `ringlypro-uploads`
- Path: `uploads/photo_studio/user_X/order_Y/`
- Download all photos for enhancement

### 3. Enhance Photos
- Use your preferred AI enhancement tools
- Apply professional edits:
  - Lighting and exposure adjustments
  - Color correction and vibrancy
  - Sharpness and detail enhancement
  - Composition improvements
- Save enhanced photos (JPEG, PNG, WebP recommended)

### 4. Upload Enhanced Photos

**Endpoint:** `POST /api/photo-studio/admin/order/:orderId/upload-enhanced`

**Requirements:**
- Admin authentication (JWT token)
- Photos as multipart/form-data
- Field name: `photos` (array)
- Max 50 files per upload
- Max file size: 50MB each

**Example using cURL:**
```bash
curl -X POST https://aiagent.ringlypro.com/api/photo-studio/admin/order/2/upload-enhanced \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN" \
  -F "photos=@enhanced_photo1.jpg" \
  -F "photos=@enhanced_photo2.jpg" \
  -F "photos=@enhanced_photo3.jpg"
```

**Example using Postman:**
1. Method: POST
2. URL: `https://aiagent.ringlypro.com/api/photo-studio/admin/order/2/upload-enhanced`
3. Headers: `Authorization: Bearer YOUR_ADMIN_JWT_TOKEN`
4. Body: form-data
5. Add files with key `photos` (allow multiple)
6. Send request

**Response:**
```json
{
  "success": true,
  "message": "Uploaded 3 of 3 enhanced photo(s)",
  "uploads": [
    {
      "success": true,
      "filename": "enhanced_photo1.jpg",
      "enhancedPhotoId": 1,
      "url": "https://presigned-s3-url..."
    }
  ],
  "order": {
    "id": 2,
    "total_enhanced_photos": 3
  }
}
```

### 5. Mark Order as Completed

**Endpoint:** `PUT /api/photo-studio/admin/order/:orderId/complete`

**Example:**
```bash
curl -X PUT https://aiagent.ringlypro.com/api/photo-studio/admin/order/2/complete \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

**What happens:**
- Order status → **"completed"**
- Delivery date timestamp recorded
- **Customer receives email notification** with:
  - Success message
  - Order summary
  - Download button to portal
  - List of enhancements made

### 6. Customer Downloads Enhanced Photos
- Customer receives completion email
- Clicks "Download Your Photos" button
- Logs into Photo Studio Portal
- Views order with "Completed" status
- Downloads all enhanced photos

---

## API Endpoints Summary

### Admin Endpoints (Require Admin Auth)

1. **Upload Enhanced Photos**
   - `POST /api/photo-studio/admin/order/:orderId/upload-enhanced`
   - Multipart form-data with `photos` field
   - Max 50 files, 50MB each

2. **Mark Order Complete**
   - `PUT /api/photo-studio/admin/order/:orderId/complete`
   - Triggers customer notification email

### Customer Endpoints

1. **Get Enhanced Photos**
   - `GET /api/photo-studio/order/:orderId/enhanced-photos`
   - Returns list of enhanced photos with download URLs

2. **Get Order Details**
   - `GET /api/photo-studio/order/:orderId`
   - Returns order status and information

---

## Email Notifications

### Admin Notification (Photos Uploaded)
- **To:** mstagg@digit2ai.com
- **When:** Customer completes photo upload
- **Includes:**
  - Order ID, customer name, email, package type
  - Number of photos uploaded
  - All photo URLs (presigned, 7-day expiry)
  - Links to Portal and S3 bucket
  - Next steps checklist

### Customer Notification (Order Complete)
- **To:** Customer email
- **When:** Admin marks order as completed
- **Includes:**
  - Success celebration message
  - Order summary (ID, package, photo count)
  - Download button to portal
  - List of enhancements made
  - Support contact information

---

## Database Tables

### photo_studio_orders
- Tracks package purchases
- Order status: awaiting_upload → processing → completed
- Photos to upload/receive counts
- Payment information

### photo_uploads
- Original photos uploaded by customers
- Stored at: `uploads/photo_studio/user_X/order_Y/`
- Links to orders via service_order_id

### enhanced_photos
- Enhanced photos uploaded by admin
- Stored at: `uploads/photo_studio/user_X/order_Y/enhanced/`
- Links to orders via order_id
- Tracks delivery status (ready, downloaded, archived)
- 30-day presigned URLs for customer access

---

## S3 Storage Structure

```
ringlypro-uploads/
└── uploads/
    └── photo_studio/
        └── user_X/
            └── order_Y/
                ├── original_photo1.jpg       (customer uploads)
                ├── original_photo2.jpg
                └── enhanced/
                    ├── enhanced_photo1.jpg   (admin uploads)
                    ├── enhanced_photo2.jpg
                    └── enhanced_photo3.jpg
```

---

## Getting Your Admin JWT Token

1. Login as admin:
```bash
curl -X POST https://aiagent.ringlypro.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "mstagg@digit2ai.com",
    "password": "YOUR_PASSWORD"
  }'
```

2. Response includes JWT token:
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

3. Use token in all subsequent requests:
   - Header: `Authorization: Bearer YOUR_TOKEN_HERE`

---

## Troubleshooting

### "Admin access required" error
- Verify you're using the correct JWT token
- Check token hasn't expired (24h validity)
- Ensure you're logged in as mstagg@digit2ai.com

### Upload fails with "AWS S3 is not configured"
- Check environment variables on Render.com:
  - AWS_ACCESS_KEY_ID
  - AWS_SECRET_ACCESS_KEY
  - AWS_REGION
  - AWS_S3_BUCKET

### Customer can't see enhanced photos
- Verify order status is "completed"
- Check enhanced_photos table has records for that order
- Ensure presigned URLs haven't expired (30 days)

### Email not received
- Check SendGrid API key is configured
- Verify SendGrid sender (noreply@ringlypro.com) is verified
- Check spam/junk folders
- Look for errors in application logs

---

## Support

For technical issues:
- Email: info@ringlypro.com
- Check logs: Render.com dashboard → RinglyPro-CRM → Logs
