import Foundation
import UIKit
import LocalAuthentication
import WebKit

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
            let value = UserDefaults.standard.integer(forKey: AppConfig.userIDKey)
            return value == 0 ? nil : value
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

    // MARK: - Authentication

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
