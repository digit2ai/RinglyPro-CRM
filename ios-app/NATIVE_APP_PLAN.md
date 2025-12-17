# RinglyPro Native Mobile App - Architecture Plan

## Overview

Build a **native mobile UI** for iOS (and later Android) that connects to your existing backend APIs at `https://aiagent.ringlypro.com`.

### Key Principles:
- ✅ Native UI/UX (SwiftUI for iOS, Jetpack Compose for Android)
- ✅ Shared backend APIs (no changes needed)
- ✅ Light and fast
- ✅ Easy for SaaS clients to use
- ✅ Offline-first with sync
- ✅ Push notifications for calls/messages

---

## Architecture

```
┌─────────────────────────────────────┐
│       Mobile Apps (Native UI)       │
│  ┌───────────┐    ┌──────────────┐ │
│  │  iOS App  │    │ Android App  │ │
│  │ (SwiftUI) │    │(Jetpack Comp)│ │
│  └─────┬─────┘    └──────┬───────┘ │
│        │                 │          │
└────────┼─────────────────┼──────────┘
         │                 │
         └────────┬────────┘
                  │
         ┌────────▼─────────┐
         │   REST APIs      │
         │  (Existing)      │
         └──────────────────┘
                  │
    ┌─────────────┼──────────────┐
    ▼             ▼              ▼
┌────────┐  ┌──────────┐  ┌─────────┐
│Database│  │  Twilio  │  │SendGrid │
└────────┘  └──────────┘  └─────────┘
```

---

## Mobile App Screens

### 1. Authentication
- **Login Screen** → POST /api/auth/login
- **Signup Screen** → POST /api/auth/register
- **Forgot Password** → POST /api/auth/forgot-password
- **Biometric Auth** (Face ID/Touch ID)

### 2. Dashboard (Home)
- **Today's Stats** → GET /api/dashboard/stats
- **Recent Calls** → GET /api/calls/recent
- **Upcoming Appointments** → GET /api/appointments/upcoming
- **Unread Messages** → GET /api/messages/unread
- **Token Balance** → GET /api/tokens/balance

### 3. Calls Tab
- **Call History** → GET /api/calls?page=1&limit=20
- **Incoming Calls** (Push notifications)
- **Make Outbound Call** → POST /api/calls/initiate
- **Call Details** (duration, recording, notes)

### 4. Messages Tab
- **Message List** → GET /api/messages?page=1&limit=20
- **Voicemails** → GET /api/messages?type=voicemail
- **SMS Thread** → GET /api/messages/:id
- **Send SMS** → POST /api/messages/send

### 5. Appointments Tab
- **Calendar View** → GET /api/appointments?month=2024-12
- **Upcoming List** → GET /api/appointments/upcoming
- **Book Appointment** → POST /api/appointments/create
- **Appointment Details** → GET /api/appointments/:id
- **Cancel/Reschedule** → PATCH /api/appointments/:id

### 6. Contacts (CRM)
- **Contact List** → GET /api/contacts?page=1&limit=20
- **Search Contacts** → GET /api/contacts/search?q=John
- **Contact Details** → GET /api/contacts/:id
- **Add Contact** → POST /api/contacts/create
- **Edit Contact** → PATCH /api/contacts/:id
- **Call History per Contact**
- **Message History per Contact**

### 7. MCP Copilot
- **Chat Interface** → POST /api/mcp/copilot/chat
- **Social Media** → POST /api/mcp/social-media/generate
- **Email Marketing** → POST /api/email/send
- **Business Collector** → POST /api/mcp/business-collector/collect
- **Prospect Manager** → GET /api/scheduled-caller/prospects

### 8. Settings
- **Profile** → GET/PATCH /api/auth/profile
- **Business Info** → GET/PATCH /api/client/settings/:client_id
- **GHL Integration** → GET /api/ghl-oauth/status/:clientId
- **Notifications** (toggle push/email/sms)
- **Token Packages** → GET /api/tokens/pricing
- **Purchase Tokens** → POST /api/tokens/purchase
- **Referral Code** → GET /api/referrals/my-code
- **Logout** → POST /api/auth/logout

---

## Technology Stack

### iOS App
- **Language:** Swift 5.9+
- **UI Framework:** SwiftUI
- **Architecture:** MVVM
- **Networking:** URLSession + Combine
- **Local Storage:** CoreData or SwiftData
- **Push Notifications:** UserNotifications + APNs
- **Authentication:** Keychain
- **Image Loading:** SDWebImage or Kingfisher
- **Charts:** Swift Charts (iOS 16+)

### Android App (Future)
- **Language:** Kotlin
- **UI Framework:** Jetpack Compose
- **Architecture:** MVVM
- **Networking:** Retrofit + Coroutines
- **Local Storage:** Room
- **Push Notifications:** Firebase Cloud Messaging
- **Authentication:** EncryptedSharedPreferences
- **Image Loading:** Coil
- **Charts:** MPAndroidChart

---

## API Integration Strategy

### 1. Network Layer

**APIService.swift** (iOS)
```swift
class APIService {
    static let shared = APIService()
    let baseURL = "https://aiagent.ringlypro.com/api"

    // Generic request handler
    func request<T: Decodable>(
        endpoint: String,
        method: HTTPMethod,
        body: [String: Any]? = nil
    ) async throws -> T {
        // Implementation
    }

    // Specific endpoints
    func login(email: String, password: String) async throws -> AuthResponse
    func getDashboard() async throws -> DashboardData
    func getCalls(page: Int) async throws -> [Call]
    func getAppointments() async throws -> [Appointment]
    func sendMessage(to: String, body: String) async throws -> Message
}
```

### 2. Data Models

All models match your existing API responses:

```swift
struct User: Codable {
    let id: Int
    let email: String
    let firstName: String?
    let lastName: String?
    let businessName: String?
    let tokensBalance: Int
    let clientId: Int?

    enum CodingKeys: String, CodingKey {
        case id, email
        case firstName = "first_name"
        case lastName = "last_name"
        case businessName = "business_name"
        case tokensBalance = "tokens_balance"
        case clientId = "client_id"
    }
}

struct Call: Codable, Identifiable {
    let id: Int
    let twilioCallSid: String
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
}

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
}
```

### 3. Authentication Flow

```swift
// Store JWT token in Keychain
class AuthManager {
    static let shared = AuthManager()

    var authToken: String? {
        get { Keychain.get("authToken") }
        set {
            if let token = newValue {
                Keychain.set(token, forKey: "authToken")
            } else {
                Keychain.delete("authToken")
            }
        }
    }

    var isLoggedIn: Bool {
        authToken != nil
    }

    func login(email: String, password: String) async throws {
        let response: AuthResponse = try await APIService.shared.request(
            endpoint: "/auth/login",
            method: .POST,
            body: ["email": email, "password": password]
        )

        authToken = response.token
        UserDefaults.standard.set(response.user.id, forKey: "userId")
        UserDefaults.standard.set(response.user.clientId, forKey: "clientId")
    }

    func logout() {
        authToken = nil
        UserDefaults.standard.removeObject(forKey: "userId")
        UserDefaults.standard.removeObject(forKey: "clientId")
    }
}
```

---

## Project Structure

```
RinglyPro/
├── RinglyProApp.swift                 # App entry point
├── Core/
│   ├── Network/
│   │   ├── APIService.swift           # Networking layer
│   │   ├── APIEndpoints.swift         # Endpoint definitions
│   │   └── NetworkError.swift         # Error handling
│   ├── Storage/
│   │   ├── Keychain.swift            # Secure storage
│   │   └── UserDefaults+Extensions.swift
│   └── Models/
│       ├── User.swift
│       ├── Call.swift
│       ├── Appointment.swift
│       ├── Message.swift
│       └── Contact.swift
├── Features/
│   ├── Authentication/
│   │   ├── LoginView.swift
│   │   ├── SignupView.swift
│   │   └── LoginViewModel.swift
│   ├── Dashboard/
│   │   ├── DashboardView.swift
│   │   └── DashboardViewModel.swift
│   ├── Calls/
│   │   ├── CallListView.swift
│   │   ├── CallDetailView.swift
│   │   └── CallViewModel.swift
│   ├── Messages/
│   │   ├── MessageListView.swift
│   │   ├── MessageThreadView.swift
│   │   └── MessageViewModel.swift
│   ├── Appointments/
│   │   ├── AppointmentListView.swift
│   │   ├── CalendarView.swift
│   │   ├── BookAppointmentView.swift
│   │   └── AppointmentViewModel.swift
│   ├── Contacts/
│   │   ├── ContactListView.swift
│   │   ├── ContactDetailView.swift
│   │   └── ContactViewModel.swift
│   ├── Copilot/
│   │   ├── CopilotChatView.swift
│   │   ├── SocialMediaView.swift
│   │   └── CopilotViewModel.swift
│   └── Settings/
│       ├── SettingsView.swift
│       ├── ProfileView.swift
│       └── SettingsViewModel.swift
├── Components/
│   ├── LoadingView.swift
│   ├── ErrorView.swift
│   ├── EmptyStateView.swift
│   └── CustomButton.swift
└── Resources/
    ├── Assets.xcassets/
    ├── Colors.swift
    └── Fonts.swift
```

---

## Key Features for SaaS Clients

### 1. Simple Onboarding
```
Download App → Sign Up → Phone Number Auto-Provisioned → Done!
```

### 2. Dashboard at a Glance
- Today's calls: 12
- Pending appointments: 3
- Unread messages: 5
- Token balance: 142 tokens

### 3. One-Tap Actions
- Tap to call back
- Tap to view voicemail
- Tap to confirm appointment
- Tap to reply to message

### 4. Push Notifications
- 🔔 "Incoming call from (555) 123-4567"
- 📅 "Appointment in 15 minutes with John Doe"
- 💬 "New voicemail from customer"
- 💰 "Low token balance - 10 tokens remaining"

### 5. Offline Mode
- Cache recent data
- Queue actions when offline
- Sync when back online

---

## Development Phases

### Phase 1: MVP (2-3 weeks)
- ✅ Login/Signup
- ✅ Dashboard
- ✅ Call History
- ✅ Appointments (view/book)
- ✅ Messages (view/reply)
- ✅ Push Notifications
- ✅ Basic Settings

### Phase 2: Enhanced Features (1-2 weeks)
- ✅ Contacts (full CRUD)
- ✅ MCP Copilot Chat
- ✅ Token Purchase
- ✅ GHL Integration Status
- ✅ Referral System

### Phase 3: Advanced Features (1-2 weeks)
- ✅ Social Media Generation
- ✅ Email Marketing
- ✅ Business Collector
- ✅ Prospect Manager
- ✅ Analytics/Charts

### Phase 4: Polish & Submit (1 week)
- ✅ UI/UX refinement
- ✅ Testing on devices
- ✅ App Store assets
- ✅ Submit for review

**Total Time: 5-8 weeks** for production-ready iOS app

---

## Android (After iOS)

### Timeline: 3-4 weeks
- Reuse API layer logic
- Implement with Jetpack Compose
- Match iOS features 1:1
- Submit to Google Play

### Shared Code Potential
Consider **Kotlin Multiplatform Mobile (KMM)** for:
- API layer (shared)
- Data models (shared)
- Business logic (shared)
- UI (platform-specific)

This could reduce Android dev time to 2-3 weeks.

---

## API Endpoints You Already Have

Your existing backend already supports everything we need:

### Authentication
- ✅ POST /api/auth/login
- ✅ POST /api/auth/register
- ✅ POST /api/auth/logout
- ✅ GET /api/auth/profile

### Calls
- ✅ GET /api/calls (with pagination)
- ✅ POST /api/calls/initiate

### Appointments
- ✅ GET /api/appointments
- ✅ POST /api/appointments/create
- ✅ PATCH /api/appointments/:id

### Messages
- ✅ GET /api/messages
- ✅ POST /api/messages/send

### Tokens
- ✅ GET /api/tokens/balance
- ✅ POST /api/tokens/purchase
- ✅ GET /api/tokens/pricing

### MCP Copilot
- ✅ POST /api/mcp/copilot/chat
- ✅ POST /api/mcp/business-collector/collect

### GHL
- ✅ GET /api/ghl-oauth/status/:clientId

**No backend changes needed!** ✅

---

## Benefits of Native App

### For SaaS Clients:
- 📱 Professional mobile experience
- 🔔 Real-time push notifications
- ⚡ Fast and responsive
- 📴 Works offline
- 🔒 Biometric security
- 🎨 Native iOS/Android feel

### For You:
- 💰 Higher perceived value
- 📈 Better engagement
- 🌟 App Store presence
- 🔄 Cross-platform reach
- 🚀 Easier to scale

---

## Next Steps

1. **Choose Approach:**
   - Option A: Pure Native (Swift + Kotlin) ← Recommended
   - Option B: Flutter (shared codebase)
   - Option C: React Native (shared codebase)

2. **Start with iOS MVP** (Dashboard + Calls + Appointments)

3. **Iterate based on client feedback**

4. **Then build Android version**

Would you like me to start building the **iOS app with SwiftUI** using this native approach?
