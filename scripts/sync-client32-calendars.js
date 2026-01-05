#!/usr/bin/env node
/**
 * Sync ALL busy slots from Client 32's GHL calendars
 * Calendar IDs:
 *   - Hyperbaric: lqwsBWMJip0wx6NGLeaG
 *   - Cryotherapy: mV3NGEcqoXayzHtIEE97
 *   - Recovery: yHDUtxQWt9GzaPcdUnxs
 */
const { Sequelize } = require('sequelize');
const axios = require('axios');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
});

const CALENDARS = [
    { id: 'lqwsBWMJip0wx6NGLeaG', name: 'CORVITA HYPERBARIC OXYGEN THERAPY', openHour: 10, closeHour: 18 },
    { id: 'mV3NGEcqoXayzHtIEE97', name: 'CORVITA LOCALIZED CRYOTHERAPY', openHour: 10, closeHour: 18 },
    { id: 'yHDUtxQWt9GzaPcdUnxs', name: 'CORVITA RECOVERY SPECIALIST', openHour: 10, closeHour: 18 }
];

async function sync() {
    try {
        await sequelize.authenticate();
        console.log('✅ Connected to database\n');

        // Get Client 32 credentials
        const [clients] = await sequelize.query(
            'SELECT ghl_api_key, ghl_location_id FROM clients WHERE id = 32'
        );
        const apiKey = clients[0].ghl_api_key;
        const locationId = clients[0].ghl_location_id;

        console.log('📍 Location ID:', locationId);

        // Clear old busy slot entries to avoid duplicates
        console.log('\n🧹 Clearing old GHL busy slot appointments...');
        const [deleted] = await sequelize.query(
            "DELETE FROM appointments WHERE client_id = 32 AND source = 'ghl_sync' AND notes LIKE '%Busy/Blocked%' RETURNING id"
        );
        console.log('   Deleted', deleted.length, 'old busy slot entries');

        // Date range: today + 7 days
        const today = new Date();
        const dates = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() + i);
            dates.push(d.toISOString().split('T')[0]);
        }
        console.log('\n📅 Processing dates:', dates[0], 'to', dates[dates.length - 1]);

        let totalInserted = 0;

        for (const calendar of CALENDARS) {
            console.log('\n📆 Processing:', calendar.name);

            for (const dateStr of dates) {
                const dayStart = new Date(dateStr + 'T00:00:00').getTime();
                const dayEnd = dayStart + 24 * 60 * 60 * 1000;

                try {
                    // Get free slots from GHL
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

                    const slotsData = freeSlotsRes.data?.slots || freeSlotsRes.data;
                    const dateKeys = Object.keys(slotsData);

                    if (dateKeys.length === 0) {
                        // Calendar closed this day
                        continue;
                    }

                    const freeSlots = slotsData[dateKeys[0]]?.slots || [];

                    // Generate all possible slots for this calendar
                    const allPossibleSlots = [];
                    for (let h = calendar.openHour; h < calendar.closeHour; h++) {
                        allPossibleSlots.push(`${dateStr}T${h.toString().padStart(2, '0')}:00:00-05:00`);
                    }

                    // Find busy slots (in all possible but not in free)
                    const busySlots = allPossibleSlots.filter(slot => !freeSlots.includes(slot));

                    if (busySlots.length > 0) {
                        console.log('   ', dateStr, ':', busySlots.length, 'busy slots');

                        for (const slot of busySlots) {
                            // Extract hour from ISO string (avoid timezone issues)
                            const slotHour = slot.substring(11, 13);
                            const appointmentTime = `${slotHour}:00:00`;
                            const confirmationCode = `BUSY-${calendar.id.substring(0, 8)}-${dateStr}-${slotHour}`;

                            try {
                                await sequelize.query(`
                                    INSERT INTO appointments (
                                        client_id, appointment_date, appointment_time,
                                        customer_name, customer_phone, customer_email,
                                        purpose, status, confirmation_code, notes,
                                        source, ghl_calendar_id, created_at, updated_at
                                    ) VALUES (
                                        32, :date, :time,
                                        :name, 'N/A', 'N/A',
                                        :purpose, 'confirmed', :code, :notes,
                                        'ghl_sync', :calendarId, NOW(), NOW()
                                    )
                                    ON CONFLICT DO NOTHING
                                `, {
                                    replacements: {
                                        date: dateStr,
                                        time: appointmentTime,
                                        name: `Busy - ${calendar.name}`,
                                        purpose: `Busy slot from ${calendar.name}`,
                                        code: confirmationCode,
                                        notes: `Busy/Blocked slot from GHL calendar: ${calendar.name}`,
                                        calendarId: calendar.id
                                    }
                                });
                                totalInserted++;
                            } catch (insertErr) {
                                // Skip duplicates
                                if (!insertErr.message.includes('duplicate')) {
                                    console.error('      Insert error:', insertErr.message);
                                }
                            }
                        }
                    }
                } catch (calErr) {
                    console.log('   ', dateStr, ': ERROR -', calErr.response?.data?.message || calErr.message);
                }
            }
        }

        console.log('\n✅ Total busy slots inserted:', totalInserted);

        // Verify final count
        const [finalCount] = await sequelize.query(
            'SELECT COUNT(*) as count FROM appointments WHERE client_id = 32'
        );
        console.log('📊 Total appointments for Client 32:', finalCount[0].count);

        // Show by calendar
        const [byCal] = await sequelize.query(`
            SELECT ghl_calendar_id, COUNT(*) as count
            FROM appointments
            WHERE client_id = 32
            GROUP BY ghl_calendar_id
        `);
        console.log('\nBy calendar:');
        byCal.forEach(c => {
            const calName = CALENDARS.find(cal => cal.id === c.ghl_calendar_id)?.name || c.ghl_calendar_id || 'Other';
            console.log('  ', calName.substring(0, 30), ':', c.count);
        });

        console.log('\n🎉 Sync complete!');

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
    } finally {
        await sequelize.close();
    }
}

sync();
