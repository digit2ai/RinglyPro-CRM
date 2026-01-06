#!/usr/bin/env node
/**
 * Clean stale data and re-sync Client 32 from GHL
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

async function cleanAndResync() {
    try {
        await sequelize.authenticate();
        console.log('✅ Connected to database\n');

        // Get Client 32 credentials
        const [clients] = await sequelize.query(
            'SELECT ghl_api_key, ghl_location_id FROM clients WHERE id = 32'
        );
        const apiKey = clients[0].ghl_api_key;

        // Step 1: Delete ALL ghl_sync appointments for Client 32
        console.log('🧹 Step 1: Clearing ALL ghl_sync appointments for Client 32...');
        const [deleted] = await sequelize.query(
            "DELETE FROM appointments WHERE client_id = 32 AND source = 'ghl_sync' RETURNING id"
        );
        console.log(`   Deleted ${deleted.length} appointments\n`);

        // Step 2: Re-sync from GHL with fresh data
        console.log('🔄 Step 2: Fetching fresh data from GHL...\n');

        // Date range: today + 7 days
        const today = new Date();
        const dates = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() + i);
            dates.push(d.toISOString().split('T')[0]);
        }

        let totalInserted = 0;

        for (const calendar of CALENDARS) {
            console.log(`📆 Processing: ${calendar.name}`);
            let calendarTotal = 0;

            for (const dateStr of dates) {
                const dayStart = new Date(`${dateStr}T00:00:00`).getTime();
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

                    const slotsData = freeSlotsRes.data?.slots || freeSlotsRes.data || {};
                    const dateKeys = Object.keys(slotsData);

                    if (dateKeys.length === 0) {
                        // Calendar closed this day
                        continue;
                    }

                    const freeSlots = slotsData[dateKeys[0]]?.slots || [];

                    // Generate all possible slots (10:00 - 17:00, since closeHour is 18 but last slot starts at 17)
                    const allPossibleSlots = [];
                    for (let h = calendar.openHour; h < calendar.closeHour; h++) {
                        allPossibleSlots.push(`${dateStr}T${h.toString().padStart(2, '0')}:00:00-05:00`);
                    }

                    // Find busy slots (in all possible but not in free)
                    const busySlots = allPossibleSlots.filter(slot => !freeSlots.includes(slot));

                    if (busySlots.length > 0) {
                        for (const slot of busySlots) {
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
                                calendarTotal++;
                            } catch (insertErr) {
                                if (!insertErr.message.includes('duplicate')) {
                                    console.error(`      Insert error: ${insertErr.message}`);
                                }
                            }
                        }
                    }
                } catch (calErr) {
                    console.log(`   ${dateStr}: ERROR - ${calErr.response?.data?.message || calErr.message}`);
                }
            }
            console.log(`   → Inserted ${calendarTotal} busy slots\n`);
        }

        console.log('─'.repeat(60));
        console.log(`✅ Total busy slots inserted: ${totalInserted}`);

        // Verify final count
        const [finalCount] = await sequelize.query(
            "SELECT COUNT(*) as count FROM appointments WHERE client_id = 32 AND source = 'ghl_sync'"
        );
        console.log(`📊 GHL sync appointments in database: ${finalCount[0].count}`);

        // Also keep any non-ghl_sync appointments (like Voice AI bookings)
        const [otherCount] = await sequelize.query(
            "SELECT COUNT(*) as count FROM appointments WHERE client_id = 32 AND source != 'ghl_sync'"
        );
        console.log(`📊 Other appointments (Voice AI, etc): ${otherCount[0].count}`);

        console.log('\n🎉 Clean and re-sync complete!');

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
    } finally {
        await sequelize.close();
    }
}

cleanAndResync();
