# RinglyPro CRM - iOS App

## Overview

Native iOS app for RinglyPro CRM that provides a seamless mobile experience for managing your business communications, appointments, and AI-powered features.

## Features

### Core Features
- ✅ Native iOS interface with WKWebView
- ✅ Push notifications for calls, appointments, messages
- ✅ Biometric authentication (Face ID / Touch ID)
- ✅ Offline mode detection
- ✅ Native navigation and gestures
- ✅ Camera access for profile photos
- ✅ Contact integration
- ✅ Calendar sync
- ✅ Background audio for calls

### App Capabilities
- CallKit integration for incoming calls
- UserNotifications for push alerts
- Background modes for VoIP
- Camera and photo library access
- Contacts access
- Calendar and reminders
- Push notifications

## Project Structure

```
RinglyPro/
├── RinglyPro.xcodeproj/
├── RinglyPro/
│   ├── App/
│   │   ├── AppDelegate.swift
│   │   ├── SceneDelegate.swift
│   │   └── Info.plist
│   ├── ViewControllers/
│   │   ├── MainViewController.swift
│   │   ├── LoginViewController.swift
│   │   └── SplashViewController.swift
│   ├── Services/
│   │   ├── AuthService.swift
│   │   ├── NotificationService.swift
│   │   ├── CallKitService.swift
│   │   └── WebViewBridge.swift
│   ├── Models/
│   │   ├── User.swift
│   │   ├── Notification.swift
│   │   └── Call.swift
│   ├── Resources/
│   │   ├── Assets.xcassets/
│   │   ├── LaunchScreen.storyboard
│   │   └── Main.storyboard
│   └── Extensions/
│       ├── WKWebView+Extensions.swift
│       └── UIColor+Brand.swift
├── RinglyProTests/
└── RinglyProUITests/
```

## Getting Started

### Prerequisites
- macOS 13.0 or later
- Xcode 15.0 or later
- Apple Developer Account ($99/year)
- CocoaPods or Swift Package Manager

### Installation

1. **Clone the repository**
```bash
cd /Users/manuelstagg/Documents/GitHub/RinglyPro-CRM/ios-app
```

2. **Open in Xcode**
```bash
open RinglyPro.xcodeproj
```

3. **Configure Bundle Identifier**
   - Update to: `com.ringlypro.crm`
   - Set Team in Signing & Capabilities

4. **Update Info.plist**
   - Add required permissions
   - Configure URL schemes

5. **Build and Run**
   - Select simulator or device
   - Press Cmd+R to build and run

## Configuration

### App Settings (Info.plist)

```xml
<key>CFBundleDisplayName</key>
<string>RinglyPro</string>

<key>CFBundleIdentifier</key>
<string>com.ringlypro.crm</string>

<key>NSCameraUsageDescription</key>
<string>RinglyPro needs camera access to update your profile photo</string>

<key>NSContactsUsageDescription</key>
<string>RinglyPro needs access to contacts for CRM integration</string>

<key>NSCalendarsUsageDescription</key>
<string>RinglyPro needs calendar access to sync appointments</string>

<key>NSMicrophoneUsageDescription</key>
<string>RinglyPro needs microphone access for voice calls</string>

<key>NSFaceIDUsageDescription</key>
<string>Use Face ID to securely access RinglyPro</string>
```

### Push Notifications Setup

1. **Enable in Xcode**
   - Target → Signing & Capabilities
   - Add "Push Notifications"
   - Add "Background Modes" → Remote notifications

2. **APNs Certificate**
   - Generate in Apple Developer Portal
   - Upload to your backend server
   - Configure Firebase Cloud Messaging (optional)

### Deep Linking

**URL Scheme:** `ringlypro://`

**Supported URLs:**
- `ringlypro://login`
- `ringlypro://dashboard`
- `ringlypro://copilot`
- `ringlypro://appointments`
- `ringlypro://messages`
- `ringlypro://calls`

## Building for App Store

### 1. Prepare Assets

**App Icons (Required sizes):**
- 1024x1024 (App Store)
- 180x180 (iPhone 3x)
- 120x120 (iPhone 2x)
- 167x167 (iPad Pro)
- 152x152 (iPad 2x)
- 76x76 (iPad 1x)

**Launch Screen:**
- Adaptive launch screen (storyboard)
- Light and dark mode support

### 2. Set Version Numbers

```swift
// In Xcode: General → Identity
Version: 1.0.0
Build: 1
```

### 3. Configure Signing

```
Team: Your Apple Developer Team
Bundle Identifier: com.ringlypro.crm
Signing Certificate: Distribution
Provisioning Profile: App Store
```

### 4. Build Archive

```
Product → Archive
```

### 5. Upload to App Store Connect

```
Window → Organizer
Select Archive → Distribute App
App Store Connect → Upload
```

### 6. Submit for Review

**App Store Information:**
- **Name:** RinglyPro CRM
- **Subtitle:** AI-Powered Business Management
- **Category:** Business
- **Price:** Free (with in-app purchases)
- **Age Rating:** 4+

**Description:**
```
RinglyPro CRM is your all-in-one AI-powered business management solution.
Manage calls, appointments, messages, and customer relationships from one
beautiful mobile app.

KEY FEATURES:
• AI Voice Assistant (Rachel & Lina) for English and Spanish
• Smart appointment booking with automatic reminders
• Integrated CRM with GoHighLevel
• Social media post generator
• Email marketing campaigns
• Business data collection
• Prospect management and outbound calling
• Real-time analytics and reporting

PRICING:
Free trial with 100 tokens included. Premium packages available.

SUBSCRIPTIONS:
• Starter: $29/month - 500 tokens
• Growth: $99/month - 2000 tokens
• Professional: $299/month - 7500 tokens
```

**Keywords:**
```
CRM, business, AI, voice assistant, appointments, calls,
messages, marketing, automation, sales
```

**Screenshots (Required):**
- 6.5" Display (iPhone 14 Pro Max): 6-10 screenshots
- 5.5" Display (iPhone 8 Plus): 6-10 screenshots
- 12.9" Display (iPad Pro): 6-10 screenshots

**Privacy Policy URL:**
```
https://aiagent.ringlypro.com/privacy-policy
```

**Support URL:**
```
https://aiagent.ringlypro.com/support
```

## Testing

### Unit Tests
```bash
Product → Test (Cmd+U)
```

### UI Tests
```bash
# Run UI test suite
xcodebuild test -scheme RinglyPro -destination 'platform=iOS Simulator,name=iPhone 14 Pro'
```

### TestFlight

1. **Upload Beta Build**
   - Archive → Distribute → TestFlight

2. **Add Beta Testers**
   - Internal: Up to 100 users (Apple Developer team)
   - External: Up to 10,000 users (requires beta review)

3. **Get Feedback**
   - TestFlight app provides crash reports
   - Users can submit feedback

## App Store Review Guidelines

### Common Rejection Reasons (Avoid These!)

1. **App Completeness**
   - ❌ Placeholder content
   - ✅ All features working, no "Coming Soon"

2. **Login Requirements**
   - ❌ Requiring login without demo mode
   - ✅ Provide demo account or explain why login is required

3. **In-App Purchases**
   - ❌ External payment links
   - ✅ Use Apple In-App Purchases for digital goods

4. **Privacy**
   - ❌ Missing privacy policy
   - ✅ Clear privacy policy URL

5. **Functionality**
   - ❌ Web view only app
   - ✅ Native features + enhanced web content

### Our App Compliance

✅ **2.1 App Completeness:** All features working
✅ **3.1.1 In-App Purchase:** Token packages via IAP
✅ **4.0 Design:** Native UI + polished web views
✅ **5.1 Privacy:** Privacy policy included
✅ **Guideline 2.5.2:** Not just a web view - includes native features:
   - Push notifications
   - CallKit integration
   - Biometric authentication
   - Native navigation
   - Offline detection

## Maintenance

### Updating the App

1. **Increment Version**
```swift
Version: 1.0.1 (or 1.1.0 for features)
Build: 2
```

2. **Update "What's New"**
```
Version 1.0.1
• Bug fixes and performance improvements
• Enhanced push notification handling
• Improved offline mode detection
```

3. **Test Thoroughly**
   - Unit tests
   - UI tests
   - Manual testing on devices

4. **Submit Update**
   - Archive → Distribute → App Store Connect

## Troubleshooting

### Common Issues

**Build Fails:**
```bash
# Clean build folder
Product → Clean Build Folder (Cmd+Shift+K)

# Delete derived data
rm -rf ~/Library/Developer/Xcode/DerivedData
```

**Signing Issues:**
- Verify Apple Developer account is active
- Check provisioning profiles in Xcode preferences
- Ensure bundle identifier matches

**Push Notifications Not Working:**
- Verify APNs certificate is valid
- Check device token registration
- Test with Apple's Push Notification Tester

**WebView Not Loading:**
- Check Info.plist for ATS exceptions
- Verify URL is HTTPS
- Check console for errors

## Resources

### Documentation
- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)
- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [WKWebView Documentation](https://developer.apple.com/documentation/webkit/wkwebview)
- [CallKit Framework](https://developer.apple.com/documentation/callkit)

### Tools
- [Xcode](https://developer.apple.com/xcode/)
- [TestFlight](https://developer.apple.com/testflight/)
- [App Store Connect](https://appstoreconnect.apple.com/)
- [Firebase (optional)](https://firebase.google.com/)

### Design
- [SF Symbols](https://developer.apple.com/sf-symbols/) - Apple's icon library
- [Sketch](https://www.sketch.com/) or [Figma](https://www.figma.com/) - Design tools

## Support

For questions or issues:
- Email: support@ringlypro.com
- Documentation: https://aiagent.ringlypro.com/docs
- GitHub Issues: https://github.com/yourusername/ringlypro-ios/issues

## License

Proprietary - RinglyPro CRM © 2024

---

**Ready to build!** Follow the step-by-step guide in `SETUP_GUIDE.md` to create your Xcode project.
