# RinglyPro iOS App - Complete Setup Guide

## Step-by-Step Instructions

This guide will walk you through creating the iOS app from scratch using Xcode.

---

## Part 1: Create Xcode Project

### 1. Open Xcode
- Launch Xcode from Applications
- Click "Create a new Xcode project"

### 2. Choose Template
- Select **iOS** tab
- Choose **App** template
- Click **Next**

### 3. Configure Project
```
Product Name: RinglyPro
Team: [Your Apple Developer Team]
Organization Identifier: com.ringlypro
Bundle Identifier: com.ringlypro.crm
Interface: Storyboard
Language: Swift
✅ Include Tests
```

### 4. Save Location
```
/Users/manuelstagg/Documents/GitHub/RinglyPro-CRM/ios-app/
```

---

## Part 2: Project Structure

After creating the project, organize it like this:

```
RinglyPro/
├── App/
│   ├── AppDelegate.swift
│   ├── SceneDelegate.swift
│   └── Info.plist
├── ViewControllers/
│   ├── MainViewController.swift
│   ├── SplashViewController.swift
│   └── WebViewController.swift
├── Services/
│   ├── AuthService.swift
│   ├── NotificationService.swift
│   └── WebViewBridge.swift
├── Models/
│   ├── User.swift
│   └── AppConfig.swift
├── Extensions/
│   ├── WKWebView+Extensions.swift
│   └── UIColor+Brand.swift
├── Resources/
│   ├── Assets.xcassets/
│   ├── LaunchScreen.storyboard
│   └── Main.storyboard
└── Supporting Files/
    └── RinglyPro-Bridging-Header.h (if needed)
```

**To create folders in Xcode:**
1. Right-click on "RinglyPro" folder
2. New Group → Name it (e.g., "ViewControllers")
3. Repeat for all folders above

---

## Part 3: Configure Capabilities

### 1. Enable Required Capabilities
**Target → Signing & Capabilities → + Capability**

Add these:
- ✅ Push Notifications
- ✅ Background Modes
  - ✅ Remote notifications
  - ✅ Voice over IP
  - ✅ Background fetch
- ✅ App Groups (optional, for widgets)
- ✅ Associated Domains (for universal links)

### 2. Update Info.plist

Right-click Info.plist → Open As → Source Code

Add these permissions:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- App Transport Security -->
    <key>NSAppTransportSecurity</key>
    <dict>
        <key>NSAllowsArbitraryLoads</key>
        <false/>
        <key>NSExceptionDomains</key>
        <dict>
            <key>aiagent.ringlypro.com</key>
            <dict>
                <key>NSIncludesSubdomains</key>
                <true/>
                <key>NSTemporaryExceptionAllowsInsecureHTTPLoads</key>
                <false/>
                <key>NSTemporaryExceptionRequiresForwardSecrecy</key>
                <true/>
                <key>NSTemporaryExceptionMinimumTLSVersion</key>
                <string>TLSv1.2</string>
            </dict>
        </dict>
    </dict>

    <!-- Privacy Permissions -->
    <key>NSCameraUsageDescription</key>
    <string>RinglyPro needs camera access to update your profile photo</string>

    <key>NSPhotoLibraryUsageDescription</key>
    <string>RinglyPro needs photo library access to upload images</string>

    <key>NSContactsUsageDescription</key>
    <string>RinglyPro needs access to contacts for CRM integration</string>

    <key>NSCalendarsUsageDescription</key>
    <string>RinglyPro needs calendar access to sync appointments</string>

    <key>NSRemindersUsageDescription</key>
    <string>RinglyPro needs reminders access to set appointment alerts</string>

    <key>NSMicrophoneUsageDescription</key>
    <string>RinglyPro needs microphone access for voice calls</string>

    <key>NSFaceIDUsageDescription</key>
    <string>Use Face ID to securely access RinglyPro</string>

    <key>NSUserTrackingUsageDescription</key>
    <string>This helps us provide personalized features and improve the app</string>

    <!-- URL Schemes -->
    <key>CFBundleURLTypes</key>
    <array>
        <dict>
            <key>CFBundleURLName</key>
            <string>com.ringlypro.crm</string>
            <key>CFBundleURLSchemes</key>
            <array>
                <string>ringlypro</string>
            </array>
        </dict>
    </array>

    <!-- Universal Links -->
    <key>com.apple.developer.associated-domains</key>
    <array>
        <string>applinks:aiagent.ringlypro.com</string>
    </array>

    <!-- Background Modes -->
    <key>UIBackgroundModes</key>
    <array>
        <string>fetch</string>
        <string>remote-notification</string>
        <string>voip</string>
    </array>

    <!-- Status Bar -->
    <key>UIStatusBarStyle</key>
    <string>UIStatusBarStyleLightContent</string>
    <key>UIViewControllerBasedStatusBarAppearance</key>
    <false/>
</dict>
</plist>
```

---

## Part 4: Implementation

Now I'll provide all the Swift code files you need. Create each file in Xcode:

**File → New → File → Swift File**

---

### File 1: AppDelegate.swift

**Location:** `App/AppDelegate.swift`

```swift
import UIKit
import UserNotifications

@main
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {

        // Configure appearance
        configureAppearance()

        // Register for push notifications
        registerForPushNotifications()

        // Setup CallKit (if needed)
        // CallKitService.shared.setup()

        return true
    }

    // MARK: - Push Notifications

    func registerForPushNotifications() {
        UNUserNotificationCenter.current().delegate = self
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, error in
            print("Push notification permission granted: \(granted)")

            guard granted else { return }

            DispatchQueue.main.async {
                UIApplication.shared.registerForRemoteNotifications()
            }
        }
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let tokenParts = deviceToken.map { data in String(format: "%02.2hhx", data) }
        let token = tokenParts.joined()
        print("Device Token: \(token)")

        // Send token to your backend
        AuthService.shared.updateDeviceToken(token)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("Failed to register for remote notifications: \(error.localizedDescription)")
    }

    // MARK: - URL Handling

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey : Any] = [:]) -> Bool {
        // Handle deep links: ringlypro://...
        return handleDeepLink(url)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Handle universal links: https://aiagent.ringlypro.com/...
        guard userActivity.activityType == NSUserActivityTypeBrowsingWeb,
              let url = userActivity.webpageURL else {
            return false
        }
        return handleDeepLink(url)
    }

    private func handleDeepLink(_ url: URL) -> Bool {
        print("Deep link received: \(url)")

        // Parse URL and navigate
        // Example: ringlypro://copilot → Open copilot page

        NotificationCenter.default.post(name: NSNotification.Name("DeepLinkReceived"), object: url)

        return true
    }

    // MARK: - Appearance

    private func configureAppearance() {
        // Set navigation bar appearance
        let appearance = UINavigationBarAppearance()
        appearance.configureWithOpaqueBackground()
        appearance.backgroundColor = UIColor.brandPrimary
        appearance.titleTextAttributes = [.foregroundColor: UIColor.white]
        appearance.largeTitleTextAttributes = [.foregroundColor: UIColor.white]

        UINavigationBar.appearance().standardAppearance = appearance
        UINavigationBar.appearance().scrollEdgeAppearance = appearance
        UINavigationBar.appearance().compactAppearance = appearance
        UINavigationBar.appearance().tintColor = .white
    }

    // MARK: UISceneSession Lifecycle

    func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        return UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    }
}

// MARK: - UNUserNotificationCenterDelegate

extension AppDelegate: UNUserNotificationCenterDelegate {

    // Foreground notification
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        // Show notification even when app is in foreground
        completionHandler([.banner, .sound, .badge])
    }

    // Notification tapped
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        let userInfo = response.notification.request.content.userInfo

        // Handle notification tap
        if let deepLink = userInfo["deepLink"] as? String, let url = URL(string: deepLink) {
            handleDeepLink(url)
        }

        completionHandler()
    }
}
```

---

### File 2: SceneDelegate.swift

**Location:** `App/SceneDelegate.swift`

```swift
import UIKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = (scene as? UIWindowScene) else { return }

        window = UIWindow(windowScene: windowScene)

        // Check if user is logged in
        if AuthService.shared.isLoggedIn {
            // Show main app
            let mainVC = MainViewController()
            let navController = UINavigationController(rootViewController: mainVC)
            window?.rootViewController = navController
        } else {
            // Show splash/login
            let splashVC = SplashViewController()
            window?.rootViewController = splashVC
        }

        window?.makeKeyAndVisible()
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        // Reset badge count when app becomes active
        UIApplication.shared.applicationIconBadgeNumber = 0
    }
}
```

---

### File 3: AppConfig.swift

**Location:** `Models/AppConfig.swift`

```swift
import Foundation

struct AppConfig {

    // MARK: - Server URLs

    static let baseURL = "https://aiagent.ringlypro.com"
    static let apiURL = "\(baseURL)/api"

    // MARK: - Endpoints

    static let loginURL = "\(baseURL)/login"
    static let signupURL = "\(baseURL)/signup"
    static let dashboardURL = "\(baseURL)/"
    static let copilotURL = "\(baseURL)/mcp-copilot/"
    static let settingsURL = "\(baseURL)/settings"

    // MARK: - App Info

    static var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
    }

    static var buildNumber: String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
    }

    static var appName: String {
        Bundle.main.infoDictionary?["CFBundleDisplayName"] as? String ?? "RinglyPro"
    }

    // MARK: - User Defaults Keys

    static let authTokenKey = "com.ringlypro.authToken"
    static let userIDKey = "com.ringlypro.userID"
    static let clientIDKey = "com.ringlypro.clientID"
    static let deviceTokenKey = "com.ringlypro.deviceToken"
    static let biometricEnabledKey = "com.ringlypro.biometricEnabled"
}
```

---

### File 4: User.swift

**Location:** `Models/User.swift`

```swift
import Foundation

struct User: Codable {
    let id: Int
    let email: String
    let firstName: String?
    let lastName: String?
    let businessName: String?
    let clientId: Int?
    let tokensBalance: Int?

    enum CodingKeys: String, CodingKey {
        case id
        case email
        case firstName = "first_name"
        case lastName = "last_name"
        case businessName = "business_name"
        case clientId = "client_id"
        case tokensBalance = "tokens_balance"
    }

    var fullName: String {
        if let first = firstName, let last = lastName {
            return "\(first) \(last)"
        } else if let first = firstName {
            return first
        } else if let last = lastName {
            return last
        } else {
            return email
        }
    }
}
```

---

### File 5: AuthService.swift

**Location:** `Services/AuthService.swift`

```swift
import Foundation
import UIKit
import LocalAuthentication

class AuthService {

    static let shared = AuthService()

    private init() {}

    // MARK: - Properties

    var isLoggedIn: Bool {
        return authToken != nil
    }

    var authToken: String? {
        get {
            return UserDefaults.standard.string(forKey: AppConfig.authTokenKey)
        }
        set {
            UserDefaults.standard.set(newValue, forKey: AppConfig.authTokenKey)
        }
    }

    var userID: Int? {
        get {
            return UserDefaults.standard.integer(forKey: AppConfig.userIDKey)
        }
        set {
            UserDefaults.standard.set(newValue, forKey: AppConfig.userIDKey)
        }
    }

    var clientID: Int? {
        get {
            let value = UserDefaults.standard.integer(forKey: AppConfig.clientIDKey)
            return value == 0 ? nil : value
        }
        set {
            UserDefaults.standard.set(newValue, forKey: AppConfig.clientIDKey)
        }
    }

    // MARK: - Login/Logout

    func login(email: String, password: String, completion: @escaping (Result<User, Error>) -> Void) {
        // In a real app, make API call to login endpoint
        // For now, this is a placeholder

        let url = URL(string: "\(AppConfig.apiURL)/auth/login")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = [
            "email": email,
            "password": password
        ]

        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                DispatchQueue.main.async {
                    completion(.failure(error))
                }
                return
            }

            // Parse response (customize based on your API)
            guard let data = data else {
                DispatchQueue.main.async {
                    completion(.failure(NSError(domain: "AuthService", code: -1, userInfo: [NSLocalizedDescriptionKey: "No data received"])))
                }
                return
            }

            // Example response parsing
            // Adjust based on your actual API response structure
            do {
                let json = try JSONSerialization.jsonObject(with: data, options: []) as? [String: Any]
                if let token = json?["token"] as? String,
                   let userData = json?["user"] as? [String: Any] {

                    // Save auth token
                    self.authToken = token

                    // Parse user data
                    let userJSON = try JSONSerialization.data(withJSONObject: userData)
                    let user = try JSONDecoder().decode(User.self, from: userJSON)

                    self.userID = user.id
                    self.clientID = user.clientId

                    DispatchQueue.main.async {
                        completion(.success(user))
                    }
                } else {
                    throw NSError(domain: "AuthService", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid response format"])
                }
            } catch {
                DispatchQueue.main.async {
                    completion(.failure(error))
                }
            }
        }.resume()
    }

    func logout() {
        authToken = nil
        userID = nil
        clientID = nil

        // Clear cookies
        HTTPCookieStorage.shared.removeCookies(since: Date.distantPast)

        // Clear web view cache
        let dataStore = WKWebsiteDataStore.default()
        dataStore.fetchDataRecords(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes()) { records in
            dataStore.removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), for: records, completionHandler: {})
        }
    }

    // MARK: - Biometric Authentication

    func authenticateWithBiometrics(completion: @escaping (Bool, Error?) -> Void) {
        let context = LAContext()
        var error: NSError?

        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            completion(false, error)
            return
        }

        let reason = "Authenticate to access RinglyPro"

        context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason) { success, authError in
            DispatchQueue.main.async {
                completion(success, authError)
            }
        }
    }

    // MARK: - Device Token

    func updateDeviceToken(_ token: String) {
        UserDefaults.standard.set(token, forKey: AppConfig.deviceTokenKey)

        // Send to backend
        guard let authToken = self.authToken else { return }

        let url = URL(string: "\(AppConfig.apiURL)/device-token")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.addValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = ["deviceToken": token, "platform": "ios"]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        URLSession.shared.dataTask(with: request) { _, _, _ in
            print("Device token updated on server")
        }.resume()
    }
}

import WebKit
```

---

I have more files to create. Would you like me to continue with the remaining Swift files (ViewControllers, Extensions, etc.) and the Xcode project setup instructions?