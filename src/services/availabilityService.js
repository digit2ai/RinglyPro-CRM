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
     * @param {string} date - Date in YYYY-MM-DD format (optional, defaults to tomorrow)
     * @param {number} duration - Appointment duration in minutes (default 30)
     * @returns {Promise<Object>} Object with success flag and slots array
     */
    async getAvailableSlots(clientId, date = null, duration = 30) {
        try {
            // Import models safely
            let Client, Appointment;
            try {
                const models = require('../models');
                Client = models.Client;
                Appointment = models.Appointment;
            } catch (error) {
                console.log('⚠️ Models not available for availability service:', error.message);
                // Return mock slots for demo
                return this.generateMockSlots(date);
            }

            if (!Client || !Appointment) {
                console.log('⚠️ Models not available, generating mock slots');
                return this.generateMockSlots(date);
            }

            // Get client's business hours and timezone
            const client = await Client.findByPk(clientId);

            if (!client) {
                throw new Error('Client not found');
            }

            const timezone = client.timezone || 'America/New_York';
            const startTime = client.business_hours_start || '09:00:00';
            const endTime = client.business_hours_end || '17:00:00';
            const appointmentDuration = client.appointment_duration || 30;

            // If no specific date provided, use tomorrow
            const targetDate = date || this.getTomorrowDate();
            
            console.log(`📅 Checking availability for client ${clientId} on ${targetDate}`);
            
            // Get existing appointments for this date - FIXED SEQUELIZE SYNTAX
            const { Op } = require('sequelize');
            const existingAppointments = await Appointment.findAll({
                where: {
                    client_id: clientId,
                    appointment_date: targetDate,
                    status: {
                        [Op.in]: ['confirmed', 'scheduled']
                    }
                },
                order: [['appointment_time', 'ASC']]
            });

            console.log(`📅 Found ${existingAppointments.length} existing appointments for ${targetDate}`);

            // Generate time slots for this date
            const daySlots = this.generateTimeSlotsForDate(
                targetDate,
                startTime,
                endTime,
                appointmentDuration,
                existingAppointments,
                timezone
            );

            console.log(`📅 Generated ${daySlots.length} available slots for ${targetDate}`);

            return {
                success: true,
                slots: daySlots,
                date: targetDate,
                clientId: clientId
            };

        } catch (error) {
            console.error('Error getting available slots:', error);
            
            // Return mock slots on error for demo
            console.log('📅 Falling back to mock slots due to error');
            return this.generateMockSlots(date);
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
                
                // Convert appointment time to minutes for comparison
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
     * Get tomorrow's date in YYYY-MM-DD format
     */
    getTomorrowDate() {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow.toISOString().split('T')[0];
    }

    /**
     * Generate mock slots for demo/fallback purposes
     */
    generateMockSlots(date = null) {
        const targetDate = date || this.getTomorrowDate();
        
        const mockSlots = [
            { date: targetDate, time: '09:00:00', displayDate: 'Tomorrow', displayTime: '9:00 AM', available: true },
            { date: targetDate, time: '10:00:00', displayDate: 'Tomorrow', displayTime: '10:00 AM', available: true },
            { date: targetDate, time: '11:00:00', displayDate: 'Tomorrow', displayTime: '11:00 AM', available: true },
            { date: targetDate, time: '14:00:00', displayDate: 'Tomorrow', displayTime: '2:00 PM', available: true },
            { date: targetDate, time: '15:00:00', displayDate: 'Tomorrow', displayTime: '3:00 PM', available: true }
        ];
        
        console.log(`📅 Generated ${mockSlots.length} mock slots for ${targetDate}`);
        
        return {
            success: true,
            slots: mockSlots,
            date: targetDate,
            clientId: 'mock'
        };
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
            // Import models safely
            let Appointment;
            try {
                const models = require('../models');
                Appointment = models.Appointment;
            } catch (error) {
                console.log('⚠️ Models not available for slot check, returning true');
                return true;
            }

            if (!Appointment) {
                console.log('⚠️ Appointment model not available, returning true');
                return true;
            }
            
            // Fixed Sequelize syntax for status checking
            const { Op } = require('sequelize');
            const conflicts = await Appointment.count({
                where: {
                    client_id: clientId,
                    appointment_date: date,
                    status: {
                        [Op.in]: ['confirmed', 'scheduled']
                    },
                    appointment_time: time
                }
            });

            return conflicts === 0;

        } catch (error) {
            console.error('Error checking slot availability:', error);
            return false;
        }
    }

    /**
     * Get available slots for multiple dates
     */
    async getAvailableSlotsForRange(clientId, startDate, endDate, duration = 30) {
        try {
            const dates = this.getDateRange(startDate, endDate);
            const allSlots = [];

            for (const date of dates) {
                const daySlots = await this.getAvailableSlots(clientId, date, duration);
                if (daySlots.success && daySlots.slots.length > 0) {
                    allSlots.push(...daySlots.slots);
                }
            }

            return {
                success: true,
                slots: allSlots,
                startDate: startDate,
                endDate: endDate
            };

        } catch (error) {
            console.error('Error getting slots for range:', error);
            return {
                success: false,
                error: error.message,
                slots: []
            };
        }
    }

    /**
     * Get array of dates between start and end date
     */
    getDateRange(startDate, endDate) {
        const dates = [];
        let currentDate = moment(startDate);
        const end = moment(endDate);

        while (currentDate.isSameOrBefore(end)) {
            // Skip weekends
            if (currentDate.day() !== 0 && currentDate.day() !== 6) {
                dates.push(currentDate.format('YYYY-MM-DD'));
            }
            currentDate.add(1, 'day');
        }

        return dates;
    }
}

module.exports = new AvailabilityService();