const db = require('../config/database');

class AppointmentService {
    /**
     * Book a new appointment for a client
     * @param {string} clientId - The client ID
     * @param {object} appointmentData - Appointment details
     * @returns {object} Created appointment or error
     */
    async bookAppointment(clientId, appointmentData) {
        const client = await db.getClient();
        
        try {
            await client.query('BEGIN');
            
            // Validate booking data
            const validationResult = this.validateBookingData(appointmentData);
            if (!validationResult.isValid) {
                throw new Error(`Validation failed: ${validationResult.errors.join(', ')}`);
            }

            // Check for duplicate bookings
            const duplicateCheck = await this.checkDuplicateBooking(
                clientId, 
                appointmentData.appointment_date, 
                appointmentData.appointment_time,
                client
            );
            
            if (duplicateCheck.exists) {
                throw new Error('Time slot already booked');
            }

            // Generate confirmation code
            const confirmationCode = this.generateConfirmationCode();

            // Create the appointment with ACTUAL database columns
            const insertQuery = `
                INSERT INTO appointments (
                    client_id, 
                    customer_name, 
                    customer_phone, 
                    customer_email,
                    appointment_date, 
                    appointment_time,
                    duration,
                    purpose,
                    status, 
                    source,
                    confirmation_code,
                    created_at,
                    updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
                RETURNING *
            `;

            const values = [
                clientId,
                appointmentData.customer_name,
                appointmentData.customer_phone,
                appointmentData.customer_email || null,
                appointmentData.appointment_date,
                appointmentData.appointment_time,
                appointmentData.duration || 30,
                appointmentData.purpose || 'General consultation',
                'confirmed', // Your database uses 'confirmed' as default
                'voice_booking', // Source is voice_booking for Rachel
                confirmationCode
            ];

            const result = await client.query(insertQuery, values);
            await client.query('COMMIT');
            
            console.log('✅ Appointment booked successfully:', result.rows[0]);
            
            return {
                success: true,
                appointment: result.rows[0],
                message: 'Appointment booked successfully'
            };

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('❌ Appointment booking failed:', error.message);
            
            return {
                success: false,
                error: error.message,
                appointment: null
            };
        } finally {
            client.release();
        }
    }

    /**
     * Validate appointment booking data
     * @param {object} data - Appointment data to validate
     * @returns {object} Validation result
     */
    validateBookingData(data) {
        const errors = [];
        
        // Required fields check - matching actual database columns
        if (!data.customer_name || data.customer_name.trim().length === 0) {
            errors.push('Customer name is required');
        }
        
        if (!data.customer_phone || data.customer_phone.trim().length === 0) {
            errors.push('Customer phone is required');
        }
        
        if (!data.appointment_date) {
            errors.push('Appointment date is required');
        }
        
        if (!data.appointment_time) {
            errors.push('Appointment time is required');
        }

        // Phone number format validation (basic)
        if (data.customer_phone && !this.isValidPhoneFormat(data.customer_phone)) {
            errors.push('Invalid phone number format');
        }

        // Email validation (optional but if provided must be valid)
        if (data.customer_email && !this.isValidEmail(data.customer_email)) {
            errors.push('Invalid email format');
        }

        // Duration validation (must be positive)
        if (data.duration && (data.duration < 15 || data.duration > 180)) {
            errors.push('Duration must be between 15 and 180 minutes');
        }

        // Date validation (not in the past)
        if (data.appointment_date && data.appointment_time) {
            const appointmentDateTime = new Date(`${data.appointment_date}T${data.appointment_time}`);
            const now = new Date();
            
            if (appointmentDateTime < now) {
                errors.push('Appointment cannot be scheduled in the past');
            }
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Check if appointment time slot is already booked
     * @param {string} clientId - Client ID
     * @param {string} date - Appointment date
     * @param {string} time - Appointment time
     * @param {object} client - Database client
     * @returns {object} Duplicate check result
     */
    async checkDuplicateBooking(clientId, date, time, client) {
        try {
            const query = `
                SELECT COUNT(*) as count
                FROM appointments 
                WHERE client_id = $1 
                AND appointment_date = $2 
                AND appointment_time = $3 
                AND status NOT IN ('cancelled')
            `;
            
            const result = await client.query(query, [clientId, date, time]);
            const count = parseInt(result.rows[0].count);
            
            return {
                exists: count > 0,
                count: count
            };
        } catch (error) {
            console.error('Error checking duplicate booking:', error.message);
            throw new Error('Unable to verify appointment availability');
        }
    }

    /**
     * Basic phone number format validation
     * @param {string} phone - Phone number to validate
     * @returns {boolean} Valid format
     */
    isValidPhoneFormat(phone) {
        // Remove all non-digit characters
        const digitsOnly = phone.replace(/\D/g, '');
        
        // Check if it's 10 or 11 digits (US format)
        return digitsOnly.length >= 10 && digitsOnly.length <= 11;
    }

    /**
     * Email format validation
     * @param {string} email - Email to validate
     * @returns {boolean} Valid format
     */
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Generate confirmation code
     * @returns {string} Random confirmation code
     */
    generateConfirmationCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 8; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    /**
     * Get appointment by ID
     * @param {string} appointmentId - Appointment ID
     * @returns {object} Appointment details
     */
    async getAppointment(appointmentId) {
        const client = await db.getClient();
        
        try {
            const query = `
                SELECT a.*, c.business_name, c.ringlypro_number
                FROM appointments a
                JOIN clients c ON a.client_id = c.id
                WHERE a.id = $1
            `;
            
            const result = await client.query(query, [appointmentId]);
            
            if (result.rows.length === 0) {
                return {
                    success: false,
                    error: 'Appointment not found'
                };
            }
            
            return {
                success: true,
                appointment: result.rows[0]
            };
        } catch (error) {
            console.error('Error fetching appointment:', error.message);
            return {
                success: false,
                error: error.message
            };
        } finally {
            client.release();
        }
    }

    /**
     * Cancel an appointment
     * @param {string} appointmentId - Appointment ID
     * @returns {object} Cancellation result
     */
    async cancelAppointment(appointmentId) {
        const client = await db.getClient();
        
        try {
            const query = `
                UPDATE appointments 
                SET status = 'cancelled', updated_at = NOW()
                WHERE id = $1 
                RETURNING *
            `;
            
            const result = await client.query(query, [appointmentId]);
            
            if (result.rows.length === 0) {
                return {
                    success: false,
                    error: 'Appointment not found'
                };
            }
            
            return {
                success: true,
                appointment: result.rows[0],
                message: 'Appointment cancelled successfully'
            };
        } catch (error) {
            console.error('Error cancelling appointment:', error.message);
            return {
                success: false,
                error: error.message
            };
        } finally {
            client.release();
        }
    }

    /**
     * Get appointments for a specific client
     * @param {string} clientId - Client ID
     * @param {object} options - Query options (status, date range, etc.)
     * @returns {object} Appointments list
     */
    async getClientAppointments(clientId, options = {}) {
        const client = await db.getClient();
        
        try {
            let query = `
                SELECT * FROM appointments 
                WHERE client_id = $1
            `;
            const params = [clientId];
            
            // Add status filter if provided
            if (options.status) {
                query += ` AND status = ${params.length + 1}`;
                params.push(options.status);
            }
            
            // Add date range filter if provided
            if (options.fromDate) {
                query += ` AND appointment_date >= ${params.length + 1}`;
                params.push(options.fromDate);
            }
            
            if (options.toDate) {
                query += ` AND appointment_date <= ${params.length + 1}`;
                params.push(options.toDate);
            }
            
            query += ` ORDER BY appointment_date, appointment_time`;
            
            // Add limit if provided
            if (options.limit) {
                query += ` LIMIT ${params.length + 1}`;
                params.push(options.limit);
            }
            
            const result = await client.query(query, params);
            
            return {
                success: true,
                appointments: result.rows,
                count: result.rows.length
            };
        } catch (error) {
            console.error('Error fetching client appointments:', error.message);
            return {
                success: false,
                error: error.message,
                appointments: []
            };
        } finally {
            client.release();
        }
    }
}
}

module.exports = new AppointmentService();