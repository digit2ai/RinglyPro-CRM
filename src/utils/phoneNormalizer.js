/**
 * Normalize phone numbers from speech recognition
 *
 * Speech recognition often misinterprets phone numbers:
 * - "three one three" becomes "13" or "313"
 * - Area codes get confused
 * - This function attempts to fix common issues
 */

function normalizePhoneFromSpeech(speechText) {
    if (!speechText) return '';

    // Remove all non-numeric characters and spaces for analysis
    let digitsOnly = speechText.replace(/[^\d]/g, '');

    // If we got exactly 10 digits, it's probably correct
    if (digitsOnly.length === 10) {
        return formatPhoneNumber(digitsOnly);
    }

    // Common issue: "thirteen" becomes "13" instead of "3-1-3"
    // Pattern: if we have 9 digits starting with "13", it might be "3-1-3..."
    if (digitsOnly.length === 9 && digitsOnly.startsWith('13')) {
        // Try: 3-1-3-xxx-xxxx
        const fixed = '3' + digitsOnly.substring(1);
        return formatPhoneNumber(fixed);
    }

    // Pattern: Area code 313 often transcribed as "13" at start
    // "13 641-4177" should be "313-641-4177"
    if (digitsOnly.length === 9 && (digitsOnly.startsWith('13') || digitsOnly.startsWith('12'))) {
        const possibleAreaCode = '3' + digitsOnly.substring(0, 2);
        const rest = digitsOnly.substring(2);
        return formatPhoneNumber(possibleAreaCode + rest);
    }

    // If we have 11 digits starting with 1, remove the 1 (country code)
    if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
        return formatPhoneNumber(digitsOnly.substring(1));
    }

    // If less than 10 digits, might be missing area code digit
    if (digitsOnly.length < 10) {
        console.warn(`⚠️ Phone number too short (${digitsOnly.length} digits): ${speechText}`);
        // Return as-is formatted
        return formatPhoneNumber(digitsOnly);
    }

    // If more than 10 digits (and not 11 with leading 1), take last 10
    if (digitsOnly.length > 10) {
        console.warn(`⚠️ Phone number too long (${digitsOnly.length} digits): ${speechText}, using last 10`);
        return formatPhoneNumber(digitsOnly.slice(-10));
    }

    // Default: format what we have
    return formatPhoneNumber(digitsOnly);
}

function formatPhoneNumber(digits) {
    if (!digits) return '';

    // Remove any non-digits
    digits = digits.replace(/\D/g, '');

    // Format based on length
    if (digits.length === 10) {
        // (313) 641-4177
        return `(${digits.substring(0, 3)}) ${digits.substring(3, 6)}-${digits.substring(6)}`;
    } else if (digits.length === 11 && digits[0] === '1') {
        // +1 (313) 641-4177
        return `+1 (${digits.substring(1, 4)}) ${digits.substring(4, 7)}-${digits.substring(7)}`;
    } else if (digits.length === 7) {
        // 641-4177
        return `${digits.substring(0, 3)}-${digits.substring(3)}`;
    }

    // Return as-is if format unclear
    return digits;
}

module.exports = {
    normalizePhoneFromSpeech,
    formatPhoneNumber
};
