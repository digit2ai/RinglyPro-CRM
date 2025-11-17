# RinglyPro Android App

Android application for RinglyPro - AI Sales Force platform.

## Project Structure

```
RinglyPro/
├── app/
│   ├── src/
│   │   └── main/
│   │       ├── java/com/ringlypro/
│   │       │   └── MainActivity.java
│   │       ├── res/
│   │       │   ├── values/
│   │       │   │   ├── strings.xml
│   │       │   │   ├── colors.xml
│   │       │   │   └── styles.xml
│   │       │   └── mipmap-*/
│   │       │       └── ic_launcher.png
│   │       └── AndroidManifest.xml
│   ├── build.gradle
│   └── proguard-rules.pro
├── build.gradle
├── settings.gradle
└── gradle.properties
```

## Features

- WebView-based app loading https://aiagent.ringlypro.com
- Full-screen immersive experience
- Camera and microphone permissions for WebRTC
- Local storage support
- Back button navigation
- Offline caching

## Building the App

### Prerequisites

1. Install [Android Studio](https://developer.android.com/studio)
2. Install Java Development Kit (JDK) 11 or higher
3. Install Android SDK Platform-Tools

### Build Steps

1. Open Android Studio
2. Click "Open an Existing Project"
3. Navigate to `android-app/RinglyPro` folder
4. Wait for Gradle sync to complete
5. Build > Generate Signed Bundle / APK
6. Select "Android App Bundle" for Google Play or "APK" for testing

### Testing

To test on an Android device or emulator:

```bash
# Connect your Android device or start an emulator
# Then run:
cd android-app/RinglyPro
./gradlew installDebug
```

### Release Build

To create a release build:

1. Generate a signing key:
```bash
keytool -genkey -v -keystore ringlypro-release-key.jks \
  -alias ringlypro -keyalg RSA -keysize 2048 -validity 10000
```

2. Create `keystore.properties` in project root:
```properties
storePassword=YOUR_STORE_PASSWORD
keyPassword=YOUR_KEY_PASSWORD
keyAlias=ringlypro
storeFile=../ringlypro-release-key.jks
```

3. Build release AAB:
```bash
./gradlew bundleRelease
```

The signed AAB will be in `app/build/outputs/bundle/release/app-release.aab`

## Google Play Console Setup

### 1. Create Google Play Developer Account

1. Go to [Google Play Console](https://play.google.com/console)
2. Pay the one-time $25 registration fee
3. Complete account verification

### 2. Create New App

1. Click "Create app" in Play Console
2. Enter app details:
   - **App name**: RinglyPro
   - **Default language**: English (United States)
   - **App or game**: App
   - **Free or paid**: Free

### 3. Set Up App Store Listing

Required assets:

**Screenshots** (at least 2 per type):
- Phone screenshots: 1080 x 1920px minimum
- 7-inch tablet: 1080 x 1920px
- 10-inch tablet: 1200 x 1920px

**App icon**:
- 512 x 512px PNG
- 32-bit PNG with alpha channel

**Feature graphic**:
- 1024 x 500px JPG or PNG

**Short description** (max 80 characters):
```
AI Sales Force — Booking, SMS & Mobile CRM for Business Growth
```

**Full description** (max 4000 characters):
```
RinglyPro is your complete AI-powered sales force that works 24/7 to grow your business.

🚀 NEVER MISS AN OPPORTUNITY
• AI answers every call while you focus on the job
• Automatic appointment booking with calendar sync
• Smart SMS and email follow-ups
• Bilingual support (English & Spanish)

📱 COMPLETE CRM IN YOUR POCKET
• Track every lead, call, and conversation
• Contact management with automatic tagging
• Call recordings and voicemail transcription
• Real-time activity dashboard

🤖 AI-POWERED AUTOMATION
• Business Collector - Find and qualify prospects automatically
• Outbound AI Dialer - Make calls 24/7
• Lead Generator - Capture leads from multiple channels
• Social Media Management - Auto-post and respond

💼 BUILT FOR SERVICE PROFESSIONALS
Perfect for contractors, landscapers, plumbers, electricians, HVAC, cleaning services, and any service-based business.

✨ KEY FEATURES:
✓ AI Call Answering & Routing
✓ Automatic Appointment Booking
✓ SMS & Email Campaigns
✓ CRM Contact Management
✓ Business Collector & Prospect Manager
✓ Outbound AI Calling
✓ Social Media Automation
✓ Calendar Integration (Google, Outlook, GoHighLevel)
✓ Real-time Analytics Dashboard
✓ Voicemail Transcription
✓ Multi-language Support

💰 TRANSPARENT PRICING:
• Free to start - 100 free tokens included
• No credit card required
• Pay-as-you-go token system
• No hidden fees, no subscriptions

🔒 SECURE & COMPLIANT:
• Enterprise-grade encryption
• HIPAA-ready infrastructure
• SOC 2 compliant
• Your data stays private

🌟 WHY RINGLYPRO?
Stop choosing between finishing the job and answering the phone. RinglyPro gives you back your time while multiplying your results.

Wake up to a calendar full of qualified appointments. No more chasing leads. No more missed opportunities. Just results.

Download RinglyPro today and experience the future of business automation!

🏆 Join thousands of service professionals who trust RinglyPro to grow their business.

---

A service of Digit2ai LLC.
Support: https://ringlypro.com/support
Privacy: https://ringlypro.com/privacy
Terms: https://ringlypro.com/terms
```

**Category**:
- Business

**Tags**:
- CRM
- Business
- AI
- Sales
- Automation

### 4. Content Rating

Complete the content rating questionnaire to get an appropriate rating.

### 5. Upload APK/AAB

1. Go to "Release" > "Production"
2. Create new release
3. Upload the signed AAB file
4. Fill in release notes
5. Review and roll out

## App Permissions Explained

- **INTERNET**: Required to load web app
- **ACCESS_NETWORK_STATE**: Check connectivity status
- **CAMERA**: For video calls and photo uploads
- **READ_EXTERNAL_STORAGE**: Access files for upload
- **WRITE_EXTERNAL_STORAGE**: Save downloaded files
- **RECORD_AUDIO**: For voice calls
- **MODIFY_AUDIO_SETTINGS**: Adjust audio for calls
- **VIBRATE**: Notification vibrations
- **WAKE_LOCK**: Keep screen on during calls

## Support

For issues or questions:
- Email: support@ringlypro.com
- Website: https://ringlypro.com
- Documentation: https://docs.ringlypro.com

## License

© 2025 Digit2ai LLC. All rights reserved.
