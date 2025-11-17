import UIKit

class SplashViewController: UIViewController {

    private let logoLabel = UILabel()
    private let titleLabel = UILabel()
    private let subtitleLabel = UILabel()
    private let activityIndicator = UIActivityIndicatorView(style: .large)

    override func viewDidLoad() {
        super.viewDidLoad()
        print("🔵 SplashVC: viewDidLoad called")

        setupUI()
        loadApp()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        print("🔵 SplashVC: viewWillAppear called")
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        print("🔵 SplashVC: viewDidAppear called")
        print("🔵 SplashVC: View frame: \(view.frame)")
        print("🔵 SplashVC: View backgroundColor: \(String(describing: view.backgroundColor))")
    }

    private func setupUI() {
        print("🔵 SplashVC: setupUI called")
        
        view.backgroundColor = UIColor(red: 79/255, green: 70/255, blue: 229/255, alpha: 1.0)
        print("🔵 SplashVC: Background color set to purple")

        // Logo (text-based for now)
        logoLabel.text = "📞"
        logoLabel.font = UIFont.systemFont(ofSize: 80)
        logoLabel.textAlignment = .center
        logoLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(logoLabel)
        print("🔵 SplashVC: Logo label added")

        // Title
        titleLabel.text = "RinglyPro"
        titleLabel.textColor = .white
        titleLabel.font = UIFont.systemFont(ofSize: 42, weight: .bold)
        titleLabel.textAlignment = .center
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(titleLabel)
        print("🔵 SplashVC: Title label added")

        // Subtitle
        subtitleLabel.text = "AI-Powered Business Management"
        subtitleLabel.textColor = UIColor.white.withAlphaComponent(0.8)
        subtitleLabel.font = UIFont.systemFont(ofSize: 16, weight: .medium)
        subtitleLabel.textAlignment = .center
        subtitleLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(subtitleLabel)
        print("🔵 SplashVC: Subtitle label added")

        // Activity indicator
        activityIndicator.color = .white
        activityIndicator.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(activityIndicator)
        print("🔵 SplashVC: Activity indicator added")

        NSLayoutConstraint.activate([
            logoLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            logoLabel.centerYAnchor.constraint(equalTo: view.centerYAnchor, constant: -80),

            titleLabel.topAnchor.constraint(equalTo: logoLabel.bottomAnchor, constant: 20),
            titleLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),

            subtitleLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 10),
            subtitleLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),

            activityIndicator.topAnchor.constraint(equalTo: subtitleLabel.bottomAnchor, constant: 50),
            activityIndicator.centerXAnchor.constraint(equalTo: view.centerXAnchor)
        ])
        print("🔵 SplashVC: Constraints activated")
    }

    private func loadApp() {
        print("🔵 SplashVC: loadApp called")
        activityIndicator.startAnimating()
        print("🔵 SplashVC: Activity indicator started")

        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            print("🔵 SplashVC: Timer fired, navigating to main")
            self.activityIndicator.stopAnimating()
            self.navigateToMain()
        }
    }

    private func navigateToMain() {
        print("🔵 SplashVC: navigateToMain called")
        
        let mainVC = MainViewController()
        print("🔵 SplashVC: MainViewController created")
        
        // Force mainVC view to load
        mainVC.loadViewIfNeeded()
        print("🔵 SplashVC: MainViewController view loaded")
        
        let navController = UINavigationController(rootViewController: mainVC)
        print("🔵 SplashVC: NavigationController created")

        // Configure nav bar
        let appearance = UINavigationBarAppearance()
        appearance.configureWithOpaqueBackground()
        appearance.backgroundColor = UIColor(red: 79/255, green: 70/255, blue: 229/255, alpha: 1.0)
        appearance.titleTextAttributes = [.foregroundColor: UIColor.white]
        appearance.largeTitleTextAttributes = [.foregroundColor: UIColor.white]

        navController.navigationBar.standardAppearance = appearance
        navController.navigationBar.scrollEdgeAppearance = appearance
        navController.navigationBar.compactAppearance = appearance
        navController.navigationBar.tintColor = .white
        print("🔵 SplashVC: Nav bar configured")

        // Get window from AppDelegate
        if let appDelegate = UIApplication.shared.delegate as? AppDelegate,
           let window = appDelegate.window {
            print("🔵 SplashVC: Got window from AppDelegate")
            window.rootViewController = navController
            UIView.transition(with: window, duration: 0.3, options: .transitionCrossDissolve, animations: {
                // Animation block
            }, completion: { _ in
                print("🔵 SplashVC: Transition animation complete")
            })
        } else {
            print("🔴 SplashVC: ERROR - Could not get window from AppDelegate!")
        }
    }
}
