# AWS S3 Bucket Policy for Voicemail Audio

## Issue
The S3 bucket `ringlypro-uploads` returns 403 Forbidden when Twilio tries to access voicemail audio files.

## Solution
Add a bucket policy to make the `voicemail/` folder publicly readable.

## Steps to Fix

### Option 1: AWS Console (Recommended)

1. Go to [AWS S3 Console](https://s3.console.aws.amazon.com/s3/buckets)
2. Click on bucket: `ringlypro-uploads`
3. Go to **Permissions** tab
4. Scroll to **Bucket Policy**
5. Click **Edit**
6. Paste this policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadVoicemailAudio",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::ringlypro-uploads/voicemail/*"
    }
  ]
}
```

7. Click **Save changes**

### Option 2: AWS CLI

```bash
aws s3api put-bucket-policy --bucket ringlypro-uploads --policy '{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadVoicemailAudio",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::ringlypro-uploads/voicemail/*"
    }
  ]
}'
```

## Verification

After applying the policy, test with curl:

```bash
curl -I "https://ringlypro-uploads.s3.amazonaws.com/voicemail/client_29/voicemail_1764894267921.mp3"
```

**Expected:** `HTTP/1.1 200 OK`

## Security Notes

- ✅ **Safe:** Only `/voicemail/*` folder is public
- ✅ **No sensitive data:** Voicemail messages are informational only
- ✅ **Read-only:** Users cannot upload or modify files
- ✅ **Other folders remain private:** `/uploads/photo-studio/*` stays protected

## What This Does

This policy allows **anyone** to:
- **Read** files in `s3://ringlypro-uploads/voicemail/` folder
- **Play** audio files via HTTPS URLs

This policy does **NOT** allow:
- Listing files in the bucket
- Writing/uploading new files
- Deleting files
- Accessing other folders (photo-studio, etc.)

## Alternative: Presigned URLs (Not Recommended)

If you prefer NOT to make files public, we can use presigned URLs instead. However, this adds complexity:
- URLs expire after X hours
- Need to regenerate URLs periodically
- Database needs to store expiration times
- More API calls = higher costs

**Recommendation:** Use public bucket policy (Option 1) for simplicity.
