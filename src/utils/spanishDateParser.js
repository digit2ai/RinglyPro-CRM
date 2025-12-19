// utils/spanishDateParser.js - Parse Spanish date/time expressions

/**
 * Parse Spanish date/time expressions into date and time components
 * Examples:
 *   "mañana a las 10 de la mañana" -> { date: '2025-12-21', time: '10:00' }
 *   "el viernes a las 2 de la tarde" -> { date: '2025-12-26', time: '14:00' }
 *   "hoy a las 3" -> { date: '2025-12-20', time: '15:00' }
 */
function parseSpanishDateTime(input) {
    const text = (input || '').toLowerCase().trim();
    const now = new Date();
    let targetDate = new Date(now);
    let hours = 10;  // Default to 10am
    let minutes = 0;

    // Parse relative day references
    if (text.includes('hoy')) {
        // Today - keep targetDate as is
    } else if (text.includes('mañana')) {
        targetDate.setDate(targetDate.getDate() + 1);
    } else if (text.includes('pasado mañana')) {
        targetDate.setDate(targetDate.getDate() + 2);
    } else {
        // Check for day of week
        const days = {
            'lunes': 1, 'martes': 2, 'miércoles': 3, 'miercoles': 3,
            'jueves': 4, 'viernes': 5, 'sábado': 6, 'sabado': 6, 'domingo': 0
        };

        for (const [dayName, dayNum] of Object.entries(days)) {
            if (text.includes(dayName)) {
                const currentDay = now.getDay();
                let daysUntil = dayNum - currentDay;
                if (daysUntil <= 0) daysUntil += 7;  // Next week if today or past
                targetDate.setDate(targetDate.getDate() + daysUntil);
                break;
            }
        }
    }

    // Parse time
    // Look for patterns like "a las 10", "10 de la mañana", "2 de la tarde", "10:30"
    const timePatterns = [
        /(\d{1,2}):(\d{2})/,                    // 10:30
        /a las? (\d{1,2})(?:\s|$|[^0-9])/,      // a las 10, a la 1
        /(\d{1,2})\s*(?:de la |en la )?(?:mañana|manana|am)/i,  // 10 de la mañana
        /(\d{1,2})\s*(?:de la |en la )?(?:tarde|noche|pm)/i,    // 2 de la tarde
        /(\d{1,2})\s*(?:horas?)?/               // just a number
    ];

    for (const pattern of timePatterns) {
        const match = text.match(pattern);
        if (match) {
            hours = parseInt(match[1], 10);
            if (match[2]) {
                minutes = parseInt(match[2], 10);
            }

            // Adjust for PM if "tarde" or "noche" mentioned
            if ((text.includes('tarde') || text.includes('noche') || text.includes('pm')) && hours < 12) {
                hours += 12;
            }
            // Handle midnight edge case
            if (hours === 24) hours = 0;
            // Handle noon
            if ((text.includes('mediodía') || text.includes('mediodia')) && hours === 12) {
                // Keep as 12
            }

            break;
        }
    }

    // Ensure hours are in valid range
    if (hours < 0 || hours > 23) hours = 10;
    if (minutes < 0 || minutes > 59) minutes = 0;

    // Format the date
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const day = String(targetDate.getDate()).padStart(2, '0');
    const formattedDate = `${year}-${month}-${day}`;

    // Format the time
    const formattedTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

    console.log(`📅 Parsed Spanish datetime "${input}" -> date: ${formattedDate}, time: ${formattedTime}`);

    return {
        date: formattedDate,
        time: formattedTime,
        rawInput: input
    };
}

module.exports = { parseSpanishDateTime };
