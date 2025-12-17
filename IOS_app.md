# Build RinglyPro iOS App - Step by Step

## Overview

We'll build this together in **11 easy steps**. I'll provide ALL the code - you just follow along!

**Time:** 2-3 hours (can spread over multiple days)
**Difficulty:** Beginner-friendly
**Cost:** Free to build and test (only $99/year when submitting to App Store)

---

## ✅ Before We Start

**You need:**
- Mac computer
- Xcode 15 (download from Mac App Store - it's free)
- Your existing RinglyPro backend (already working!)

**You DON'T need:**
- Previous iOS experience
- Swift knowledge
- Apple Developer account (not yet)

---

## Step 1: Install Xcode (If Not Already)

### 1.1 Open Mac App Store
Search for **"Xcode"**

### 1.2 Download Xcode
Click **Get** or **Download**
(It's about 7GB - might take 30-60 minutes)

### 1.3 Open Xcode
After installation, open Xcode from Applications

### 1.4 Install Additional Components
Xcode might ask to install additional components - click **Install**

### ✅ Checkpoint:
Xcode is installed and running!

---

## Step 2: Create New Xcode Project (5 minutes)

### 2.1 Create Project
1. In Xcode, click **"Create New Project"**
2. Or: **File → New → Project**

### 2.2 Choose Template
1. At the top, select **iOS**
2. Select **App** template
3. Click **Next**

### 2.3 Configure Project
Fill in these details EXACTLY:

```
Product Name: RinglyPro
Team: None (leave blank for now)
Organization Identifier: com.ringlypro
Bundle Identifier: com.ringlypro.crm (should auto-fill)
Interface: SwiftUI ⚠️ VERY IMPORTANT - select SwiftUI!
Language: Swift
Storage: None
Include Tests: ✅ (checked)
```

Click **Next**

### 2.4 Choose Save Location
```
Save in: /Users/manuelstagg/Documents/RinglyPro-iOS-App/
```

Click **Create**

### ✅ Checkpoint:
You should see Xcode with your project open! On the left, you'll see files like "RinglyProApp.swift"

---

## Step 3: Test the Default App (2 minutes)

Let's make sure everything works before we add our code.

### 3.1 Select Simulator
At the top of Xcode, you'll see a device selector.
Click it and choose: **iPhone 15 Pro**

### 3.2 Run the App
Click the **Play ▶️** button (or press **Cmd+R**)

Wait for it to build... (20-30 seconds)

### ✅ Checkpoint:
The iOS Simulator should open showing a basic "Hello, World!" screen.

**Success!** Now let's build your real app!

---

## Step 4: Organize Project (5 minutes)

Let's organize our code into folders.

### 4.1 Create Groups

In the **left sidebar** (Navigator), you'll see:
```
RinglyPro
├── RinglyProApp.swift
├── ContentView.swift
├── Assets.xcassets
└── Preview Content
```

We'll add folders (called "Groups" in Xcode):

**Right-click on "RinglyPro"** → **New Group**

Create these groups (one by one):
1. `Models` (for data structures)
2. `Services` (for API calls)
3. `Views` (for screens)
4. `ViewModels` (for logic)

### 4.2 Move Existing Files

Drag `ContentView.swift` into the `Views` folder

Your structure should now look like:
```
RinglyPro
├── RinglyProApp.swift
├── Models/
├── Services/
├── Views/
│   └── ContentView.swift
├── ViewModels/
├── Assets.xcassets
└── Preview Content
```

### ✅ Checkpoint:
Project organized! Press **Cmd+B** to build - should succeed.

---

## Step 5: Create Data Models (15 minutes)

Now we'll create Swift files that match your backend API responses.

### 5.1 Create User.swift

1. **Right-click "Models" folder**
2. **New File...**
3. Choose **Swift File**
4. Name it: `User`
5. Click **Create**

Now **copy this entire code** into the file:

```swift
import Foundation

// User model matching your backend
struct User: Codable, Identifiable {
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

    var displayName: String {
        if let first = firstName, let last = lastName {
            return "\(first) \(last)"
        }
        return firstName ?? lastName ?? email
    }
}

// Login response from /api/auth/login
struct AuthResponse: Codable {
    let success: Bool
    let token: String
    let user: User
}
```

**Press Cmd+S to save**

### 5.2 Create Call.swift

Same process:
1. Right-click "Models"
2. New File → Swift File
3. Name: `Call`
4. Copy this code:

```swift
import Foundation

struct Call: Codable, Identifiable {
    let id: Int
    let direction: String
    let fromNumber: String
    let toNumber: String
    let status: String
    let duration: Int?
    let startTime: String

    enum CodingKeys: String, CodingKey {
        case id, direction, status, duration
        case fromNumber = "from_number"
        case toNumber = "to_number"
        case startTime = "start_time"
    }

    var displayNumber: String {
        direction == "incoming" ? fromNumber : toNumber
    }

    var formattedDuration: String {
        guard let dur = duration else { return "0:00" }
        let minutes = dur / 60
        let seconds = dur % 60
        return String(format: "%d:%02d", minutes, seconds)
    }

    var directionIcon: String {
        direction == "incoming" ? "arrow.down.left" : "arrow.up.right"
    }
}

struct CallsResponse: Codable {
    let success: Bool
    let calls: [Call]
}
```

**Save (Cmd+S)**

### 5.3 Create Appointment.swift

1. Right-click "Models"
2. New File → Swift File
3. Name: `Appointment`
4. Copy this:

```swift
import Foundation

struct Appointment: Codable, Identifiable {
    let id: Int
    let customerName: String
    let customerPhone: String
    let appointmentDate: String
    let appointmentTime: String
    let status: String

    enum CodingKeys: String, CodingKey {
        case id, status
        case customerName = "customer_name"
        case customerPhone = "customer_phone"
        case appointmentDate = "appointment_date"
        case appointmentTime = "appointment_time"
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

**Save**

### 5.4 Create DashboardStats.swift

1. Right-click "Models"
2. New File → Swift File
3. Name: `DashboardStats`
4. Copy this:

```swift
import Foundation

struct DashboardStats: Codable {
    let tokensBalance: Int
    let callsToday: Int
    let upcomingAppointments: Int
    let unreadMessages: Int

    enum CodingKeys: String, CodingKey {
        case tokensBalance = "tokens_balance"
        case callsToday = "calls_today"
        case upcomingAppointments = "upcoming_appointments"
        case unreadMessages = "unread_messages"
    }
}

struct TokenBalance: Codable {
    let success: Bool
    let balance: Int
}
```

**Save**

### ✅ Checkpoint:
Press **Cmd+B** to build. Should compile with no errors!
You now have 4 model files in the Models folder.

---

## Step 6: Create API Service (20 minutes)

This is the heart - it talks to your backend!

### 6.1 Create APIService.swift

1. Right-click "Services"
2. New File → Swift File
3. Name: `APIService`
4. Copy this complete code:

```swift
import Foundation

class APIService {
    static let shared = APIService()

    // Your backend URL
    private let baseURL = "https://aiagent.ringlypro.com/api"

    private init() {}

    // MARK: - Generic Request

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
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        // Add auth token if needed
        if requiresAuth, let token = KeychainHelper.getToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        // Add body
        if let body = body {
            request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        }

        // Make request
        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            throw APIError.httpError(httpResponse.statusCode)
        }

        // Decode
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            print("Decode error: \(error)")
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

    func getProfile() async throws -> User {
        struct ProfileResponse: Codable {
            let user: User
        }
        let response: ProfileResponse = try await request(endpoint: "/auth/profile")
        return response.user
    }

    // MARK: - Dashboard

    func getTokenBalance() async throws -> TokenBalance {
        return try await request(endpoint: "/tokens/balance")
    }

    // MARK: - Calls

    func getCalls() async throws -> [Call] {
        let response: CallsResponse = try await request(endpoint: "/calls?limit=20")
        return response.calls
    }

    // MARK: - Appointments

    func getUpcomingAppointments() async throws -> [Appointment] {
        let response: AppointmentsResponse = try await request(endpoint: "/appointments/upcoming")
        return response.appointments
    }
}

// MARK: - Errors

enum APIError: LocalizedError {
    case invalidURL
    case invalidResponse
    case httpError(Int)
    case decodingError

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid URL"
        case .invalidResponse: return "Invalid response"
        case .httpError(let code): return "Error: \(code)"
        case .decodingError: return "Could not decode response"
        }
    }
}
```

**Save**

### 6.2 Create KeychainHelper.swift

This stores the JWT token securely.

1. Right-click "Services"
2. New File → Swift File
3. Name: `KeychainHelper`
4. Copy:

```swift
import Foundation
import Security

class KeychainHelper {
    static let tokenKey = "authToken"

    static func saveToken(_ token: String) {
        let data = Data(token.utf8)

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: tokenKey,
            kSecValueData as String: data
        ]

        // Delete old token
        SecItemDelete(query as CFDictionary)

        // Add new token
        SecItemAdd(query as CFDictionary, nil)
    }

    static func getToken() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: tokenKey,
            kSecReturnData as String: true
        ]

        var result: AnyObject?
        SecItemCopyMatching(query as CFDictionary, &result)

        guard let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func deleteToken() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: tokenKey
        ]
        SecItemDelete(query as CFDictionary)
    }
}
```

**Save**

### ✅ Checkpoint:
Build (Cmd+B) - should compile successfully!
You now have a complete API service!

---

## Next: Building the UI!

We've completed the backend integration. Next steps:

- ✅ Step 7: Login Screen (beautiful UI)
- ✅ Step 8: Dashboard
- ✅ Step 9: Calls List
- ✅ Step 10: Settings
- ✅ Step 11: App Icon & Launch

**Take a break if needed!** This is great progress.

When ready, let me know and I'll continue with the UI screens! 🎨

---

**Progress:**
- ✅ Xcode project created
- ✅ Folders organized
- ✅ Data models (4 files)
- ✅ API Service ready
- ✅ Keychain helper for secure storage

**Next:** Beautiful Login Screen!
