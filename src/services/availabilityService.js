const moment = require('moment-timezone');

class AvailabilityService {
    constructor() {
        // Default business hours
        this.defaultBusinessHours = {
            start: '09:00',
            end: '17:00',
            days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
        };
    }

    /**
     * Get available appointment slots for a client
     * @param {number} clientId - Client ID
     * @param {string} date - Date in YYYY-MM-DD format (optional, defaults to next 7 days)
     * @param {number} duration - Appointment duration in minutes (default 30)
     * @returns {Promise<Array>} Array of available time slots
     */
    async getAvailableSlots(clientId, date = null, duration = 30) {
        try {
            const db = require('../config/database');
            const client = await db.getClient();
            
            // Get client's business hours and timezone
            const clientQuery = await client.query(
                'SELECT business_hours_start, business_hours_end, timezone, appointment_duration FROM clients WHERE id = $1',
                [clientId]
            );

            if (clientQuery.rows.length === 0) {
                client.release();
                throw new Error('Client not found');
            }

            const clientData = clientQuery.rows[0];
            const timezone = clientData.timezone || 'America/New_York';
            const startTime = clientData.business_hours_start || '09:00:00';
            const endTime = clientData.business_hours_end || '17:00:00';
            const appointmentDuration = clientData.appointment_duration || 30;

            // If no specific date provided, generate slots for next 7 days
            const datesToCheck = date ? [date] : this.getNextSevenBusinessDays(timezone);
            
            const availableSlots = [];

            for (const checkDate of datesToCheck) {
                // Get existing appointments for this date
                const existingAppointments = await client.query(
                    `SELECT appointment_time, duration 
                     FROM appointments 
                     WHERE client_id = $1 
                     AND appointment_date = $2 
                     AND status IN ('confirmed', 'scheduled')
                     ORDER BY appointment_time`,
                    [clientId, checkDate]
                );

                // Generate time slots for this date
                const daySlots = this.generateTimeSlotsForDate(
                    checkDate,
                    startTime,
                    endTime,
                    appointmentDuration,
                    existingAppointments.rows,
                    timezone
                );

                availableSlots.push(...daySlots);
            }

            client.release();
            return availableSlots;

        } catch (error) {
            console.error('Error getting available slots:', error);
            throw error;
        }
    }

    /**
     * Generate time slots for a specific date
     */
    generateTimeSlotsForDate(date, startTime, endTime, duration, existingAppointments, timezone) {
        const slots = [];
        const dateStr = moment(date).format('YYYY-MM-DD');
        
        // Convert business hours to minutes
        const [startHour, startMin] = startTime.split(':').map(Number);
        const [endHour, endMin] = endTime.split(':').map(Number);
        
        const startMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;

        // Generate slots every 30 minutes
        for (let minutes = startMinutes; minutes < endMinutes; minutes += 30) {
            const slotHour = Math.floor(minutes / 60);
            const slotMin = minutes % 60;
            const timeStr = `${slotHour.toString().padStart(2, '0')}:${slotMin.toString().padStart(2, '0')}:00`;
            
            // Check if this slot conflicts with existing appointments
            const hasConflict = existingAppointments.some(apt => {
                const aptTime = apt.appointment_time;
                const aptDuration = apt.duration || 30;
                
                // Convert appointment time to minutes
                const [aptHour, aptMin] = aptTime.split(':').map(Number);
                const aptStartMinutes = aptHour * 60 + aptMin;
                const aptEndMinutes = aptStartMinutes + aptDuration;
                
                // Check for overlap
                const slotEndMinutes = minutes + duration;
                return (minutes < aptEndMinutes && slotEndMinutes > aptStartMinutes);
            });

            if (!hasConflict) {
                // Format time for display
                const displayTime = moment(`${dateStr} ${timeStr}`, 'YYYY-MM-DD HH:mm:ss')
                    .tz(timezone)
                    .format('h:mm A');
                
                const displayDate = moment(dateStr).format('dddd, MMMM Do');

                slots.push({
                    date: dateStr,
                    time: timeStr,
                    displayDate: displayDate,
                    displayTime: displayTime,
                    datetime: `${dateStr} ${timeStr}`,
                    available: true
                });
            }
        }

        return slots;
    }

    /**
     * Get next 7 business days (Mon-Fri)
     */
    getNextSevenBusinessDays(timezone = 'America/New_York') {
        const dates = [];
        let currentDate = moment().tz(timezone).startOf('day');
        
        while (dates.length < 7) {
            // Skip weekends
            if (currentDate.day() !== 0 && currentDate.day() !== 6) {
                dates.push(currentDate.format('YYYY-MM-DD'));
            }
            currentDate.add(1, 'day');
        }

        return dates;
    }

    /**
     * Check if a specific time slot is available
     */
    async isSlotAvailable(clientId, date, time, duration = 30) {
        try {
            const db = require('../config/database');
            const client = await db.getClient();
            
            const conflicts = await client.query(
                `SELECT id FROM appointments 
                 WHERE client_id = $1 
                 AND appointment_date = $2 
                 AND status IN ('confirmed', 'scheduled')
                 AND (
                     (appointment_time <= $3 AND appointment_time + INTERVAL '1 minute' * duration > $3) OR
                     (appointment_time < $3 + INTERVAL '1 minute' * $4 AND appointment_time >= $3)
                 )`,
                [clientId, date, time, duration]
            );

            client.release();
            return conflicts.rows.length === 0;

        } catch (error) {
            console.error('Error checking slot availability:', error);
            return false;
        }
    }
}

module.exports = new AvailabilityService();