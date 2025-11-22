import WebKit
import UIKit

class WebViewBridge: NSObject, WKScriptMessageHandler {

    static let shared = WebViewBridge()

    override private init() {}

    // MARK: - WKScriptMessageHandler

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any] else { return }

        let action = body["action"] as? String ?? ""

        switch action {
        case "logout":
            handleLogout()
        case "openCamera":
            print("Camera requested from web")
        case "shareContent":
            if let content = body["content"] as? String {
                shareContent(content)
            }
        case "showToast":
            if let messageText = body["message"] as? String {
                showToast(message: messageText)
            }
        case "makeCall":
            if let phoneNumber = body["phoneNumber"] as? String {
                makeCall(phoneNumber: phoneNumber)
            }
        case "sendSMS":
            if let phoneNumber = body["phoneNumber"] as? String {
                sendSMS(phoneNumber: phoneNumber)
            }
        case "dialCode":
            if let code = body["code"] as? String {
                dialCode(code: code)
            }
        default:
            print("Unknown action: \(action)")
        }
    }

    // MARK: - JavaScript Bridge Injection

    func injectBridge(into webView: WKWebView) {
        let script = """
        window.nativeApp = {
            postMessage: function(data) {
                window.webkit.messageHandlers.nativeApp.postMessage(data);
            },
            logout: function() {
                this.postMessage({ action: 'logout' });
            },
            openCamera: function() {
                this.postMessage({ action: 'openCamera' });
            },
            share: function(content) {
                this.postMessage({ action: 'shareContent', content: content });
            },
            showToast: function(message) {
                this.postMessage({ action: 'showToast', message: message });
            },
            makeCall: function(phoneNumber) {
                this.postMessage({ action: 'makeCall', phoneNumber: phoneNumber });
            },
            sendSMS: function(phoneNumber) {
                this.postMessage({ action: 'sendSMS', phoneNumber: phoneNumber });
            },
            dialCode: function(code) {
                this.postMessage({ action: 'dialCode', code: code });
            },
            platform: 'ios',
            version: '\(AppConfig.appVersion)'
        };

        window.dispatchEvent(new Event('nativeAppReady'));
        """

        webView.evaluateJavaScript(script) { _, error in
            if let error = error {
                print("Error injecting bridge: \(error.localizedDescription)")
            } else {
                print("Native bridge injected successfully")
            }
        }
    }

    // MARK: - Actions

    private func handleLogout() {
        AuthService.shared.logout()
        NotificationCenter.default.post(name: NSNotification.Name("UserDidLogout"), object: nil)
    }

    private func shareContent(_ content: String) {
        guard let topVC = getTopViewController() else { return }

        let activityVC = UIActivityViewController(activityItems: [content], applicationActivities: nil)

        if let popover = activityVC.popoverPresentationController {
            popover.sourceView = topVC.view
            popover.sourceRect = CGRect(x: topVC.view.bounds.midX, y: topVC.view.bounds.midY, width: 0, height: 0)
            popover.permittedArrowDirections = []
        }

        topVC.present(activityVC, animated: true)
    }

    private func showToast(message: String) {
        guard let topVC = getTopViewController() else { return }

        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        topVC.present(alert, animated: true)

        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            alert.dismiss(animated: true)
        }
    }

    private func makeCall(phoneNumber: String) {
        guard let url = URL(string: "tel:\(phoneNumber)") else {
            print("Invalid phone number: \(phoneNumber)")
            return
        }

        UIApplication.shared.open(url, options: [:]) { success in
            if success {
                print("Successfully initiated call to: \(phoneNumber)")
            } else {
                print("Failed to initiate call to: \(phoneNumber)")
            }
        }
    }

    private func sendSMS(phoneNumber: String) {
        guard let url = URL(string: "sms:\(phoneNumber)") else {
            print("Invalid phone number: \(phoneNumber)")
            return
        }

        UIApplication.shared.open(url, options: [:]) { success in
            if success {
                print("Successfully opened SMS to: \(phoneNumber)")
            } else {
                print("Failed to open SMS to: \(phoneNumber)")
            }
        }
    }

    private func dialCode(code: String) {
        // Handle dial codes with special characters like * and #
        guard let url = URL(string: "tel:\(code)") else {
            print("Invalid dial code: \(code)")
            return
        }

        UIApplication.shared.open(url, options: [:]) { success in
            if success {
                print("Successfully initiated dial code: \(code)")
            } else {
                print("Failed to initiate dial code: \(code)")
            }
        }
    }

    // MARK: - Helpers

    private func getTopViewController() -> UIViewController? {
        guard let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let window = windowScene.windows.first(where: { $0.isKeyWindow }),
              let rootVC = window.rootViewController else {
            return nil
        }

        var topVC = rootVC
        while let presented = topVC.presentedViewController {
            topVC = presented
        }

        if let navController = topVC as? UINavigationController {
            return navController.visibleViewController
        }

        return topVC
    }
}
