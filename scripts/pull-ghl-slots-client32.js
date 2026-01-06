#!/usr/bin/env node
/**
 * Pull Calendar Open and Busy Slots directly from GHL for Client 32
 */
const axios = require('axios');

const API_KEY = 'pit-c06c6e76-a6c2-4ad6-adcc-132ccaf11d51';
const LOCATION_ID = 'CU7M8At2sWwodiBrr71J';

const CALENDARS = [
    { id: 'lqwsBWMJip0wx6NGLeaG', name: 'CORVITA HYPERBARIC OXYGEN THERAPY' },
    { id: 'mV3NGEcqoXayzHtIEE97', name: 'CORVITA LOCALIZED CRYOTHERAPY' },
    { id: 'yHDUtxQWt9GzaPcdUnxs', name: 'CORVITA RECOVERY SPECIALIST' }
];

async function pullGHLSlots() {
    console.log('='.repeat(80));
    console.log('GHL CALENDAR SLOTS FOR CLIENT 32 (Corvita Recovery & Nutrition)');
    console.log('='.repeat(80));
    console.log('API Key:', API_KEY);
    console.log('Location ID:', LOCATION_ID);
    console.log('');

    // Date range: today + 7 days
    const today = new Date();
    const dates = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() + i);
        dates.push(d.toISOString().split('T')[0]);
    }

    console.log('Date Range:', dates[0], 'to', dates[dates.length - 1]);
    console.log('');

    for (const calendar of CALENDARS) {
        console.log('─'.repeat(80));
        console.log(`📆 ${calendar.name}`);
        console.log(`   Calendar ID: ${calendar.id}`);
        console.log('─'.repeat(80));

        // Get calendar details (open hours)
        try {
            const calDetailRes = await axios.get(
                `https://services.leadconnectorhq.com/calendars/${calendar.id}`,
                {
                    headers: {
                        'Authorization': `Bearer ${API_KEY}`,
                        'Version': '2021-07-28'
                    }
                }
            );

            const calDetail = calDetailRes.data.calendar;
            console.log('\n   📋 OPEN HOURS CONFIGURATION:');

            if (calDetail.openHours && calDetail.openHours.length > 0) {
                calDetail.openHours.forEach(oh => {
                    const days = oh.daysOfTheWeek.map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ');
                    if (oh.hours && oh.hours.length > 0) {
                        oh.hours.forEach(h => {
                            console.log(`      ${days}: ${h.openHour}:00 - ${h.closeHour}:00`);
                        });
                    }
                });
            } else {
                console.log('      No open hours configured');
            }

            // Get slots for each date
            console.log('\n   📅 SLOTS BY DATE:');

            for (const dateStr of dates) {
                const dayStart = new Date(`${dateStr}T00:00:00`).getTime();
                const dayEnd = dayStart + 24 * 60 * 60 * 1000;

                try {
                    const freeSlotsRes = await axios.get(
                        `https://services.leadconnectorhq.com/calendars/${calendar.id}/free-slots`,
                        {
                            headers: {
                                'Authorization': `Bearer ${API_KEY}`,
                                'Version': '2021-07-28'
                            },
                            params: { startDate: dayStart, endDate: dayEnd }
                        }
                    );

                    const slotsData = freeSlotsRes.data?.slots || freeSlotsRes.data || {};
                    const dateKeys = Object.keys(slotsData);

                    if (dateKeys.length === 0) {
                        console.log(`      ${dateStr}: CLOSED (no slots available)`);
                        continue;
                    }

                    const freeSlots = slotsData[dateKeys[0]]?.slots || [];

                    // Find open hours for this day
                    const d = new Date(dateStr);
                    const dayOfWeek = d.getDay();
                    const dayConfig = calDetail.openHours?.find(oh => oh.daysOfTheWeek?.includes(dayOfWeek));

                    if (!dayConfig || !dayConfig.hours || !dayConfig.hours[0]) {
                        console.log(`      ${dateStr}: CLOSED (no hours configured for this day)`);
                        continue;
                    }

                    const hours = dayConfig.hours[0];
                    const openHour = hours.openHour;
                    const closeHour = hours.closeHour;

                    // Generate all possible slots
                    const allPossibleSlots = [];
                    for (let h = openHour; h < closeHour; h++) {
                        allPossibleSlots.push(`${dateStr}T${h.toString().padStart(2, '0')}:00:00-05:00`);
                    }

                    // Calculate busy slots
                    const busySlots = allPossibleSlots.filter(slot => !freeSlots.includes(slot));
                    const freeHours = freeSlots.map(s => s.substring(11, 16));
                    const busyHours = busySlots.map(s => s.substring(11, 16));

                    console.log(`\n      ${dateStr} (${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek]}):`);
                    console.log(`         Open: ${openHour}:00 - ${closeHour}:00`);
                    console.log(`         🟢 FREE slots (${freeHours.length}): ${freeHours.length > 0 ? freeHours.join(', ') : 'None'}`);
                    console.log(`         🔴 BUSY slots (${busyHours.length}): ${busyHours.length > 0 ? busyHours.join(', ') : 'None'}`);

                } catch (slotErr) {
                    console.log(`      ${dateStr}: ERROR - ${slotErr.response?.data?.message || slotErr.message}`);
                }
            }

        } catch (calErr) {
            console.log(`   ERROR getting calendar details: ${calErr.response?.data?.message || calErr.message}`);
        }

        console.log('');
    }

    console.log('='.repeat(80));
    console.log('END OF REPORT');
    console.log('='.repeat(80));
}

pullGHLSlots();
