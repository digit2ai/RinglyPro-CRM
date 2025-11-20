import UIKit
import WebKit

class MainViewController: UIViewController {

    // MARK: - Properties

    private var webView: WKWebView!
    private var progressView: UIProgressView!
    private var refreshControl: UIRefreshControl!

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        print("🔵 MainVC: viewDidLoad called")

        setupNavigationBar()
        setupWebView()
        setupProgressView()
        setupRefreshControl()
        setupObservers()

        loadDashboard()
        print("🔵 MainVC: viewDidLoad complete")
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        print("🔵 MainVC: viewWillAppear called")
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        print("🔵 MainVC: viewDidAppear called")
        print("🔵 MainVC: View frame: \(view.frame)")
    }

    // MARK: - Setup

    private func setupNavigationBar() {
        print("🔵 MainVC: setupNavigationBar called")
        title = "RinglyPro"

        navigationController?.navigationBar.prefersLargeTitles = false
        navigationController?.navigationBar.tintColor = .white

        // Back button
        let backButton = UIBarButtonItem(image: UIImage(systemName: "chevron.left"), style: .plain, target: self, action: #selector(goBack))

        // Forward button
        let forwardButton = UIBarButtonItem(image: UIImage(systemName: "chevron.right"), style: .plain, target: self, action: #selector(goForward))

        // Refresh button
        let refreshButton = UIBarButtonItem(barButtonSystemItem: .refresh, target: self, action: #selector(reload))

        navigationItem.leftBarButtonItems = [backButton, forwardButton]
        navigationItem.rightBarButtonItems = [refreshButton]
    }

    private func setupWebView() {
        print("🔵 MainVC: setupWebView called")
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []

        // JavaScript preferences
        let preferences = WKWebpagePreferences()
        preferences.allowsContentJavaScript = true
        configuration.defaultWebpagePreferences = preferences

        // Add message handler
        let contentController = WKUserContentController()
        contentController.add(WebViewBridge.shared, name: "nativeApp")
        configuration.userContentController = contentController

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never

        view.addSubview(webView)
        print("🔵 MainVC: WebView added to view")

        // Layout
        webView.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        print("🔵 MainVC: WebView constraints activated")
    }

    private func setupProgressView() {
        print("🔵 MainVC: setupProgressView called")
        progressView = UIProgressView(progressViewStyle: .bar)
        progressView.progressTintColor = .systemBlue
        progressView.trackTintColor = .clear

        view.addSubview(progressView)

        progressView.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            progressView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            progressView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            progressView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            progressView.heightAnchor.constraint(equalToConstant: 3)
        ])

        // Observe progress
        webView.addObserver(self, forKeyPath: #keyPath(WKWebView.estimatedProgress), options: .new, context: nil)
    }

    private func setupRefreshControl() {
        print("🔵 MainVC: setupRefreshControl called")
        refreshControl = UIRefreshControl()
        refreshControl.tintColor = .systemBlue
        refreshControl.addTarget(self, action: #selector(reload), for: .valueChanged)
        webView.scrollView.addSubview(refreshControl)
    }

    private func setupObservers() {
        print("🔵 MainVC: setupObservers called")
        NotificationCenter.default.addObserver(self, selector: #selector(handleLogout), name: NSNotification.Name("UserDidLogout"), object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(handleDeepLink(_:)), name: NSNotification.Name("DeepLinkReceived"), object: nil)
    }

    // MARK: - Navigation

    private func loadDashboard() {
        print("🔵 MainVC: loadDashboard called")
        let urlString = AppConfig.dashboardURL
        print("🔵 MainVC: Loading URL: \(urlString)")
        
        guard let url = URL(string: urlString) else {
            print("🔴 MainVC: ERROR - Invalid URL: \(urlString)")
            return
        }

        var request = URLRequest(url: url)
        request.cachePolicy = .returnCacheDataElseLoad

        webView.load(request)
        print("🔵 MainVC: WebView load request sent")
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

    private func updateNavigationButtons() {
        navigationItem.leftBarButtonItems?[0].isEnabled = webView.canGoBack
        navigationItem.leftBarButtonItems?[1].isEnabled = webView.canGoForward
    }

    // MARK: - Deep Links

    @objc private func handleDeepLink(_ notification: Notification) {
        guard let url = notification.object as? URL else { return }

        let scheme = url.scheme ?? ""
        let host = url.host ?? ""

        var targetURL: URL?

        if scheme == "ringlypro" {
            switch host {
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
            targetURL = url
        }

        if let finalURL = targetURL {
            webView.load(URLRequest(url: finalURL))
        }
    }

    @objc private func handleLogout() {
        if let window = view.window {
            let splashVC = SplashViewController()
            window.rootViewController = splashVC
            UIView.transition(with: window, duration: 0.3, options: .transitionCrossDissolve, animations: nil)
        }
    }

    // MARK: - KVO

    override func observeValue(forKeyPath keyPath: String?, of object: Any?, change: [NSKeyValueChangeKey : Any]?, context: UnsafeMutableRawPointer?) {
        if keyPath == "estimatedProgress" {
            let progress = Float(webView.estimatedProgress)
            progressView.setProgress(progress, animated: true)

            if progress >= 1.0 {
                UIView.animate(withDuration: 0.3, delay: 0.3, options: .curveEaseOut, animations: {
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

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        print("🔵 MainVC: WebView started loading")
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        print("🔵 MainVC: WebView finished loading")
        refreshControl.endRefreshing()
        updateNavigationButtons()

        // Inject JavaScript bridge
        WebViewBridge.shared.injectBridge(into: webView)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        print("🔴 MainVC: WebView failed with error: \(error.localizedDescription)")
        refreshControl.endRefreshing()
        showError(error)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }

        print("🔵 MainVC: Navigation to: \(url.absoluteString)")

        // Whitelist domains that should load within WebView
        let allowedDomains = [
            "ringlypro.com",
            "js.stripe.com",           // Stripe payment library
            "checkout.stripe.com",     // Stripe checkout pages
            "api.stripe.com",          // Stripe API
            "m.stripe.network",        // Stripe CDN
            "m.stripe.com"             // Stripe mobile
        ]

        // Handle external links - only open in Safari if NOT in whitelist
        if let host = url.host {
            let isAllowed = allowedDomains.contains { host.contains($0) }

            if !isAllowed {
                // Open in Safari for non-whitelisted domains
                if UIApplication.shared.canOpenURL(url) {
                    UIApplication.shared.open(url)
                    decisionHandler(.cancel)
                    return
                }
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

