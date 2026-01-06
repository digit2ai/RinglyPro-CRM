#!/usr/bin/env node
/**
 * Compare GHL calendar data with what's in the database
 */
const { Sequelize } = require('sequelize');
const axios = require('axios');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
});

const CALENDARS = [
    { id: 'lqwsBWMJip0wx6NGLeaG', name: 'HYPERBARIC', openHour: 10, closeHour: 18 },
    { id: 'mV3NGEcqoXayzHtIEE97', name: 'CRYOTHERAPY', openHour: 10, closeHour: 18 },
    { id: 'yHDUtxQWt9GzaPcdUnxs', name: 'RECOVERY', openHour: 10, closeHour: 18 }
];

async function compare() {
    try {
        await sequelize.authenticate();

        // Get Client 32 credentials
        const [clients] = await sequelize.query(
            'SELECT ghl_api_key, ghl_location_id FROM clients WHERE id = 32'
        );
        const apiKey = clients[0].ghl_api_key;
        const locationId = clients[0].ghl_location_id;

        console.log('='.repeat(80));
        console.log('COMPARING GHL CALENDAR vs RinglyPro DATABASE for Client 32');
        console.log('='.repeat(80));

        // Check dates: today through Jan 11
        const dates = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-10', '2026-01-11'];

        for (const dateStr of dates) {
            console.log('\n' + '─'.repeat(80));
            console.log(`📅 ${dateStr}`);
            console.log('─'.repeat(80));

            for (const calendar of CALENDARS) {
                const dayStart = new Date(`${dateStr}T00:00:00`).getTime();
                const dayEnd = dayStart + 24 * 60 * 60 * 1000;

                // Get free slots from GHL
                let freeSlots = [];
                try {
                    const freeSlotsRes = await axios.get(
                        `https://services.leadconnectorhq.com/calendars/${calendar.id}/free-slots`,
                        {
                            headers: {
                                'Authorization': `Bearer ${apiKey}`,
                                'Version': '2021-07-28'
                            },
                            params: { startDate: dayStart, endDate: dayEnd }
                        }
                    );
                    const slotsData = freeSlotsRes.data?.slots || freeSlotsRes.data || {};
                    const dateKeys = Object.keys(slotsData);
                    if (dateKeys.length > 0) {
                        freeSlots = slotsData[dateKeys[0]]?.slots || [];
                    }
                } catch (e) {
                    console.log(`   ${calendar.name}: API ERROR - ${e.message}`);
                    continue;
                }

                // Generate all possible slots
                const allPossibleSlots = [];
                for (let h = calendar.openHour; h < calendar.closeHour; h++) {
                    allPossibleSlots.push(`${dateStr}T${h.toString().padStart(2, '0')}:00:00-05:00`);
                }

                // Calculate busy slots from GHL (all - free = busy)
                const ghlBusySlots = allPossibleSlots.filter(slot => !freeSlots.includes(slot));
                const ghlBusyHours = ghlBusySlots.map(s => s.substring(11, 13) + ':00');

                // Get busy slots from database
                const [dbAppts] = await sequelize.query(
                    `SELECT appointment_time FROM appointments
                     WHERE client_id = 32
                     AND appointment_date = :date
                     AND ghl_calendar_id = :calId
                     ORDER BY appointment_time`,
                    { replacements: { date: dateStr, calId: calendar.id } }
                );
                const dbBusyHours = dbAppts.map(a => a.appointment_time.substring(0, 5));

                // Compare
                const ghlSet = new Set(ghlBusyHours);
                const dbSet = new Set(dbBusyHours);

                const inGhlNotDb = ghlBusyHours.filter(h => !dbSet.has(h));
                const inDbNotGhl = dbBusyHours.filter(h => !ghlSet.has(h));

                if (inGhlNotDb.length === 0 && inDbNotGhl.length === 0) {
                    console.log(`   ✅ ${calendar.name}: IN SYNC (${ghlBusyHours.length} busy slots)`);
                } else {
                    console.log(`   ❌ ${calendar.name}: OUT OF SYNC`);
                    console.log(`      GHL busy: [${ghlBusyHours.join(', ')}]`);
                    console.log(`      DB busy:  [${dbBusyHours.join(', ')}]`);
                    if (inGhlNotDb.length > 0) {
                        console.log(`      🔴 In GHL but NOT in DB: ${inGhlNotDb.join(', ')}`);
                    }
                    if (inDbNotGhl.length > 0) {
                        console.log(`      🟡 In DB but NOT in GHL: ${inDbNotGhl.join(', ')}`);
                    }
                }
            }
        }

        console.log('\n' + '='.repeat(80));

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await sequelize.close();
    }
}

compare();
