import UIKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        print("🔵 SceneDelegate: scene willConnectTo called")
        
        guard let windowScene = (scene as? UIWindowScene) else {
            print("🔴 SceneDelegate: Failed to cast scene as UIWindowScene")
            return
        }
        
        print("🔵 SceneDelegate: WindowScene obtained")

        window = UIWindow(windowScene: windowScene)
        print("🔵 SceneDelegate: Window created")

        // Show splash screen
        let splashVC = SplashViewController()
        print("🔵 SceneDelegate: SplashViewController created")
        
        window?.rootViewController = splashVC
        print("🔵 SceneDelegate: Root VC set")
        
        window?.makeKeyAndVisible()
        print("🔵 SceneDelegate: Window made key and visible")
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        print("🔵 SceneDelegate: sceneDidBecomeActive called")
        UIApplication.shared.applicationIconBadgeNumber = 0
    }
}
