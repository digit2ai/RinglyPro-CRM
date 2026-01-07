#!/usr/bin/env node
/**
 * Sync REAL appointments from GHL for Client 15
 * This fetches actual appointment events with contact names,
 * NOT busy/blocked placeholders.
 *
 * Run: DATABASE_URL="your-db-url" node scripts/sync-client15-real-appointments.js
 */
const { Sequelize } = require('sequelize');
const axios = require('axios');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable required');
    process.exit(1);
}

const sequelize = new Sequelize(DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
});

const CLIENT_ID = 15;
const GHL_API_VERSION = '2021-07-28';

async function fetchContactDetails(apiKey, contactId) {
    try {
        const res = await axios.get(
            `https://services.leadconnectorhq.com/contacts/${contactId}`,
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Version': GHL_API_VERSION
                }
            }
        );
        const contact = res.data.contact;
        return {
            name: contact?.contactName || `${contact?.firstName || ''} ${contact?.lastName || ''}`.trim() || 'Unknown',
            phone: contact?.phone || '',
            email: contact?.email || ''
        };
    } catch (err) {
        console.log(`   ⚠️ Could not fetch contact ${contactId}: ${err.message}`);
        return { name: 'Unknown', phone: '', email: '' };
    }
}

async function sync() {
    try {
        await sequelize.authenticate();
        console.log('✅ Connected to database\n');

        // Get Client 15 credentials
        const [clients] = await sequelize.query(
            'SELECT ghl_api_key, ghl_location_id, business_name FROM clients WHERE id = $1',
            { bind: [CLIENT_ID] }
        );

        if (!clients.length || !clients[0].ghl_api_key) {
            console.error('❌ Client 15 not found or no GHL credentials');
            process.exit(1);
        }

        const { ghl_api_key: apiKey, ghl_location_id: locationId, business_name: businessName } = clients[0];
        console.log('📍 Client:', businessName);
        console.log('📍 Location ID:', locationId);

        // Step 1: Clean up old "Busy" placeholder records
        console.log('\n🧹 Cleaning up old Busy/placeholder appointments...');
        const [deleted1] = await sequelize.query(
            "DELETE FROM appointments WHERE client_id = $1 AND customer_name LIKE 'Busy%' RETURNING id",
            { bind: [CLIENT_ID] }
        );
        console.log(`   Deleted ${deleted1.length} 'Busy' records`);

        const [deleted2] = await sequelize.query(
            "DELETE FROM appointments WHERE client_id = $1 AND source = 'ghl_sync' AND notes LIKE '%Busy/Blocked%' RETURNING id",
            { bind: [CLIENT_ID] }
        );
        console.log(`   Deleted ${deleted2.length} 'ghl_sync Busy/Blocked' records`);

        // Step 2: Get all calendars for this location
        console.log('\n📅 Fetching calendars...');
        const calendarsRes = await axios.get(
            'https://services.leadconnectorhq.com/calendars/',
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Version': GHL_API_VERSION
                },
                params: { locationId }
            }
        );

        const calendars = calendarsRes.data.calendars || [];
        console.log(`   Found ${calendars.length} calendars: ${calendars.map(c => c.name).join(', ')}`);

        // Step 3: Date range - today + 30 days
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 30);
        const startEpoch = startDate.getTime();
        const endEpoch = endDate.getTime();

        console.log(`\n📆 Fetching appointments from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);

        // Step 4: Fetch events from each calendar
        let totalInserted = 0;
        let totalUpdated = 0;

        for (const calendar of calendars) {
            console.log(`\n📆 Processing calendar: ${calendar.name}`);

            try {
                const eventsRes = await axios.get(
                    'https://services.leadconnectorhq.com/calendars/events',
                    {
                        headers: {
                            'Authorization': `Bearer ${apiKey}`,
                            'Version': GHL_API_VERSION
                        },
                        params: {
                            locationId,
                            calendarId: calendar.id,
                            startTime: startEpoch,
                            endTime: endEpoch
                        }
                    }
                );

                const events = eventsRes.data.events || [];
                console.log(`   Found ${events.length} appointments`);

                for (const event of events) {
                    // Get contact details
                    let contactName = event.title || 'GHL Appointment';
                    let contactPhone = '';
                    let contactEmail = '';

                    if (event.contactId) {
                        const contact = await fetchContactDetails(apiKey, event.contactId);
                        contactName = contact.name || contactName;
                        contactPhone = contact.phone;
                        contactEmail = contact.email;
                    }

                    // Parse date and time from ISO string (e.g., "2026-01-07T16:00:00-05:00")
                    const appointmentDate = event.startTime.substring(0, 10);
                    const appointmentTime = event.startTime.substring(11, 19);

                    // Calculate duration
                    let duration = 60;
                    if (event.endTime) {
                        const start = new Date(event.startTime);
                        const end = new Date(event.endTime);
                        duration = Math.round((end - start) / (1000 * 60));
                    }

                    // Check if appointment already exists
                    const [existing] = await sequelize.query(
                        'SELECT id FROM appointments WHERE client_id = $1 AND ghl_appointment_id = $2',
                        { bind: [CLIENT_ID, event.id] }
                    );

                    if (existing.length > 0) {
                        // Update existing
                        await sequelize.query(
                            `UPDATE appointments SET
                                customer_name = $1,
                                customer_phone = $2,
                                customer_email = $3,
                                appointment_date = $4,
                                appointment_time = $5,
                                duration = $6,
                                purpose = $7,
                                status = $8,
                                ghl_contact_id = $9,
                                ghl_calendar_id = $10,
                                updated_at = NOW()
                             WHERE id = $11`,
                            {
                                bind: [
                                    contactName,
                                    contactPhone,
                                    contactEmail,
                                    appointmentDate,
                                    appointmentTime,
                                    duration,
                                    event.title || calendar.name || 'GHL Appointment',
                                    mapGHLStatus(event.appointmentStatus),
                                    event.contactId || null,
                                    calendar.id,
                                    existing[0].id
                                ]
                            }
                        );
                        totalUpdated++;
                        console.log(`   ✏️  Updated: ${contactName} @ ${appointmentDate} ${appointmentTime}`);
                    } else {
                        // Insert new
                        const confirmationCode = `GS${Date.now().toString().slice(-6)}`;
                        await sequelize.query(
                            `INSERT INTO appointments (
                                client_id, customer_name, customer_phone, customer_email,
                                appointment_date, appointment_time, duration, purpose,
                                status, source, confirmation_code, notes,
                                ghl_appointment_id, ghl_contact_id, ghl_calendar_id,
                                created_at, updated_at
                            ) VALUES (
                                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW()
                            )`,
                            {
                                bind: [
                                    CLIENT_ID,
                                    contactName,
                                    contactPhone,
                                    contactEmail,
                                    appointmentDate,
                                    appointmentTime,
                                    duration,
                                    event.title || calendar.name || 'GHL Appointment',
                                    mapGHLStatus(event.appointmentStatus),
                                    'ghl_sync',
                                    confirmationCode,
                                    `Synced from GHL calendar: ${calendar.name}`,
                                    event.id,
                                    event.contactId || null,
                                    calendar.id
                                ]
                            }
                        );
                        totalInserted++;
                        console.log(`   ✅ Inserted: ${contactName} @ ${appointmentDate} ${appointmentTime}`);
                    }
                }
            } catch (calErr) {
                console.error(`   ❌ Error processing ${calendar.name}: ${calErr.message}`);
            }
        }

        console.log('\n═══════════════════════════════════════════════');
        console.log(`✅ Sync complete for Client ${CLIENT_ID}`);
        console.log(`   Inserted: ${totalInserted}`);
        console.log(`   Updated: ${totalUpdated}`);
        console.log('═══════════════════════════════════════════════');

        // Show final appointments
        const [finalAppts] = await sequelize.query(
            `SELECT customer_name, appointment_date, appointment_time, purpose, status
             FROM appointments
             WHERE client_id = $1 AND appointment_date >= CURRENT_DATE
             ORDER BY appointment_date, appointment_time
             LIMIT 20`,
            { bind: [CLIENT_ID] }
        );

        console.log('\n📋 Current appointments:');
        finalAppts.forEach(a => {
            console.log(`   ${a.appointment_date} ${a.appointment_time} - ${a.customer_name} (${a.purpose})`);
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
    } finally {
        await sequelize.close();
    }
}

function mapGHLStatus(ghlStatus) {
    const statusMap = {
        'confirmed': 'confirmed',
        'showed': 'completed',
        'noshow': 'no-show',
        'no_show': 'no-show',
        'cancelled': 'cancelled',
        'canceled': 'cancelled',
        'new': 'pending',
        'pending': 'pending'
    };
    return statusMap[ghlStatus?.toLowerCase()] || 'confirmed';
}

sync();
