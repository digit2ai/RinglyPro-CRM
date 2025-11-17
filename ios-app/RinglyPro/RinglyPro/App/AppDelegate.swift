import UIKit
import UserNotifications

@main
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        print("🔵 AppDelegate: didFinishLaunchingWithOptions called")

        // Create window with proper frame
        window = UIWindow(frame: UIScreen.main.bounds)
        window?.backgroundColor = .systemBackground
        window?.windowLevel = .normal
        print("🔵 AppDelegate: Window created with frame: \(window?.frame ?? .zero)")
        
        // Create and set splash view controller
        let splashVC = SplashViewController()
        print("🔵 AppDelegate: SplashViewController created")
        
        // Force view to load
        splashVC.loadViewIfNeeded()
        print("🔵 AppDelegate: SplashVC view loaded, background: \(String(describing: splashVC.view.backgroundColor))")
        
        window?.rootViewController = splashVC
        print("🔵 AppDelegate: Root VC set")
        
        window?.makeKeyAndVisible()
        
        // Force the window to display
        DispatchQueue.main.async {
            self.window?.rootViewController?.view.setNeedsLayout()
            self.window?.rootViewController?.view.layoutIfNeeded()
            print("🔵 AppDelegate: Forced layout update")
        }
        
        print("🔵 AppDelegate: Window made key and visible")
        print("🔵 AppDelegate: Window is key: \(self.window?.isKeyWindow ?? false)")
        print("🔵 AppDelegate: Window is hidden: \(self.window?.isHidden ?? true)")
        print("🔵 AppDelegate: Window alpha: \(self.window?.alpha ?? 0)")

        // Register for push notifications
        registerForPushNotifications()

        return true
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        print("🔵 AppDelegate: applicationDidBecomeActive called")
        window?.makeKeyAndVisible()
    }

    // MARK: - Push Notifications

    func registerForPushNotifications() {
        UNUserNotificationCenter.current().delegate = self
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, error in
            print("Push notification permission: \(granted)")

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

        AuthService.shared.updateDeviceToken(token)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("Failed to register for push: \(error.localizedDescription)")
    }

    // MARK: - URL Handling

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey : Any] = [:]) -> Bool {
        NotificationCenter.default.post(name: NSNotification.Name("DeepLinkReceived"), object: url)
        return true
    }
}

// MARK: - UNUserNotificationCenterDelegate

extension AppDelegate: UNUserNotificationCenterDelegate {

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .badge])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        let userInfo = response.notification.request.content.userInfo

        if let deepLink = userInfo["deepLink"] as? String, let url = URL(string: deepLink) {
            NotificationCenter.default.post(name: NSNotification.Name("DeepLinkReceived"), object: url)
        }

        completionHandler()
    }
}
