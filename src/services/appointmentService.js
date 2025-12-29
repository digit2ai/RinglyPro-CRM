// Import models safely
let Appointment, Contact;
try {
    const models = require('../models');
    Appointment = models.Appointment;
    Contact = models.Contact;
    console.log('✅ Models imported for appointment service');
} catch (error) {
    console.log('⚠️ Models not available for appointment service:', error.message);
}

class AppointmentService {
    /**
     * Book a new appointment for a client
     * @param {string} clientId - The client ID
     * @param {object} appointmentData - Appointment details
     * @returns {object} Created appointment or error
     */
    async bookAppointment(clientId, appointmentData) {
        try {
            console.log(`🎯 Booking appointment for client ${clientId}:`, appointmentData);

            // Validate booking data
            const validationResult = this.validateBookingData(appointmentData);
            if (!validationResult.isValid) {
                throw new Error(`Validation failed: ${validationResult.errors.join(', ')}`);
            }

            // Check for duplicate bookings using raw SQL
            const duplicateCheck = await this.checkDuplicateBooking(
                clientId,
                appointmentData.appointment_date,
                appointmentData.appointment_time
            );

            if (duplicateCheck.exists) {
                throw new Error('Time slot already booked');
            }

            // Generate confirmation code
            const confirmationCode = this.generateConfirmationCode();

            // Check if client requires deposit - if so, set status to 'pending' instead of 'confirmed'
            let appointmentStatus = 'confirmed';
            let depositStatus = 'not_required';
            if (Appointment && Appointment.sequelize) {
                const clientCheck = await Appointment.sequelize.query(
                    `SELECT deposit_required FROM clients WHERE id = :clientId`,
                    {
                        replacements: { clientId },
                        type: Appointment.sequelize.QueryTypes.SELECT
                    }
                );
                if (clientCheck && clientCheck[0] && clientCheck[0].deposit_required) {
                    appointmentStatus = 'pending';
                    depositStatus = 'pending';
                    console.log(`📋 Client ${clientId} requires deposit - setting status to 'pending', deposit_status to 'pending'`);
                }
            }

            // Create appointment using raw SQL to avoid field mapping issues
            let appointment;

            if (Appointment && Appointment.sequelize) {
                const result = await Appointment.sequelize.query(
                    `INSERT INTO appointments (
                        client_id, customer_name, customer_phone, customer_email,
                        appointment_date, appointment_time, duration, purpose,
                        status, deposit_status, source, confirmation_code, reminder_sent, confirmation_sent,
                        created_at, updated_at
                    ) VALUES (
                        :clientId, :customerName, :customerPhone, :customerEmail,
                        :appointmentDate, :appointmentTime, :duration, :purpose,
                        :status, :depositStatus, :source, :confirmationCode, :reminderSent, :confirmationSent,
                        NOW(), NOW()
                    ) RETURNING *`,
                    {
                        replacements: {
                            clientId: clientId,
                            customerName: appointmentData.customer_name,
                            customerPhone: appointmentData.customer_phone,
                            customerEmail: appointmentData.customer_email || `phone.${appointmentData.customer_phone.replace(/\D/g, '')}@rachel.voice`,
                            appointmentDate: appointmentData.appointment_date,
                            appointmentTime: appointmentData.appointment_time,
                            duration: appointmentData.duration || 30,
                            purpose: appointmentData.purpose || 'Voice booking consultation',
                            status: appointmentStatus,
                            depositStatus: depositStatus,
                            source: appointmentData.source || 'voice_booking',
                            confirmationCode: confirmationCode,
                            reminderSent: false,
                            confirmationSent: false
                        },
                        type: Appointment.sequelize.QueryTypes.INSERT
                    }
                );

                appointment = result[0][0]; // PostgreSQL RETURNING result
                console.log(`✅ Appointment booked in database: ${appointment.id} (status: ${appointmentStatus})`);
            } else {
                // Fallback mock appointment
                appointment = {
                    id: Math.floor(Math.random() * 10000),
                    client_id: clientId,
                    customer_name: appointmentData.customer_name,
                    customer_phone: appointmentData.customer_phone,
                    customer_email: appointmentData.customer_email || `phone.${appointmentData.customer_phone.replace(/\D/g, '')}@rachel.voice`,
                    appointment_date: appointmentData.appointment_date,
                    appointment_time: appointmentData.appointment_time,
                    duration: appointmentData.duration || 30,
                    purpose: appointmentData.purpose || 'General consultation',
                    status: appointmentStatus,
                    source: appointmentData.source || 'voice_booking',
                    confirmation_code: confirmationCode,
                    created_at: new Date(),
                    updated_at: new Date()
                };

                console.log('✅ Mock appointment created:', appointment.id);
            }
            
            return {
                success: true,
                appointment: appointment,
                message: 'Appointment booked successfully'
            };

        } catch (error) {
            console.error('❌ Appointment booking failed:', error.message);
            
            return {
                success: false,
                error: error.message,
                appointment: null
            };
        }
    }

    /**
     * Check if appointment time slot is already booked using raw SQL
     * @param {string} clientId - Client ID
     * @param {string} date - Appointment date
     * @param {string} time - Appointment time
     * @returns {object} Duplicate check result
     */
    async checkDuplicateBooking(clientId, date, time) {
        try {
            if (Appointment && Appointment.sequelize) {
                const result = await Appointment.sequelize.query(
                    `SELECT COUNT(*) as count FROM appointments 
                     WHERE client_id = :clientId 
                     AND appointment_date = :date 
                     AND appointment_time = :time 
                     AND status != 'cancelled'`,
                    {
                        replacements: {
                            clientId: clientId,
                            date: date,
                            time: time
                        },
                        type: Appointment.sequelize.QueryTypes.SELECT
                    }
                );
                
                const count = parseInt(result[0].count);
                
                return {
                    exists: count > 0,
                    count: count
                };
            } else {
                // Fallback - assume no duplicates
                return {
                    exists: false,
                    count: 0
                };
            }
        } catch (error) {
            console.error('Error checking duplicate booking:', error.message);
            // Don't throw error, just return false to allow booking
            return {
                exists: false,
                count: 0
            };
        }
    }

    /**
     * Validate appointment booking data
     * @param {object} data - Appointment data to validate
     * @returns {object} Validation result
     */
    validateBookingData(data) {
        const errors = [];
        
        // Required fields check - using correct field names
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
     * Get appointment by ID using raw SQL
     * @param {string} appointmentId - Appointment ID
     * @returns {object} Appointment details
     */
    async getAppointment(appointmentId) {
        try {
            if (Appointment && Appointment.sequelize) {
                const result = await Appointment.sequelize.query(
                    `SELECT * FROM appointments WHERE id = :appointmentId`,
                    {
                        replacements: { appointmentId: appointmentId },
                        type: Appointment.sequelize.QueryTypes.SELECT
                    }
                );
                
                if (result.length === 0) {
                    return {
                        success: false,
                        error: 'Appointment not found'
                    };
                }
                
                return {
                    success: true,
                    appointment: result[0]
                };
            } else {
                return {
                    success: false,
                    error: 'Database not available'
                };
            }
        } catch (error) {
            console.error('Error fetching appointment:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Cancel an appointment using raw SQL
     * @param {string} appointmentId - Appointment ID
     * @returns {object} Cancellation result
     */
    async cancelAppointment(appointmentId) {
        try {
            if (Appointment && Appointment.sequelize) {
                const result = await Appointment.sequelize.query(
                    `UPDATE appointments 
                     SET status = 'cancelled', updated_at = NOW() 
                     WHERE id = :appointmentId 
                     RETURNING *`,
                    {
                        replacements: { appointmentId: appointmentId },
                        type: Appointment.sequelize.QueryTypes.UPDATE
                    }
                );
                
                if (result[0].length === 0) {
                    return {
                        success: false,
                        error: 'Appointment not found'
                    };
                }
                
                return {
                    success: true,
                    appointment: result[0][0],
                    message: 'Appointment cancelled successfully'
                };
            } else {
                return {
                    success: false,
                    error: 'Database not available'
                };
            }
        } catch (error) {
            console.error('Error cancelling appointment:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get appointments for a specific client using raw SQL
     * @param {string} clientId - Client ID
     * @param {object} options - Query options (status, date range, etc.)
     * @returns {object} Appointments list
     */
    async getClientAppointments(clientId, options = {}) {
        try {
            if (Appointment && Appointment.sequelize) {
                let whereClause = `WHERE client_id = :clientId`;
                const replacements = { clientId: clientId };
                
                // Add status filter if provided
                if (options.status) {
                    whereClause += ` AND status = :status`;
                    replacements.status = options.status;
                }
                
                // Add date range filter if provided
                if (options.fromDate) {
                    whereClause += ` AND appointment_date >= :fromDate`;
                    replacements.fromDate = options.fromDate;
                }
                
                if (options.toDate) {
                    whereClause += ` AND appointment_date <= :toDate`;
                    replacements.toDate = options.toDate;
                }
                
                let limitClause = '';
                if (options.limit) {
                    limitClause = ` LIMIT :limit`;
                    replacements.limit = options.limit;
                }
                
                const query = `SELECT * FROM appointments ${whereClause} 
                              ORDER BY appointment_date ASC, appointment_time ASC${limitClause}`;
                
                const appointments = await Appointment.sequelize.query(query, {
                    replacements: replacements,
                    type: Appointment.sequelize.QueryTypes.SELECT
                });
                
                return {
                    success: true,
                    appointments: appointments,
                    count: appointments.length
                };
            } else {
                return {
                    success: false,
                    error: 'Database not available',
                    appointments: []
                };
            }
        } catch (error) {
            console.error('Error fetching client appointments:', error.message);
            return {
                success: false,
                error: error.message,
                appointments: []
            };
        }
    }
}

module.exports = new AppointmentService();