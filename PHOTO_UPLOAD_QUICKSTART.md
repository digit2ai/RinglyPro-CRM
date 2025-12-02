# Photo Upload System - Quick Start Guide

## What Was Built

A complete, production-ready photo upload system that allows Photo Studio customers to upload their photos via **browser, iOS, or Android**. The system is designed to be **reusable for future services** (Video Studio, Content Creation, etc.) without interfering with existing RinglyPro functions.

---

## Files Created

1. **`migrations/create-photo-uploads.sql`** - Database schema for uploads
2. **`src/routes/photo-uploads.js`** - API endpoints for uploading/managing photos
3. **`views/photo-studio-portal.ejs`** - Customer portal for viewing orders and uploading
4. **`PHOTO_UPLOAD_SETUP.md`** - Complete documentation

### Modified Files
- `src/app.js` - Added routes for photo uploads and portal
- `package.json` - Added dependencies (AWS SDK, Multer, Sharp)
- `views/photo-studio-success.ejs` - Updated CTA to "Upload Photos Now"

---

## Quick Setup (5 Steps)

### 1. Run Database Migration
```bash
psql -U your_user -d your_database -f migrations/create-photo-uploads.sql
```

Or in **pgAdmin**:
- Open Query Tool
- Load `migrations/create-photo-uploads.sql`
- Press F5 to execute

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure AWS S3 in `.env`
```bash
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_S3_BUCKET=ringlypro-uploads
```

### 4. Create S3 Bucket
```bash
# Via AWS Console: Create bucket "ringlypro-uploads"
# Or via CLI:
aws s3 mb s3://ringlypro-uploads --region us-east-1
```

### 5. Start Server
```bash
npm run dev
```

---

## How It Works

### Customer Flow
1. Customer purchases Photo Studio package
2. Redirected to success page with "Upload Photos Now" button
3. Clicks button → Goes to `/photo-studio-portal`
4. Sees all their orders with upload progress
5. Drag & drop or select photos (mobile-friendly)
6. Photos upload to S3 automatically
7. Order status updates to "processing" when complete

### Technical Flow
1. Customer uploads → API validates auth and order ownership
2. Files validated (type, size, format)
3. Images uploaded to S3 with presigned URLs
4. Metadata extracted and stored in `photo_uploads` table
5. Order's `photos_uploaded` count incremented
6. When all photos uploaded → Order status changes to "processing"

---

## Key Features

### Multi-Platform Support
- ✅ **Desktop browsers:** Drag & drop + file selection
- ✅ **iOS Safari:** Native file picker + camera access
- ✅ **Android Chrome:** File picker + camera access
- ✅ **Mobile responsive:** Works on all screen sizes

### File Support
- JPEG, PNG, HEIC, WebP
- Max 50MB per file
- Up to 20 files per upload
- Auto metadata extraction (width, height, format)

### Security
- JWT authentication required
- Order ownership verification
- Private S3 bucket with presigned URLs
- Server-side encryption (AES-256)

### Future-Proof Design
- `service_type` field supports multiple services
- Easy to add Video Studio, Content Creation, etc.
- No changes needed to core upload logic
- Completely isolated from RinglyPro CRM functions

---

## Portal URL

**Customer Portal:** `https://aiagent.ringlypro.com/photo-studio-portal`

Customers can:
- View all Photo Studio orders
- See upload progress
- Upload photos (drag & drop or select)
- Delete photos before processing
- Track order status

---

## Database Tables

### `photo_uploads`
Stores all uploaded files with metadata:
- File info (name, size, type)
- S3 storage details (key, URL)
- Image metadata (width, height)
- Processing status
- Device info (browser, iOS, Android)

### `photo_studio_orders`
Added column:
- `upload_urls` (JSONB) - Quick reference to uploaded files

### View: `photo_studio_upload_summary`
Analytics view showing:
- Order details
- Upload progress
- Processing status

---

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/photo-uploads/upload` | POST | Upload photos |
| `/api/photo-uploads/order/:orderId` | GET | Get uploads for order |
| `/api/photo-uploads/:uploadId` | DELETE | Delete uploaded photo |
| `/api/photo-uploads/presigned-url` | POST | Get presigned URL |

All endpoints require authentication (JWT Bearer token).

---

## Environment Variables Needed

```bash
# Already configured (from RinglyPro)
WEBHOOK_BASE_URL=https://aiagent.ringlypro.com
STRIPE_SECRET_KEY=sk_live_...

# NEW - AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=ringlypro-uploads
```

---

## S3 Storage Structure

```
ringlypro-uploads/
└── uploads/
    └── photo_studio/
        └── user_123/
            └── order_456/
                ├── 1701234567890_a1b2c3d4_burger.jpg
                ├── 1701234568901_e5f6g7h8_pasta.jpg
                └── ...
```

Benefits:
- Organized by service type (future services get their own folders)
- Grouped by user and order
- Unique filenames prevent collisions
- Easy to locate and manage

---

## Adding Future Services

To add Video Studio or other services:

1. **Add to database enum:**
```sql
ALTER TABLE photo_uploads
DROP CONSTRAINT photo_uploads_service_type_check;

ALTER TABLE photo_uploads
ADD CONSTRAINT photo_uploads_service_type_check
CHECK (service_type IN ('photo_studio', 'video_studio', 'content_creation'));
```

2. **Update API validation:**
```javascript
// In src/routes/photo-uploads.js
if (service_type === 'video_studio') {
  orderTable = 'video_studio_orders';
}
```

3. **Done!** Everything else works automatically.

---

## Testing

### Test Upload Flow
1. Visit: `http://localhost:3000/ai-food-photo-landing.html`
2. Purchase a package (use Stripe test card: `4242 4242 4242 4242`)
3. Click "Upload Photos Now" on success page
4. Upload test images
5. Verify in S3 bucket
6. Check database: `SELECT * FROM photo_uploads;`

### Test Mobile
1. Open portal on iPhone/Android: `/photo-studio-portal`
2. Tap order card
3. Tap "Click or drag photos here"
4. Select from camera or gallery
5. Upload and verify

---

## Admin Queries

### View all uploads
```sql
SELECT * FROM photo_studio_upload_summary
ORDER BY order_date DESC;
```

### Check pending uploads
```sql
SELECT * FROM photo_uploads
WHERE upload_status = 'uploaded'
  AND processing_status = 'pending';
```

### Storage usage by user
```sql
SELECT
  user_id,
  COUNT(*) as photos,
  ROUND(SUM(file_size)::numeric / 1024 / 1024, 2) as total_mb
FROM photo_uploads
GROUP BY user_id;
```

---

## Next Steps

1. **Run the migration** (Step 1 above)
2. **Configure AWS S3** (Steps 3-4 above)
3. **Install dependencies** (`npm install`)
4. **Test the system** (purchase package → upload photos)
5. **Monitor first uploads** (check S3 and database)

For complete documentation, see [PHOTO_UPLOAD_SETUP.md](./PHOTO_UPLOAD_SETUP.md).

---

## Support

Issues? Check:
1. Logs: `logs/app.log` (search for `[PHOTO UPLOAD]`)
2. S3 bucket permissions
3. AWS credentials in `.env`
4. Database migration ran successfully

Contact: support@ringlypro.com
