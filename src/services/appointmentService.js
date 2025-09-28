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

            // Check for duplicate bookings
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

            // Create appointment using Sequelize - FIXED: Use camelCase field names
            let appointment;
            
            if (Appointment && Appointment.create) {
                appointment = await Appointment.create({
                    clientId: clientId,
                    customerName: appointmentData.customer_name,
                    customerPhone: appointmentData.customer_phone,
                    customerEmail: appointmentData.customer_email || `phone.${appointmentData.customer_phone.replace(/\D/g, '')}@rachel.voice`,
                    appointmentDate: appointmentData.appointment_date,
                    appointmentTime: appointmentData.appointment_time,
                    duration: appointmentData.duration || 30,
                    purpose: appointmentData.purpose || 'General consultation',
                    status: 'confirmed',
                    source: 'voice_booking',
                    confirmationCode: confirmationCode,
                    reminderSent: false,
                    confirmationSent: false
                });
                
                console.log('✅ Appointment booked in database:', appointment.id);
            } else {
                // Fallback mock appointment
                appointment = {
                    id: Math.floor(Math.random() * 10000),
                    clientId: clientId,
                    customerName: appointmentData.customer_name,
                    customerPhone: appointmentData.customer_phone,
                    customerEmail: appointmentData.customer_email || `phone.${appointmentData.customer_phone.replace(/\D/g, '')}@rachel.voice`,
                    appointmentDate: appointmentData.appointment_date,
                    appointmentTime: appointmentData.appointment_time,
                    duration: appointmentData.duration || 30,
                    purpose: appointmentData.purpose || 'General consultation',
                    status: 'confirmed',
                    source: 'voice_booking',
                    confirmationCode: confirmationCode,
                    createdAt: new Date(),
                    updatedAt: new Date()
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
     * Check if appointment time slot is already booked using Sequelize
     * @param {string} clientId - Client ID
     * @param {string} date - Appointment date
     * @param {string} time - Appointment time
     * @returns {object} Duplicate check result
     */
    async checkDuplicateBooking(clientId, date, time) {
        try {
            if (Appointment && Appointment.count) {
                const count = await Appointment.count({
                    where: {
                        clientId: clientId,
                        appointmentDate: date,
                        appointmentTime: time,
                        status: {
                            [Appointment.sequelize.Sequelize.Op.ne]: 'cancelled'
                        }
                    }
                });
                
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
     * Get appointment by ID using Sequelize
     * @param {string} appointmentId - Appointment ID
     * @returns {object} Appointment details
     */
    async getAppointment(appointmentId) {
        try {
            if (Appointment && Appointment.findByPk) {
                const appointment = await Appointment.findByPk(appointmentId);
                
                if (!appointment) {
                    return {
                        success: false,
                        error: 'Appointment not found'
                    };
                }
                
                return {
                    success: true,
                    appointment: appointment
                };
            } else {
                return {
                    success: false,
                    error: 'Appointment model not available'
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
     * Cancel an appointment using Sequelize
     * @param {string} appointmentId - Appointment ID
     * @returns {object} Cancellation result
     */
    async cancelAppointment(appointmentId) {
        try {
            if (Appointment && Appointment.findByPk) {
                const appointment = await Appointment.findByPk(appointmentId);
                
                if (!appointment) {
                    return {
                        success: false,
                        error: 'Appointment not found'
                    };
                }
                
                await appointment.update({
                    status: 'cancelled',
                    updatedAt: new Date()
                });
                
                return {
                    success: true,
                    appointment: appointment,
                    message: 'Appointment cancelled successfully'
                };
            } else {
                return {
                    success: false,
                    error: 'Appointment model not available'
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
     * Get appointments for a specific client using Sequelize
     * @param {string} clientId - Client ID
     * @param {object} options - Query options (status, date range, etc.)
     * @returns {object} Appointments list
     */
    async getClientAppointments(clientId, options = {}) {
        try {
            if (Appointment && Appointment.findAll) {
                const whereClause = {
                    clientId: clientId
                };
                
                // Add status filter if provided
                if (options.status) {
                    whereClause.status = options.status;
                }
                
                // Add date range filter if provided
                if (options.fromDate) {
                    whereClause.appointmentDate = {
                        [Appointment.sequelize.Sequelize.Op.gte]: options.fromDate
                    };
                }
                
                if (options.toDate) {
                    if (whereClause.appointmentDate) {
                        whereClause.appointmentDate[Appointment.sequelize.Sequelize.Op.lte] = options.toDate;
                    } else {
                        whereClause.appointmentDate = {
                            [Appointment.sequelize.Sequelize.Op.lte]: options.toDate
                        };
                    }
                }
                
                const queryOptions = {
                    where: whereClause,
                    order: [['appointmentDate', 'ASC'], ['appointmentTime', 'ASC']]
                };
                
                // Add limit if provided
                if (options.limit) {
                    queryOptions.limit = options.limit;
                }
                
                const appointments = await Appointment.findAll(queryOptions);
                
                return {
                    success: true,
                    appointments: appointments,
                    count: appointments.length
                };
            } else {
                return {
                    success: false,
                    error: 'Appointment model not available',
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