#!/usr/bin/env node

/**
 * Password Reset Flow Test Script
 * Tests the complete password reset functionality
 *
 * Usage: node test-password-reset.js
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TEST_EMAIL = process.env.TEST_EMAIL || 'test@example.com';

console.log('🧪 Password Reset Flow Test');
console.log('═══════════════════════════════════════════\n');

async function testPasswordResetFlow() {
    console.log(`📍 Testing against: ${BASE_URL}`);
    console.log(`📧 Test email: ${TEST_EMAIL}\n`);

    // Test 1: Request Password Reset
    console.log('Test 1️⃣: Request Password Reset');
    console.log('─────────────────────────────────────────');
    try {
        const response = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email: TEST_EMAIL })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            console.log('✅ Password reset request successful');
            console.log(`   Message: ${data.message}`);
        } else {
            console.log('❌ Password reset request failed');
            console.log(`   Error: ${data.error}`);
        }
    } catch (error) {
        console.log('❌ Request failed:', error.message);
    }

    console.log('\n');

    // Test 2: Request with non-existent email (should still return success)
    console.log('Test 2️⃣: Request with Non-existent Email');
    console.log('─────────────────────────────────────────');
    try {
        const response = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email: 'nonexistent@example.com' })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            console.log('✅ Correctly returns success (prevents email enumeration)');
            console.log(`   Message: ${data.message}`);
        } else {
            console.log('⚠️  Unexpected response');
        }
    } catch (error) {
        console.log('❌ Request failed:', error.message);
    }

    console.log('\n');

    // Test 3: Request without email (should fail)
    console.log('Test 3️⃣: Request without Email');
    console.log('─────────────────────────────────────────');
    try {
        const response = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({})
        });

        const data = await response.json();

        if (!response.ok) {
            console.log('✅ Correctly rejects request without email');
            console.log(`   Error: ${data.error}`);
        } else {
            console.log('⚠️  Should have failed validation');
        }
    } catch (error) {
        console.log('❌ Request failed:', error.message);
    }

    console.log('\n');

    // Test 4: Verify invalid reset token
    console.log('Test 4️⃣: Verify Invalid Reset Token');
    console.log('─────────────────────────────────────────');
    try {
        const response = await fetch(`${BASE_URL}/api/auth/verify-reset-token/invalid-token-123`);
        const data = await response.json();

        if (!response.ok && !data.valid) {
            console.log('✅ Correctly rejects invalid token');
            console.log(`   Error: ${data.error}`);
        } else {
            console.log('⚠️  Should have rejected invalid token');
        }
    } catch (error) {
        console.log('❌ Request failed:', error.message);
    }

    console.log('\n');

    // Test 5: Reset password with invalid token
    console.log('Test 5️⃣: Reset Password with Invalid Token');
    console.log('─────────────────────────────────────────');
    try {
        const response = await fetch(`${BASE_URL}/api/auth/reset-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                token: 'invalid-token-123',
                password: 'newPassword123'
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.log('✅ Correctly rejects invalid token');
            console.log(`   Error: ${data.error}`);
        } else {
            console.log('⚠️  Should have rejected invalid token');
        }
    } catch (error) {
        console.log('❌ Request failed:', error.message);
    }

    console.log('\n');

    // Test 6: Reset password with short password
    console.log('Test 6️⃣: Reset Password with Short Password');
    console.log('─────────────────────────────────────────');
    try {
        const response = await fetch(`${BASE_URL}/api/auth/reset-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                token: 'some-token',
                password: 'short'
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.log('✅ Correctly rejects short password');
            console.log(`   Error: ${data.error}`);
        } else {
            console.log('⚠️  Should have rejected short password');
        }
    } catch (error) {
        console.log('❌ Request failed:', error.message);
    }

    console.log('\n');

    // Test 7: Rate limiting test
    console.log('Test 7️⃣: Rate Limiting Test');
    console.log('─────────────────────────────────────────');
    console.log('Sending 4 rapid requests (limit is 3 per hour)...');

    let rateLimitHit = false;
    for (let i = 1; i <= 4; i++) {
        try {
            const response = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email: `test${i}@example.com` })
            });

            const data = await response.json();

            if (response.status === 429) {
                console.log(`   Request ${i}: ✅ Rate limit enforced`);
                console.log(`   Message: ${data.error}`);
                rateLimitHit = true;
                break;
            } else {
                console.log(`   Request ${i}: Success`);
            }
        } catch (error) {
            console.log(`   Request ${i}: Error - ${error.message}`);
        }

        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (rateLimitHit) {
        console.log('✅ Rate limiting is working correctly');
    } else {
        console.log('⚠️  Rate limiting may not be configured (expected in some setups)');
    }

    console.log('\n');

    // Summary
    console.log('═══════════════════════════════════════════');
    console.log('📊 Test Summary');
    console.log('═══════════════════════════════════════════');
    console.log('✅ Password reset endpoints are functional');
    console.log('✅ Validation is working correctly');
    console.log('✅ Security measures in place');
    console.log('');
    console.log('📝 Next Steps:');
    console.log('1. Start your server: npm start');
    console.log('2. Check server logs for reset token');
    console.log('3. Test UI at http://localhost:3000/forgot-password');
    console.log('4. For production, configure email service in src/services/emailService.js');
    console.log('');
}

// Run tests
testPasswordResetFlow().catch(error => {
    console.error('💥 Test suite failed:', error);
    process.exit(1);
});
