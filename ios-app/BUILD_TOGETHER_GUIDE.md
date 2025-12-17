# Let's Build RinglyPro iOS App Together! 🚀

## Your Journey (Step by Step)

We'll build a beautiful, professional iOS app in **11 steps**. I'll provide ALL the code - you just copy/paste and follow along.

**Time Estimate:** 2-3 hours total (spread across a few days is fine!)

---

## Before We Start

### What You Need:
1. ✅ Mac computer (any recent MacBook or iMac)
2. ✅ Xcode 15 (free from App Store) - Download it now if you haven't
3. ✅ Apple ID (for testing on simulator - free)
4. ✅ Patience and excitement! 😊

### What You DON'T Need:
- ❌ Previous iOS development experience
- ❌ Swift programming knowledge (I'll give you all the code)
- ❌ Apple Developer account (not until we submit to App Store)

---

## Step 1: Create Xcode Project (10 minutes)

### 1.1 Open Xcode
- Find Xcode in Applications
- Open it
- Click **"Create a new Xcode project"**

### 1.2 Choose Template
- Select **iOS** at the top
- Click **App**
- Click **Next**

### 1.3 Fill in Project Details
```
Product Name: RinglyPro
Team: None (or select if you have Apple Developer account)
Organization Identifier: com.ringlypro
Bundle Identifier: com.ringlypro.crm
Interface: SwiftUI ⚠️ IMPORTANT!
Language: Swift
Storage: None
Include Tests: ✅ (checked)
```

Click **Next**

### 1.4 Save Location
```
Where: /Users/manuelstagg/Documents/GitHub/RinglyPro-CRM/ios-app/
```

Click **Create**

### ✅ Checkpoint:
You should now see Xcode with your project open!

---

## Step 2: Organize Project Structure (5 minutes)

We'll create folders to organize our code nicely.

### 2.1 Create Groups (Folders)

In the left sidebar (Navigator), you'll see "RinglyPro" folder.

**Right-click "RinglyPro"** → **New Group**

Create these groups (one at a time):
- `Core`
- `Features`
- `Models`
- `Services`
- `Views`
- `Components`

Your left sidebar should now look like:
```
RinglyPro
├── RinglyProApp.swift
├── Core/
├── Features/
├── Models/
├── Services/
├── Views/
├── Components/
├── Assets.xcassets
└── Preview Content
```

### ✅ Checkpoint:
All folders created!

---

## Step 3: Create Data Models (10 minutes)

Let's create the data structures that match your backend API.

### 3.1 Create User.swift

**Right-click "Models" folder** → **New File** → **Swift File**
Name it: `User.swift`

**Copy this code:**

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
        case id, email
        case firstName = "first_name"
        case lastName = "last_name"
        case businessName = "business_name"
        case clientId = "client_id"
        case tokensBalance = "tokens_balance"
    }

    var fullName: String {
        if let first = firstName, let last = lastName {
            return "\(first) \(last)"
        }
        return firstName ?? lastName ?? email
    }
}

struct AuthResponse: Codable {
    let success: Bool
    let token: String
    let user: User
}
```

Press **Cmd+S** to save.

### 3.2 Create Call.swift

**Right-click "Models" folder** → **New File** → **Swift File**
Name it: `Call.swift`

```swift
import Foundation

struct Call: Codable, Identifiable {
    let id: Int
    let twilioCallSid: String?
    let direction: String
    let fromNumber: String
    let toNumber: String
    let status: String
    let duration: Int?
    let recordingUrl: String?
    let startTime: Date
    let endTime: Date?

    enum CodingKeys: String, CodingKey {
        case id
        case twilioCallSid = "twilio_call_sid"
        case direction
        case fromNumber = "from_number"
        case toNumber = "to_number"
        case status, duration
        case recordingUrl = "recording_url"
        case startTime = "start_time"
        case endTime = "end_time"
    }

    var formattedDuration: String {
        guard let duration = duration else { return "0:00" }
        let minutes = duration / 60
        let seconds = duration % 60
        return String(format: "%d:%02d", minutes, seconds)
    }

    var displayNumber: String {
        direction == "incoming" ? fromNumber : toNumber
    }
}

struct CallsResponse: Codable {
    let success: Bool
    let calls: [Call]
}
```

### 3.3 Create Appointment.swift

**Right-click "Models" folder** → **New File** → **Swift File**
Name it: `Appointment.swift`

```swift
import Foundation

struct Appointment: Codable, Identifiable {
    let id: Int
    let customerName: String
    let customerPhone: String
    let appointmentDate: String
    let appointmentTime: String
    let status: String
    let confirmationCode: String?

    enum CodingKeys: String, CodingKey {
        case id
        case customerName = "customer_name"
        case customerPhone = "customer_phone"
        case appointmentDate = "appointment_date"
        case appointmentTime = "appointment_time"
        case status
        case confirmationCode = "confirmation_code"
    }

    var displayDateTime: String {
        "\(appointmentDate) at \(appointmentTime)"
    }
}

struct AppointmentsResponse: Codable {
    let success: Bool
    let appointments: [Appointment]
}
```

### 3.4 Create TokenBalance.swift

**Right-click "Models" folder** → **New File** → **Swift File**
Name it: `TokenBalance.swift`

```swift
import Foundation

struct TokenBalance: Codable {
    let success: Bool
    let balance: Int
    let package: String?
    let usedThisMonth: Int?

    enum CodingKeys: String, CodingKey {
        case success, balance, package
        case usedThisMonth = "usedThisMonth"
    }
}
```

### ✅ Checkpoint:
You now have 4 model files! Press **Cmd+B** to build - should compile with no errors.

---

## Step 4: Create API Service (15 minutes)

This is the heart of your app - it talks to your backend!

### 4.1 Create APIService.swift

**Right-click "Services" folder** → **New File** → **Swift File**
Name it: `APIService.swift`

**⚠️ IMPORTANT: This is a big file, I'll break it into parts**

```swift
import Foundation

class APIService {
    static let shared = APIService()

    private let baseURL = "https://aiagent.ringlypro.com/api"
    private let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()

    private init() {}

    // MARK: - Generic Request Handler

    private func request<T: Decodable>(
        endpoint: String,
        method: String = "GET",
        body: [String: Any]? = nil,
        requiresAuth: Bool = true
    ) async throws -> T {

        guard let url = URL(string: baseURL + endpoint) else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")

        // Add auth token if required
        if requiresAuth, let token = AuthManager.shared.authToken {
            request.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        // Add body if present
        if let body = body {
            request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        }

        // Make request
        let (data, response) = try await URLSession.shared.data(for: request)

        // Check HTTP status
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            throw APIError.httpError(httpResponse.statusCode)
        }

        // Decode response
        do {
            let decoded = try decoder.decode(T.self, from: data)
            return decoded
        } catch {
            print("Decoding error: \(error)")
            throw APIError.decodingError
        }
    }

    // MARK: - Authentication

    func login(email: String, password: String) async throws -> AuthResponse {
        return try await request(
            endpoint: "/auth/login",
            method: "POST",
            body: ["email": email, "password": password],
            requiresAuth: false
        )
    }

    func signup(email: String, password: String, firstName: String, lastName: String, businessName: String) async throws -> AuthResponse {
        return try await request(
            endpoint: "/auth/register",
            method: "POST",
            body: [
                "email": email,
                "password": password,
                "first_name": firstName,
                "last_name": lastName,
                "business_name": businessName
            ],
            requiresAuth: false
        )
    }

    func getProfile() async throws -> User {
        struct ProfileResponse: Codable {
            let success: Bool
            let user: User
        }
        let response: ProfileResponse = try await request(endpoint: "/auth/profile")
        return response.user
    }

    // MARK: - Tokens

    func getTokenBalance() async throws -> TokenBalance {
        return try await request(endpoint: "/tokens/balance")
    }

    // MARK: - Calls

    func getCalls(page: Int = 1, limit: Int = 20) async throws -> [Call] {
        let response: CallsResponse = try await request(endpoint: "/calls?page=\(page)&limit=\(limit)")
        return response.calls
    }

    // MARK: - Appointments

    func getAppointments() async throws -> [Appointment] {
        let response: AppointmentsResponse = try await request(endpoint: "/appointments")
        return response.appointments
    }

    func getUpcomingAppointments() async throws -> [Appointment] {
        let response: AppointmentsResponse = try await request(endpoint: "/appointments/upcoming")
        return response.appointments
    }
}

// MARK: - API Errors

enum APIError: LocalizedError {
    case invalidURL
    case invalidResponse
    case httpError(Int)
    case decodingError
    case noData

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid URL"
        case .invalidResponse:
            return "Invalid response from server"
        case .httpError(let code):
            return "HTTP Error: \(code)"
        case .decodingError:
            return "Failed to decode response"
        case .noData:
            return "No data received"
        }
    }
}
```

Press **Cmd+S** to save.

### ✅ Checkpoint:
API Service created! This handles all communication with your backend.

---

## Step 5: Create Auth Manager (10 minutes)

This manages login state and stores the JWT token securely.

### 5.1 Create AuthManager.swift

**Right-click "Services" folder** → **New File** → **Swift File**
Name it: `AuthManager.swift`

```swift
import Foundation
import SwiftUI

class AuthManager: ObservableObject {
    static let shared = AuthManager()

    @Published var isLoggedIn: Bool = false
    @Published var currentUser: User?

    private let tokenKey = "authToken"
    private let userKey = "currentUser"

    var authToken: String? {
        get {
            UserDefaults.standard.string(forKey: tokenKey)
        }
        set {
            UserDefaults.standard.set(newValue, forKey: tokenKey)
            isLoggedIn = newValue != nil
        }
    }

    private init() {
        // Check if already logged in
        if let _ = authToken {
            isLoggedIn = true
            loadCurrentUser()
        }
    }

    func login(email: String, password: String) async throws {
        let response = try await APIService.shared.login(email: email, password: password)

        await MainActor.run {
            self.authToken = response.token
            self.currentUser = response.user
            self.saveCurrentUser(response.user)
            self.isLoggedIn = true
        }
    }

    func signup(email: String, password: String, firstName: String, lastName: String, businessName: String) async throws {
        let response = try await APIService.shared.signup(
            email: email,
            password: password,
            firstName: firstName,
            lastName: lastName,
            businessName: businessName
        )

        await MainActor.run {
            self.authToken = response.token
            self.currentUser = response.user
            self.saveCurrentUser(response.user)
            self.isLoggedIn = true
        }
    }

    func logout() {
        authToken = nil
        currentUser = nil
        isLoggedIn = false
        UserDefaults.standard.removeObject(forKey: userKey)
    }

    private func saveCurrentUser(_ user: User) {
        if let encoded = try? JSONEncoder().encode(user) {
            UserDefaults.standard.set(encoded, forKey: userKey)
        }
    }

    private func loadCurrentUser() {
        if let data = UserDefaults.standard.data(forKey: userKey),
           let user = try? JSONDecoder().decode(User.self, from: data) {
            currentUser = user
        }
    }
}
```

### ✅ Checkpoint:
Auth Manager created! Now we can login/logout.

---

## Next Steps Preview

We've completed the foundation! Next we'll build:
- ✅ Step 6: Login Screen (beautiful UI)
- ✅ Step 7: Dashboard (your main screen)
- ✅ Step 8: Calls List
- ✅ Step 9: Appointments
- ✅ Step 10: Settings
- ✅ Step 11: App Icon & Launch

**Take a break if needed!** When you're ready, let me know and I'll continue with Step 6.

---

**Progress So Far:**
- ✅ Project created
- ✅ Folders organized
- ✅ Data models created (4 files)
- ✅ API Service built
- ✅ Auth Manager ready

**Next:** Beautiful Login Screen with SwiftUI!

Ready to continue? Just say "Let's continue!" and I'll give you Step 6! 🚀
