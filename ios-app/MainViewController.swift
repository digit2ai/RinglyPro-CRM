import UIKit
import WebKit

class MainViewController: UIViewController {

    // MARK: - Properties

    private var webView: WKWebView!
    private var progressView: UIProgressView!
    private var refreshControl: UIRefreshControl!

    private var currentURL: URL? {
        didSet {
            updateNavigationButtons()
        }
    }

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()

        setupNavigationBar()
        setupWebView()
        setupProgressView()
        setupRefreshControl()
        setupObservers()

        loadDashboard()
    }

    // MARK: - Setup

    private func setupNavigationBar() {
        title = "RinglyPro"

        // Back button
        let backButton = UIBarButtonItem(image: UIImage(systemName: "chevron.left"), style: .plain, target: self, action: #selector(goBack))
        backButton.tintColor = .white

        // Forward button
        let forwardButton = UIBarButtonItem(image: UIImage(systemName: "chevron.right"), style: .plain, target: self, action: #selector(goForward))
        forwardButton.tintColor = .white

        // Refresh button
        let refreshButton = UIBarButtonItem(image: UIImage(systemName: "arrow.clockwise"), style: .plain, target: self, action: #selector(reload))
        refreshButton.tintColor = .white

        navigationItem.leftBarButtonItems = [backButton, forwardButton]
        navigationItem.rightBarButtonItems = [refreshButton]

        // Settings button
        let settingsButton = UIBarButtonItem(image: UIImage(systemName: "gearshape"), style: .plain, target: self, action: #selector(openSettings))
        settingsButton.tintColor = .white
        navigationItem.rightBarButtonItems?.insert(settingsButton, at: 0)
    }

    private func setupWebView() {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []

        // Enable JavaScript
        let preferences = WKWebpagePreferences()
        preferences.allowsContentJavaScript = true
        configuration.defaultWebpagePreferences = preferences

        // Add message handler for JavaScript bridge
        let contentController = WKUserContentController()
        contentController.add(WebViewBridge.shared, name: "nativeApp")
        configuration.userContentController = contentController

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.scrollView.contentInsetAdjustmentBehavior = .never

        view.addSubview(webView)

        // Layout
        webView.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
    }

    private func setupProgressView() {
        progressView = UIProgressView(progressViewStyle: .bar)
        progressView.progressTintColor = UIColor.brandAccent
        progressView.trackTintColor = .clear

        view.addSubview(progressView)

        progressView.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            progressView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            progressView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            progressView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            progressView.heightAnchor.constraint(equalToConstant: 2)
        ])

        // Observe loading progress
        webView.addObserver(self, forKeyPath: #keyPath(WKWebView.estimatedProgress), options: .new, context: nil)
    }

    private func setupRefreshControl() {
        refreshControl = UIRefreshControl()
        refreshControl.tintColor = UIColor.brandPrimary
        refreshControl.addTarget(self, action: #selector(reload), for: .valueChanged)
        webView.scrollView.addSubview(refreshControl)
    }

    private func setupObservers() {
        // Listen for deep links
        NotificationCenter.default.addObserver(self, selector: #selector(handleDeepLink(_:)), name: NSNotification.Name("DeepLinkReceived"), object: nil)

        // Listen for network changes
        NotificationCenter.default.addObserver(self, selector: #selector(networkStatusChanged), name: NSNotification.Name("NetworkStatusChanged"), object: nil)
    }

    // MARK: - Navigation

    private func loadDashboard() {
        guard let clientID = AuthService.shared.clientID else {
            // No client ID, load main dashboard
            load(url: URL(string: AppConfig.dashboardURL)!)
            return
        }

        // Load with client ID
        let urlString = "\(AppConfig.dashboardURL)?client_id=\(clientID)"
        load(url: URL(string: urlString)!)
    }

    private func load(url: URL) {
        var request = URLRequest(url: url)

        // Add authentication header if available
        if let token = AuthService.shared.authToken {
            request.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        // Add cookies if available
        if let cookies = HTTPCookieStorage.shared.cookies(for: url) {
            let headers = HTTPCookie.requestHeaderFields(with: cookies)
            for (key, value) in headers {
                request.addValue(value, forHTTPHeaderField: key)
            }
        }

        webView.load(request)
        currentURL = url
    }

    @objc private func goBack() {
        if webView.canGoBack {
            webView.goBack()
        }
    }

    @objc private func goForward() {
        if webView.canGoForward {
            webView.goForward()
        }
    }

    @objc private func reload() {
        webView.reload()
    }

    @objc private func openSettings() {
        // Navigate to settings page
        if let url = URL(string: AppConfig.settingsURL) {
            load(url: url)
        }
    }

    private func updateNavigationButtons() {
        navigationItem.leftBarButtonItems?[0].isEnabled = webView.canGoBack
        navigationItem.leftBarButtonItems?[1].isEnabled = webView.canGoForward
    }

    // MARK: - Deep Links

    @objc private func handleDeepLink(_ notification: Notification) {
        guard let url = notification.object as? URL else { return }

        let scheme = url.scheme ?? ""
        let host = url.host ?? ""
        let path = url.path

        var targetURL: URL?

        if scheme == "ringlypro" {
            // Custom scheme: ringlypro://copilot
            switch host {
            case "login":
                targetURL = URL(string: AppConfig.loginURL)
            case "dashboard":
                targetURL = URL(string: AppConfig.dashboardURL)
            case "copilot":
                targetURL = URL(string: AppConfig.copilotURL)
            case "settings":
                targetURL = URL(string: AppConfig.settingsURL)
            default:
                targetURL = URL(string: AppConfig.dashboardURL)
            }
        } else if scheme == "https" && host.contains("ringlypro.com") {
            // Universal link: https://aiagent.ringlypro.com/path
            targetURL = url
        }

        if let finalURL = targetURL {
            load(url: finalURL)
        }
    }

    // MARK: - Network Status

    @objc private func networkStatusChanged() {
        // Show offline banner if no internet
        // Implementation depends on your preference
    }

    // MARK: - KVO

    override func observeValue(forKeyPath keyPath: String?, of object: Any?, change: [NSKeyValueChangeKey : Any]?, context: UnsafeMutableRawPointer?) {
        if keyPath == "estimatedProgress" {
            let progress = Float(webView.estimatedProgress)
            progressView.setProgress(progress, animated: true)

            if progress >= 1.0 {
                UIView.animate(withDuration: 0.3, delay: 0.2, options: .curveEaseOut, animations: {
                    self.progressView.alpha = 0
                }) { _ in
                    self.progressView.setProgress(0, animated: false)
                    self.progressView.alpha = 1
                }
            }
        }
    }

    // MARK: - Cleanup

    deinit {
        webView.removeObserver(self, forKeyPath: #keyPath(WKWebView.estimatedProgress))
        NotificationCenter.default.removeObserver(self)
    }
}

// MARK: - WKNavigationDelegate

extension MainViewController: WKNavigationDelegate {

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        refreshControl.endRefreshing()
        updateNavigationButtons()

        // Inject JavaScript bridge
        WebViewBridge.shared.injectBridge(into: webView)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        refreshControl.endRefreshing()
        showError(error)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }

        // Handle external links (open in Safari)
        if url.host != "aiagent.ringlypro.com" && url.scheme != "ringlypro" {
            if UIApplication.shared.canOpenURL(url) {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }
        }

        // Handle logout
        if url.path.contains("/logout") {
            handleLogout()
            decisionHandler(.cancel)
            return
        }

        decisionHandler(.allow)
    }

    private func handleLogout() {
        AuthService.shared.logout()

        // Navigate to splash/login
        let splashVC = SplashViewController()
        if let window = view.window {
            window.rootViewController = splashVC
            UIView.transition(with: window, duration: 0.3, options: .transitionCrossDissolve, animations: nil)
        }
    }

    private func showError(_ error: Error) {
        let alert = UIAlertController(title: "Error", message: error.localizedDescription, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        alert.addAction(UIAlertAction(title: "Retry", style: .default) { _ in
            self.reload()
        })
        present(alert, animated: true)
    }
}

// MARK: - WKUIDelegate

extension MainViewController: WKUIDelegate {

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in
            completionHandler()
        })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in
            completionHandler(false)
        })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in
            completionHandler(true)
        })
        present(alert, animated: true)
    }
}
