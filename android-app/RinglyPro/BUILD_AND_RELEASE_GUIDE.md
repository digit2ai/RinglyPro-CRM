# RinglyPro Android - Build and Release Guide

## Prerequisites

### 1. Install Android Studio
Download from: https://developer.android.com/studio

### 2. Install Java JDK 11+
```bash
# macOS (using Homebrew)
brew install openjdk@11

# Verify installation
java -version
```

### 3. Set up Android SDK
Open Android Studio and install:
- Android SDK Platform 34
- Android SDK Build-Tools 34.0.0
- Android SDK Platform-Tools

## Development Build

### Option 1: Using Android Studio (Recommended)

1. Open Android Studio
2. File → Open → Select `android-app/RinglyPro` folder
3. Wait for Gradle sync to complete
4. Connect Android device or start emulator
5. Run → Run 'app' (or press Shift+F10)

### Option 2: Using Command Line

```bash
cd android-app/RinglyPro

# Debug build
./gradlew assembleDebug

# Install on connected device
./gradlew installDebug

# Build and install
./gradlew installDebug
```

The APK will be at: `app/build/outputs/apk/debug/app-debug.apk`

## Generate App Icons

1. Prepare a 1024x1024px PNG icon with transparent background
2. Run the icon generation script:

```bash
cd android-app/RinglyPro
./generate-icons.sh path/to/your/icon-1024.png
```

This will generate all required icon sizes and Play Store assets.

## Release Build Setup

### Step 1: Generate Signing Key

```bash
cd android-app/RinglyPro

# Generate keystore (do this once)
keytool -genkey -v -keystore ringlypro-release-key.jks \
  -alias ringlypro \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000

# Answer the prompts:
# - Enter keystore password: [CREATE STRONG PASSWORD]
# - Re-enter new password: [REPEAT PASSWORD]
# - What is your first and last name?: Digit2ai LLC
# - What is the name of your organizational unit?: Development
# - What is the name of your organization?: Digit2ai LLC
# - What is the name of your City or Locality?: [Your City]
# - What is the name of your State or Province?: [Your State]
# - What is the two-letter country code?: US
# - Is this correct? yes
# - Enter key password: [PRESS ENTER to use same password]
```

**⚠️ IMPORTANT:** Store the keystore file and passwords securely! If you lose them, you cannot update your app on Google Play.

### Step 2: Create Keystore Properties

Create `keystore.properties` in the `android-app/RinglyPro` directory:

```properties
storePassword=YOUR_KEYSTORE_PASSWORD
keyPassword=YOUR_KEY_PASSWORD
keyAlias=ringlypro
storeFile=../ringlypro-release-key.jks
```

Add this file to `.gitignore` to keep credentials secure.

### Step 3: Update app/build.gradle

Add signing configuration (already configured in the provided build.gradle):

```gradle
android {
    ...
    signingConfigs {
        release {
            def keystorePropertiesFile = rootProject.file("keystore.properties")
            if (keystorePropertiesFile.exists()) {
                def keystoreProperties = new Properties()
                keystoreProperties.load(new FileInputStream(keystorePropertiesFile))

                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }

    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
}
```

### Step 4: Build Release AAB (Android App Bundle)

```bash
cd android-app/RinglyPro

# Build release AAB (for Google Play)
./gradlew bundleRelease

# The AAB will be at:
# app/build/outputs/bundle/release/app-release.aab
```

### Step 5: Build Release APK (for testing)

```bash
# Build release APK
./gradlew assembleRelease

# The APK will be at:
# app/build/outputs/apk/release/app-release.apk
```

## Google Play Console Setup

### 1. Create Developer Account

1. Go to https://play.google.com/console
2. Sign in with Google account
3. Pay $25 one-time registration fee
4. Complete account information
5. Accept Developer Distribution Agreement

### 2. Create New App

1. Click "Create app"
2. Fill in details:
   - **App name**: RinglyPro
   - **Default language**: English (United States)
   - **App or game**: App
   - **Free or paid**: Free
3. Declare app content (fill questionnaires)

### 3. Set Up Store Listing

#### Required Assets

**App Icon**
- Size: 512 x 512 px
- Format: PNG
- File: `play-store-assets/ic_launcher_512.png`

**Feature Graphic**
- Size: 1024 x 500 px
- Format: PNG or JPG
- Create in Figma/Photoshop with RinglyPro branding

**Phone Screenshots** (2-8 required)
- Min size: 320 px on shortest side
- Max size: 3840 px on longest side
- Aspect ratio: 16:9 or 9:16
- Take screenshots from the app on different screens

**7-inch Tablet Screenshots** (Optional but recommended)
- Same requirements as phone

**10-inch Tablet Screenshots** (Optional but recommended)
- Same requirements as phone

#### Store Listing Text

**Short description** (max 80 characters):
```
AI Sales Force — Booking, SMS & Mobile CRM for Business Growth
```

**Full description** (max 4000 characters):
See the detailed description in README.md

**App category**: Business

**Tags**: CRM, Business, AI, Sales, Automation

**Contact email**: info@ringlypro.com

**Privacy policy URL**: https://ringlypro.com/privacy

**Terms of service URL**: https://ringlypro.com/terms

### 4. Content Rating

1. Go to "Content rating"
2. Fill out the questionnaire honestly
3. Categories to expect: Everyone or Teen
4. Submit for rating

### 5. App Access

If your app requires login:
1. Provide demo/test account credentials
2. Instructions for reviewers

### 6. Ads Declaration

Declare if your app contains ads (likely "No" for RinglyPro)

### 7. Target Audience

1. Select target age group (likely 18+)
2. Declare if it's designed for children (No)

### 8. Upload Release

1. Go to "Release" → "Production"
2. Click "Create new release"
3. Upload the signed AAB file
4. Add release notes:
   ```
   Initial release of RinglyPro

   Features:
   - AI-powered call answering and booking
   - Complete CRM functionality
   - Business Collector and Prospect Manager
   - Outbound AI calling
   - SMS and email campaigns
   - Social media automation
   - Real-time analytics dashboard
   ```
5. Review and start rollout

### 9. Review Process

- Initial review typically takes 1-7 days
- You'll receive email notifications about status
- If rejected, review feedback and resubmit

## Testing Before Release

### Internal Testing

1. Upload AAB to Internal Testing track
2. Add tester email addresses
3. Share testing link with team
4. Gather feedback and fix bugs

### Closed Testing (Beta)

1. Create closed testing track
2. Add testers or create tester list
3. Get feedback from real users
4. Iterate before production release

### Open Testing (Public Beta)

1. Optional: Create open testing track
2. Anyone can join and test
3. Great for gathering broader feedback

## Update Existing App

To release an update:

1. Increment version in `app/build.gradle`:
   ```gradle
   versionCode 2  // Increment by 1
   versionName "1.1.0"  // Update version string
   ```

2. Build new AAB:
   ```bash
   ./gradlew bundleRelease
   ```

3. Upload to Google Play Console
4. Add release notes describing changes
5. Submit for review

## Troubleshooting

### Build Errors

**Gradle sync failed**
- File → Invalidate Caches / Restart
- Update Gradle in `gradle-wrapper.properties`

**SDK not found**
- Open SDK Manager in Android Studio
- Install missing SDK versions

**Signing error**
- Verify keystore.properties exists and has correct paths
- Check keystore password is correct

### Runtime Errors

**WebView not loading**
- Check INTERNET permission in AndroidManifest.xml
- Verify URL is correct in MainActivity.java
- Check device internet connection

**App crashes on startup**
- Check logcat in Android Studio
- Verify all required dependencies are included

### Play Store Issues

**App rejected**
- Review rejection email carefully
- Common issues: privacy policy, permissions, content rating
- Fix issues and resubmit

**App not visible**
- Check country/device compatibility settings
- Verify app is published (not draft)
- Wait up to 24 hours for Play Store indexing

## Security Best Practices

1. **Never commit keystore files to Git**
   ```bash
   echo "*.jks" >> .gitignore
   echo "keystore.properties" >> .gitignore
   ```

2. **Store keystore backup securely**
   - Keep multiple secure backups
   - Store passwords in password manager
   - Document recovery procedures

3. **Use ProGuard/R8 for release builds**
   - Already enabled in build.gradle
   - Obfuscates code and reduces APK size

4. **Enable Google Play App Signing**
   - Recommended for added security
   - Google manages signing key
   - You keep upload key

## Resources

- [Android Developer Documentation](https://developer.android.com/docs)
- [Google Play Console Help](https://support.google.com/googleplay/android-developer)
- [Android Studio User Guide](https://developer.android.com/studio/intro)
- [Publishing on Google Play](https://developer.android.com/distribute/google-play)

## Support

For issues with the RinglyPro Android app:
- Email: info@ringlypro.com
- Documentation: https://docs.ringlypro.com
- Website: https://ringlypro.com
