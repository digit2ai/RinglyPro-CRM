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
        case id
        case email
        case firstName = "first_name"
        case lastName = "last_name"
        case businessName = "business_name"
        case clientId = "client_id"
        case tokensBalance = "tokens_balance"
    }

    var fullName: String {
        if let first = firstName, let last = lastName {
            return "\(first) \(last)"
        } else if let first = firstName {
            return first
        } else if let last = lastName {
            return last
        } else {
            return email
        }
    }
}//
//  User.swift
//  RinglyPro
//
//  Created by Manuel Stagg on 11/10/25.
//

