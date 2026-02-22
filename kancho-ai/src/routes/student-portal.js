// kancho-ai/src/routes/student-portal.js
// Student-facing data endpoints (all require student auth middleware)

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');

module.exports = (models) => {
  const { KanchoStudent, KanchoClass, KanchoAttendance, KanchoClassEnrollment, KanchoRevenue, KanchoSchool, KanchoMerchandise } = models;

  // GET /dashboard - Dashboard summary
  router.get('/dashboard', async (req, res) => {
    try {
      if (!req.studentId) {
        return res.json({
          success: true,
          data: { pending: true, message: 'Your account is pending approval.' }
        });
      }

      const student = await KanchoStudent.findByPk(req.studentId, {
        attributes: ['id', 'first_name', 'last_name', 'belt_rank', 'belt_stripes',
          'attendance_streak', 'total_classes', 'payment_status', 'last_payment_date',
          'membership_type', 'monthly_rate', 'enrollment_date']
      });

      if (!student) {
        return res.status(404).json({ success: false, error: 'Student record not found' });
      }

      // Get today's classes (all school classes for today)
      const today = new Date();
      const dayAbbrevs = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
      const dayFulls = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const todayAbbrev = dayAbbrevs[today.getDay()];
      const todayFull = dayFulls[today.getDay()];

      // Helper: check if a day string matches today (handles Mon, Monday, monday, etc.)
      function matchesDay(d) {
        const dl = d.toLowerCase().slice(0, 3);
        return dl === todayAbbrev;
      }

      const allClasses = await KanchoClass.findAll({
        where: { school_id: req.schoolId, is_active: { [Op.ne]: false } },
        attributes: ['id', 'name', 'schedule', 'duration_minutes', 'instructor']
      });

      const todayClasses = allClasses
        .filter(c => c.schedule)
        .filter(c => {
          const sched = c.schedule;
          if (Array.isArray(sched)) return sched.some(s => matchesDay(s.day || ''));
          if (sched.days) return sched.days.some(d => matchesDay(d));
          return false;
        })
        .map(c => ({
          id: c.id,
          name: c.name,
          schedule: c.schedule,
          durationMinutes: c.duration_minutes,
          instructor: c.instructor
        }));

      // Check if already checked in today
      const todayStr = today.toISOString().split('T')[0];
      const todayAttendance = await KanchoAttendance.findAll({
        where: { student_id: req.studentId, date: todayStr },
        attributes: ['id', 'class_id', 'status'],
        raw: true
      });

      // Recent payments
      const recentPayment = await KanchoRevenue.findOne({
        where: { student_id: req.studentId },
        order: [['date', 'DESC']],
        attributes: ['amount', 'date', 'type']
      });

      res.json({
        success: true,
        data: {
          student: {
            firstName: student.first_name,
            lastName: student.last_name,
            beltRank: student.belt_rank,
            beltStripes: student.belt_stripes,
            attendanceStreak: student.attendance_streak,
            totalClasses: student.total_classes,
            paymentStatus: student.payment_status,
            lastPaymentDate: student.last_payment_date,
            membershipType: student.membership_type,
            monthlyRate: student.monthly_rate,
            enrollmentDate: student.enrollment_date
          },
          todayClasses,
          todayAttendance,
          recentPayment: recentPayment ? {
            amount: recentPayment.amount,
            date: recentPayment.date,
            type: recentPayment.type
          } : null
        }
      });
    } catch (error) {
      console.error('Student dashboard error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /attendance/check-in - Self check-in
  router.post('/attendance/check-in', async (req, res) => {
    try {
      if (!req.studentId) {
        return res.status(403).json({ success: false, error: 'Account not linked to student record' });
      }

      const { class_id } = req.body;
      const today = new Date().toISOString().split('T')[0];

      // Check duplicate
      const existingWhere = { school_id: req.schoolId, student_id: req.studentId, date: today };
      if (class_id) existingWhere.class_id = class_id;
      else existingWhere.class_id = null;

      const existing = await KanchoAttendance.findOne({ where: existingWhere });
      if (existing) {
        return res.status(409).json({ success: false, error: 'Already checked in for this class today' });
      }

      const record = await KanchoAttendance.create({
        school_id: req.schoolId,
        student_id: req.studentId,
        class_id: class_id || null,
        date: today,
        checked_in_at: new Date(),
        status: 'present',
        recorded_by: 'student_portal'
      });

      // Update student aggregates
      const totalPresent = await KanchoAttendance.count({
        where: { student_id: req.studentId, status: { [Op.in]: ['present', 'late'] } }
      });

      // Simple streak: count recent consecutive attendance days
      const recentRecords = await KanchoAttendance.findAll({
        where: { student_id: req.studentId, status: { [Op.in]: ['present', 'late'] } },
        attributes: ['date'],
        order: [['date', 'DESC']],
        raw: true
      });

      let streak = 0;
      if (recentRecords.length > 0) {
        const uniqueDates = [...new Set(recentRecords.map(r => r.date))];
        const now = new Date();
        const todayStr2 = now.toISOString().split('T')[0];
        const yesterdayStr = new Date(now.getTime() - 86400000).toISOString().split('T')[0];
        if (uniqueDates[0] === todayStr2 || uniqueDates[0] === yesterdayStr) {
          streak = 1;
          for (let i = 1; i < uniqueDates.length; i++) {
            const prev = new Date(uniqueDates[i - 1]);
            const curr = new Date(uniqueDates[i]);
            const diffDays = (prev - curr) / 86400000;
            if (diffDays <= 3) streak++;
            else break;
          }
        }
      }

      await KanchoStudent.update(
        { last_attendance: new Date(), total_classes: totalPresent, attendance_streak: streak },
        { where: { id: req.studentId } }
      );

      res.status(201).json({
        success: true,
        data: record,
        streak,
        totalClasses: totalPresent
      });
    } catch (error) {
      console.error('Student check-in error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /attendance/history - Own attendance history
  router.get('/attendance/history', async (req, res) => {
    try {
      if (!req.studentId) {
        return res.json({ success: true, data: [] });
      }

      const records = await KanchoAttendance.findAll({
        where: { student_id: req.studentId },
        include: [{ model: KanchoClass, as: 'class', attributes: ['id', 'name'] }],
        order: [['date', 'DESC']],
        limit: 50
      });

      res.json({ success: true, data: records });
    } catch (error) {
      console.error('Student attendance history error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /classes - All active classes at their school
  router.get('/classes', async (req, res) => {
    try {
      const classes = await KanchoClass.findAll({
        where: { school_id: req.schoolId, is_active: { [Op.ne]: false } },
        attributes: ['id', 'name', 'description', 'program_type', 'martial_art', 'level',
          'schedule', 'duration_minutes', 'capacity', 'instructor', 'average_attendance', 'price'],
        order: [['name', 'ASC']]
      });

      // Get enrollment status for this student
      let enrolledIds = [];
      if (req.studentId) {
        const enrollments = await KanchoClassEnrollment.findAll({
          where: { student_id: req.studentId, status: 'active' },
          attributes: ['class_id'],
          raw: true
        });
        enrolledIds = enrollments.map(e => e.class_id);
      }

      const result = classes.map(c => ({
        ...c.toJSON(),
        enrolled: enrolledIds.includes(c.id)
      }));

      res.json({ success: true, data: result });
    } catch (error) {
      console.error('Student classes error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /classes/:id/enroll
  router.post('/classes/:id/enroll', async (req, res) => {
    try {
      if (!req.studentId) {
        return res.status(403).json({ success: false, error: 'Account not linked to student record' });
      }

      const classId = parseInt(req.params.id, 10);
      const cls = await KanchoClass.findOne({ where: { id: classId, school_id: req.schoolId } });
      if (!cls) return res.status(404).json({ success: false, error: 'Class not found' });

      const existing = await KanchoClassEnrollment.findOne({
        where: { student_id: req.studentId, class_id: classId }
      });

      if (existing) {
        if (existing.status === 'active') {
          return res.status(409).json({ success: false, error: 'Already enrolled in this class' });
        }
        // Re-enroll (was dropped)
        await existing.update({ status: 'active', enrolled_at: new Date() });
        return res.json({ success: true, message: 'Re-enrolled in class', data: existing });
      }

      const enrollment = await KanchoClassEnrollment.create({
        school_id: req.schoolId,
        student_id: req.studentId,
        class_id: classId,
        status: 'active'
      });

      res.status(201).json({ success: true, message: 'Enrolled successfully', data: enrollment });
    } catch (error) {
      console.error('Student enroll error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /classes/:id/drop
  router.post('/classes/:id/drop', async (req, res) => {
    try {
      if (!req.studentId) {
        return res.status(403).json({ success: false, error: 'Account not linked to student record' });
      }

      const classId = parseInt(req.params.id, 10);
      const enrollment = await KanchoClassEnrollment.findOne({
        where: { student_id: req.studentId, class_id: classId, status: 'active' }
      });

      if (!enrollment) {
        return res.status(404).json({ success: false, error: 'Not enrolled in this class' });
      }

      await enrollment.update({ status: 'dropped' });

      res.json({ success: true, message: 'Dropped from class' });
    } catch (error) {
      console.error('Student drop error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /classes/my - My enrolled classes
  router.get('/classes/my', async (req, res) => {
    try {
      if (!req.studentId) {
        return res.json({ success: true, data: [] });
      }

      const enrollments = await KanchoClassEnrollment.findAll({
        where: { student_id: req.studentId, status: 'active' },
        include: [{
          model: KanchoClass, as: 'class',
          attributes: ['id', 'name', 'description', 'schedule', 'duration_minutes', 'instructor', 'level', 'program_type']
        }],
        order: [['enrolled_at', 'DESC']]
      });

      res.json({ success: true, data: enrollments });
    } catch (error) {
      console.error('Student my classes error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /payments - Payment history
  router.get('/payments', async (req, res) => {
    try {
      if (!req.studentId) {
        return res.json({ success: true, data: [] });
      }

      const payments = await KanchoRevenue.findAll({
        where: { student_id: req.studentId },
        order: [['date', 'DESC']],
        limit: 50
      });

      res.json({ success: true, data: payments });
    } catch (error) {
      console.error('Student payments error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /profile - Full profile
  router.get('/profile', async (req, res) => {
    try {
      if (!req.studentId) {
        return res.status(403).json({ success: false, error: 'Account not linked to student record' });
      }

      const student = await KanchoStudent.findByPk(req.studentId);
      if (!student) return res.status(404).json({ success: false, error: 'Student not found' });

      res.json({ success: true, data: student });
    } catch (error) {
      console.error('Student profile error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // PUT /profile - Update profile
  router.put('/profile', async (req, res) => {
    try {
      if (!req.studentId) {
        return res.status(403).json({ success: false, error: 'Account not linked to student record' });
      }

      const allowedFields = ['phone', 'email', 'emergency_contact', 'parent_guardian', 'date_of_birth'];
      const updates = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) updates[field] = req.body[field];
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ success: false, error: 'No valid fields to update' });
      }

      await KanchoStudent.update(updates, { where: { id: req.studentId } });

      // Also update auth email/phone if changed
      const authUpdates = {};
      if (updates.email) authUpdates.email = updates.email;
      if (updates.phone) authUpdates.phone = updates.phone;
      if (Object.keys(authUpdates).length > 0) {
        await models.KanchoStudentAuth.update(authUpdates, { where: { id: req.studentAuthId } });
      }

      const student = await KanchoStudent.findByPk(req.studentId);
      res.json({ success: true, data: student });
    } catch (error) {
      console.error('Student profile update error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /merchandise - School merchandise store
  router.get('/merchandise', async (req, res) => {
    try {
      const items = await KanchoMerchandise.findAll({
        where: { school_id: req.schoolId, in_stock: true },
        order: [['sort_order', 'ASC'], ['category', 'ASC'], ['name', 'ASC']]
      });

      res.json({ success: true, data: items });
    } catch (error) {
      console.error('Student merchandise error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
};
