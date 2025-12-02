# RinglyPro Photo Upload System - Setup Guide

## Overview
Complete photo upload system for Photo Studio and future services. Supports browser, iOS, and Android uploads with AWS S3 storage integration.

---

## Architecture

### Design Principles
- **Service-Agnostic**: Built to support multiple services (Photo Studio, Video Studio, Content Creation, etc.)
- **No Interference**: Completely isolated from existing RinglyPro functions
- **Scalable**: Cloud storage (S3) with CDN support
- **Cross-Platform**: Works on all browsers and mobile devices

### Database Schema
- `photo_uploads` - Universal upload table for all services
- `photo_studio_orders.upload_urls` - JSONB column for quick reference
- View: `photo_studio_upload_summary` - Analytics and monitoring

---

## Files Created

### 1. Database Migration
**File:** `migrations/create-photo-uploads.sql`

**Creates:**
- `photo_uploads` table with extensible service_type field
- Indexes for performance (user_id, service_type, status, storage_key)
- Trigger for automatic timestamp updates
- View for Photo Studio upload summary

**Features:**
- Supports multiple service types (photo_studio, video_studio, etc.)
- Tracks upload status and processing status separately
- Stores device info (browser, iOS, Android)
- JSONB field for processed file metadata

### 2. API Routes
**File:** `src/routes/photo-uploads.js`

**Endpoints:**
- `POST /api/photo-uploads/upload` - Upload photos (multipart form data)
- `GET /api/photo-uploads/order/:orderId` - Get uploads for an order
- `DELETE /api/photo-uploads/:uploadId` - Delete uploaded photo
- `POST /api/photo-uploads/presigned-url` - Generate presigned URL for direct upload

**Features:**
- File validation (JPEG, PNG, HEIC, WebP)
- Size limit: 50MB per file, 20 files max per request
- Image metadata extraction using Sharp
- Automatic S3 upload with presigned URLs (7-day expiry)
- Device detection (browser, iOS, Android)
- Order status auto-update when upload complete

### 3. Customer Portal
**File:** `views/photo-studio-portal.ejs`

**Features:**
- View all Photo Studio orders
- Upload progress tracking with visual progress bars
- Drag-and-drop file upload (desktop)
- File selection (mobile-friendly)
- Live photo gallery with thumbnails
- Delete uploaded photos (before processing)
- Fully responsive (mobile, tablet, desktop)
- Real-time upload status

### 4. App Integration
**File:** `src/app.js` (modified)

**Changes:**
- Added photo upload routes import
- Mounted routes at `/api/photo-uploads`
- Added portal page route at `/photo-studio-portal`

### 5. Dependencies
**File:** `package.json` (modified)

**Added:**
- `@aws-sdk/client-s3` - AWS S3 client
- `@aws-sdk/s3-request-presigner` - Generate presigned URLs
- `multer` - File upload middleware
- `sharp` - Image processing and metadata

---

## Setup Instructions

### Step 1: Run Database Migration

```bash
# Connect to PostgreSQL
psql -U your_username -d your_database

# Run the migration
\i migrations/create-photo-uploads.sql
```

Or in pgAdmin:
1. Open Query Tool
2. Load `migrations/create-photo-uploads.sql`
3. Execute (F5)

### Step 2: Install Dependencies

```bash
npm install
```

This will install:
- AWS SDK v3 for S3
- Multer for file uploads
- Sharp for image processing

### Step 3: Configure AWS S3

Add these environment variables to your `.env` file:

```bash
# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
AWS_S3_BUCKET=ringlypro-uploads

# Existing variables (already configured)
WEBHOOK_BASE_URL=https://aiagent.ringlypro.com
STRIPE_SECRET_KEY=sk_live_...
```

### Step 4: Create S3 Bucket

**Option A: AWS Console**
1. Go to AWS S3 Console
2. Create bucket: `ringlypro-uploads`
3. Region: `us-east-1` (or match AWS_REGION)
4. Block public access: **ON** (we use presigned URLs)
5. Versioning: Optional
6. Encryption: AES-256 (enabled by default in code)

**Option B: AWS CLI**
```bash
aws s3 mb s3://ringlypro-uploads --region us-east-1
aws s3api put-public-access-block \
  --bucket ringlypro-uploads \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
```

### Step 5: Configure S3 CORS (for browser uploads)

Add CORS configuration to your S3 bucket:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedOrigins": [
      "https://aiagent.ringlypro.com",
      "http://localhost:3000"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

**To apply:**
```bash
aws s3api put-bucket-cors --bucket ringlypro-uploads --cors-configuration file://cors.json
```

### Step 6: Configure S3 Lifecycle Rules (Optional but Recommended)

Delete old uploads after 90 days:

```json
{
  "Rules": [
    {
      "Id": "DeleteOldUploads",
      "Status": "Enabled",
      "Prefix": "uploads/",
      "Expiration": {
        "Days": 90
      }
    }
  ]
}
```

```bash
aws s3api put-bucket-lifecycle-configuration --bucket ringlypro-uploads --lifecycle-configuration file://lifecycle.json
```

### Step 7: Test the System

1. **Start your server:**
   ```bash
   npm run dev
   ```

2. **Make a Photo Studio purchase:**
   - Visit: `http://localhost:3000/ai-food-photo-landing.html`
   - Purchase a package
   - Complete Stripe checkout

3. **Visit the portal:**
   - Go to: `http://localhost:3000/photo-studio-portal`
   - You should see your order

4. **Upload photos:**
   - Drag and drop images or click to select
   - Upload and verify in S3 bucket

---

## Storage Structure

### S3 Key Format
```
uploads/{service_type}/user_{user_id}/order_{order_id}/{timestamp}_{random}_{filename}.{ext}
```

**Example:**
```
uploads/photo_studio/user_123/order_456/1701234567890_a1b2c3d4_burger.jpg
```

### Benefits:
- Organized by service type (future-proof)
- Grouped by user and order
- Unique filenames prevent collisions
- Easy to locate and manage

---

## Database Schema Details

### photo_uploads Table

| Column | Type | Purpose |
|--------|------|---------|
| `id` | SERIAL | Primary key |
| `user_id` | INTEGER | References users(id) |
| `service_type` | VARCHAR(50) | 'photo_studio', 'video_studio', etc. |
| `service_order_id` | INTEGER | Order ID in respective service table |
| `original_filename` | VARCHAR(255) | Original file name |
| `file_size` | BIGINT | File size in bytes |
| `mime_type` | VARCHAR(100) | MIME type (image/jpeg, etc.) |
| `storage_key` | VARCHAR(500) | S3 key/path |
| `storage_url` | TEXT | Presigned URL (7-day expiry) |
| `image_width` | INTEGER | Image width in pixels |
| `image_height` | INTEGER | Image height in pixels |
| `upload_status` | VARCHAR(50) | uploading, uploaded, failed |
| `processing_status` | VARCHAR(50) | pending, in_progress, completed, failed |
| `upload_device` | VARCHAR(50) | browser, ios, android |
| `uploaded_at` | TIMESTAMP | Upload timestamp |

### Indexes
- `idx_photo_uploads_user_id` - Fast user lookups
- `idx_photo_uploads_service` - Service + order queries
- `idx_photo_uploads_status` - Processing pipeline queries
- `idx_photo_uploads_storage_key` - S3 key lookups

---

## API Usage Examples

### Upload Photos (JavaScript)

```javascript
const formData = new FormData();
formData.append('order_id', 123);
formData.append('service_type', 'photo_studio');

// Add multiple files
fileInputElement.files.forEach(file => {
  formData.append('photos', file);
});

const response = await fetch('/api/photo-uploads/upload', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${authToken}`
  },
  body: formData
});

const data = await response.json();
console.log(data.uploads); // Array of upload results
```

### Get Order Uploads

```javascript
const response = await fetch('/api/photo-uploads/order/123', {
  headers: {
    'Authorization': `Bearer ${authToken}`
  }
});

const data = await response.json();
console.log(data.uploads); // Array of uploaded photos
```

### Delete Upload

```javascript
const response = await fetch('/api/photo-uploads/456', {
  method: 'DELETE',
  headers: {
    'Authorization': `Bearer ${authToken}`
  }
});
```

---

## Mobile Support

### iOS Safari
✅ Drag and drop - Not supported (fallback to file input)
✅ File input - Fully supported
✅ Camera access - Native camera integration
✅ HEIC format - Supported (converted server-side if needed)

### Android Chrome
✅ Drag and drop - Limited support
✅ File input - Fully supported
✅ Camera access - Native camera integration
✅ All standard formats - Supported

### Browser Desktop
✅ Drag and drop - Full support
✅ File input - Full support
✅ Multiple files - Full support
✅ Preview thumbnails - Full support

---

## Security Features

### Authentication
- All endpoints require JWT authentication
- Order ownership verification
- No public uploads

### File Validation
- MIME type checking
- File size limits (50MB per file)
- Format validation (JPEG, PNG, HEIC, WebP only)
- Image metadata validation using Sharp

### S3 Security
- Private bucket (block all public access)
- Presigned URLs (7-day expiry)
- Server-side encryption (AES-256)
- Access logging (optional)

### Input Sanitization
- Filename sanitization
- SQL injection prevention (parameterized queries)
- XSS prevention (no user content in HTML)

---

## Monitoring & Admin Queries

### View All Uploads
```sql
SELECT
  u.id,
  usr.email,
  u.service_type,
  u.service_order_id,
  u.original_filename,
  u.upload_status,
  u.uploaded_at
FROM photo_uploads u
JOIN users usr ON u.user_id = usr.id
ORDER BY u.uploaded_at DESC
LIMIT 50;
```

### Photo Studio Upload Summary
```sql
SELECT * FROM photo_studio_upload_summary
WHERE order_status = 'awaiting_upload'
ORDER BY order_date DESC;
```

### Check Processing Queue
```sql
SELECT
  id,
  service_type,
  service_order_id,
  original_filename,
  processing_status,
  uploaded_at
FROM photo_uploads
WHERE upload_status = 'uploaded'
  AND processing_status = 'pending'
ORDER BY uploaded_at ASC;
```

### Storage Usage by User
```sql
SELECT
  user_id,
  COUNT(*) as total_uploads,
  SUM(file_size) as total_size_bytes,
  ROUND(SUM(file_size)::numeric / 1024 / 1024, 2) as total_size_mb
FROM photo_uploads
GROUP BY user_id
ORDER BY total_size_bytes DESC;
```

---

## Extending to Other Services

### Add New Service Type

1. **Update CHECK constraint:**
```sql
ALTER TABLE photo_uploads
DROP CONSTRAINT IF EXISTS photo_uploads_service_type_check;

ALTER TABLE photo_uploads
ADD CONSTRAINT photo_uploads_service_type_check
CHECK (service_type IN ('photo_studio', 'video_studio', 'content_creation', 'other'));
```

2. **Update API routes:**
```javascript
// In src/routes/photo-uploads.js
if (service_type === 'video_studio') {
  orderTable = 'video_studio_orders';
} else if (service_type === 'content_creation') {
  orderTable = 'content_creation_orders';
}
```

3. **No other changes needed!** The system is already designed for multiple services.

---

## Future Enhancements

### Phase 1 (Current)
- ✅ Photo upload (browser, iOS, Android)
- ✅ S3 storage integration
- ✅ Customer portal
- ✅ Upload progress tracking

### Phase 2 (Next Steps)
- [ ] Admin dashboard for order management
- [ ] Bulk download for admins
- [ ] Email notifications on upload complete
- [ ] Webhook for processing completion

### Phase 3 (Advanced)
- [ ] Image compression/optimization before upload
- [ ] CDN integration for faster delivery
- [ ] Multi-region S3 support
- [ ] Video upload support
- [ ] Background upload queue

---

## Troubleshooting

### Issue: "Failed to upload to S3"
**Solution:** Check AWS credentials and bucket permissions
```bash
aws s3 ls s3://ringlypro-uploads --region us-east-1
```

### Issue: "CORS error in browser"
**Solution:** Verify CORS configuration on S3 bucket

### Issue: "HEIC files fail validation"
**Solution:** Ensure Sharp is installed with HEIC support:
```bash
npm rebuild sharp
```

### Issue: "Presigned URLs expire too quickly"
**Solution:** URLs expire after 7 days. Implement background job to refresh URLs:
```javascript
// Refresh URLs for active orders
const expiryThreshold = Date.now() - (6 * 24 * 60 * 60 * 1000); // 6 days
// Regenerate presigned URLs for photos uploaded before threshold
```

---

## Cost Estimation

### AWS S3 Costs (us-east-1)
- **Storage:** $0.023/GB/month
- **PUT requests:** $0.005 per 1,000 requests
- **GET requests:** $0.0004 per 1,000 requests

### Example: 100 orders/month
- Photos per order: 20
- Average file size: 5MB
- Total storage: 10GB
- Monthly cost: ~$0.25 storage + ~$0.01 requests = **$0.26/month**

### CloudFront CDN (Optional)
- First 10TB: $0.085/GB
- Example: $0.85/month for 10GB transfer

---

## Support

For questions or issues:
- **Email:** support@ringlypro.com
- **Logs:** `logs/app.log` (check for `[PHOTO UPLOAD]` entries)
- **Database:** Check PostgreSQL logs for errors
- **S3:** Check CloudWatch logs (if enabled)

---

## Compliance & Privacy

### Data Retention
- Uploads stored for 90 days (configurable via S3 lifecycle)
- Database records retained indefinitely (or per company policy)
- Processed photos delivered via email/portal

### GDPR Compliance
- Right to deletion: Implement via DELETE endpoint
- Data export: Query database + download from S3
- Privacy policy: Update to mention photo storage

### Security Audit Checklist
- [ ] S3 bucket is private (no public access)
- [ ] All endpoints require authentication
- [ ] CORS configured correctly
- [ ] Environment variables secured
- [ ] Logs don't contain sensitive data
- [ ] Presigned URLs have reasonable expiry
- [ ] File size limits prevent abuse
- [ ] Rate limiting on upload endpoint (consider adding)

---

## Testing Checklist

- [ ] Database migration runs successfully
- [ ] API endpoints respond correctly
- [ ] File upload works (browser)
- [ ] File upload works (iOS)
- [ ] File upload works (Android)
- [ ] Drag and drop works (desktop)
- [ ] Progress tracking updates correctly
- [ ] Photos appear in S3 bucket
- [ ] Order status updates automatically
- [ ] Delete photo works
- [ ] Presigned URLs are accessible
- [ ] Portal loads on mobile
- [ ] Authentication redirects work
