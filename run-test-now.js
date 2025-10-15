#!/usr/bin/env node
/**
 * Run GHL API tests immediately and show results
 */

const axios = require('axios');

async function runTest() {
    console.log('\n🧪 Running GoHighLevel API Tests...\n');

    try {
        const response = await axios.get('https://ringlypro-crm.onrender.com/api/test-ghl/auto', {
            timeout: 60000
        });

        const data = response.data;

        console.log('═══════════════════════════════════════════════════════');
        console.log('                   TEST RESULTS                        ');
        console.log('═══════════════════════════════════════════════════════\n');

        console.log(`✅ Passed: ${data.summary.passed}`);
        console.log(`❌ Failed: ${data.summary.failed}`);
        console.log(`📊 Total: ${data.summary.total}`);
        console.log(`📈 Pass Rate: ${data.summary.passRate}%\n`);

        if (data.results.passed.length > 0) {
            console.log('✅ PASSED TESTS:');
            data.results.passed.forEach(name => {
                console.log(`   ✓ ${name}`);
            });
            console.log('');
        }

        if (data.results.failed.length > 0) {
            console.log('❌ FAILED TESTS:');
            data.results.failed.forEach(({ name, error }) => {
                console.log(`   ✗ ${name}`);
                console.log(`     Error: ${error}`);
            });
            console.log('');
        }

        console.log('═══════════════════════════════════════════════════════');
        console.log('                     DIAGNOSIS                         ');
        console.log('═══════════════════════════════════════════════════════\n');

        if (data.summary.passRate === 100) {
            console.log('🎉 ALL TESTS PASSED!');
            console.log('✅ Your JWT token is VALID and working correctly.');
            console.log('✅ The issue is in the FRONTEND/SESSION handling.');
            console.log('\n📋 Next Steps:');
            console.log('   1. Check how credentials are passed from frontend to backend');
            console.log('   2. Verify session storage/retrieval');
            console.log('   3. Check if locationId is being loaded correctly');
        } else if (data.summary.passed === 0) {
            console.log('❌ ALL TESTS FAILED!');
            const firstError = data.results.failed[0]?.error || '';

            if (firstError.includes('Invalid JWT') || firstError.includes('401')) {
                console.log('🔴 ROOT CAUSE: JWT token is INVALID or EXPIRED');
                console.log('\n📋 SOLUTION:');
                console.log('   1. Go to GoHighLevel → Settings → Integrations');
                console.log('   2. Create a NEW "Private Integration Token" (PIT)');
                console.log('   3. Copy the token (starts with "pit-")');
                console.log('   4. Update in RinglyPro dashboard settings');
                console.log('\n⚠️  IMPORTANT: Use PIT tokens, NOT JWT tokens!');
                console.log('   PIT tokens are more reliable and don\'t expire.');
            } else {
                console.log(`🔴 ROOT CAUSE: ${firstError}`);
            }
        } else {
            console.log('⚠️  PARTIAL SUCCESS');
            console.log('Some tests passed, some failed.');
            console.log('This suggests permission or scope issues.');
        }

        console.log('\n');

    } catch (error) {
        console.error('❌ Test failed to run:', error.response?.data || error.message);
        process.exit(1);
    }
}

runTest();
