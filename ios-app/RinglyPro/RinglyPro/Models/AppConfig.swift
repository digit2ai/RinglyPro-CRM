import Foundation

struct AppConfig {

    // MARK: - Server URLs

    static let baseURL = "https://aiagent.ringlypro.com"
    static let apiURL = "\(baseURL)/api"

    // MARK: - Page URLs

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

    // MARK: - UserDefaults Keys

    static let authTokenKey = "com.ringlypro.authToken"
    static let userIDKey = "com.ringlypro.userID"
    static let clientIDKey = "com.ringlypro.clientID"
    static let deviceTokenKey = "com.ringlypro.deviceToken"
    static let biometricEnabledKey = "com.ringlypro.biometricEnabled"
}
