// kancho-ai/src/routes/attendance.js
// Attendance tracking routes for Kancho AI

const express = require('express');
const router = express.Router();
const { Op, fn, col } = require('sequelize');

module.exports = (models) => {
  const { KanchoAttendance, KanchoStudent, KanchoClass, KanchoSchool } = models;

  // GET /api/v1/attendance - List attendance records
  router.get('/', async (req, res) => {
    try {
      const { school_id, student_id, class_id, date, date_from, date_to, limit = 50, offset = 0 } = req.query;

      if (!school_id) {
        return res.status(400).json({ error: 'school_id required' });
      }

      const where = { school_id };
      if (student_id) where.student_id = student_id;
      if (class_id) where.class_id = class_id;
      if (date) {
        where.date = date;
      } else if (date_from || date_to) {
        where.date = {};
        if (date_from) where.date[Op.gte] = date_from;
        if (date_to) where.date[Op.lte] = date_to;
      }

      const result = await KanchoAttendance.findAndCountAll({
        where,
        include: [
          { model: KanchoStudent, as: 'student', attributes: ['id', 'first_name', 'last_name', 'belt_rank'] },
          { model: KanchoClass, as: 'class', attributes: ['id', 'name'] }
        ],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['date', 'DESC'], ['checked_in_at', 'DESC']]
      });

      res.json({
        success: true,
        data: result.rows,
        total: result.count,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    } catch (error) {
      console.error('Error fetching attendance:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/v1/attendance/class-roster - Get students with check-in status for a class+date
  router.get('/class-roster', async (req, res) => {
    try {
      const { school_id, class_id, date } = req.query;

      if (!school_id) {
        return res.status(400).json({ error: 'school_id required' });
      }

      const today = date || new Date().toISOString().split('T')[0];

      // Get all active students for this school
      const students = await KanchoStudent.findAll({
        where: { school_id, status: 'active' },
        attributes: ['id', 'first_name', 'last_name', 'belt_rank', 'attendance_streak', 'total_classes'],
        order: [['last_name', 'ASC'], ['first_name', 'ASC']],
        raw: true
      });

      // Get existing check-ins for this date (and class if specified)
      const attendanceWhere = { school_id, date: today };
      if (class_id) attendanceWhere.class_id = class_id;

      const existing = await KanchoAttendance.findAll({
        where: attendanceWhere,
        attributes: ['student_id', 'status', 'id'],
        raw: true
      });

      const checkedInMap = {};
      existing.forEach(a => { checkedInMap[a.student_id] = { status: a.status, attendance_id: a.id }; });

      // Merge
      const roster = students.map(s => ({
        ...s,
        checked_in: !!checkedInMap[s.id],
        attendance_status: checkedInMap[s.id]?.status || null,
        attendance_id: checkedInMap[s.id]?.attendance_id || null
      }));

      res.json({ success: true, data: roster, date: today });
    } catch (error) {
      console.error('Error fetching class roster:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/v1/attendance/student/:id/history - Attendance history for one student
  router.get('/student/:id/history', async (req, res) => {
    try {
      const records = await KanchoAttendance.findAll({
        where: { student_id: req.params.id },
        include: [
          { model: KanchoClass, as: 'class', attributes: ['id', 'name'] }
        ],
        order: [['date', 'DESC']],
        limit: 30
      });

      res.json({ success: true, data: records });
    } catch (error) {
      console.error('Error fetching student attendance history:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Helper: recalculate student attendance aggregates
  async function updateStudentAggregates(studentId) {
    const total = await KanchoAttendance.count({
      where: { student_id: studentId, status: { [Op.in]: ['present', 'late'] } }
    });

    // Calculate streak: count consecutive days with attendance from today backwards
    const records = await KanchoAttendance.findAll({
      where: { student_id: studentId, status: { [Op.in]: ['present', 'late'] } },
      attributes: ['date'],
      order: [['date', 'DESC']],
      raw: true
    });

    let streak = 0;
    if (records.length > 0) {
      const uniqueDates = [...new Set(records.map(r => r.date))];
      // Check if most recent is today or yesterday (allow 1-day gap for weekends)
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const yesterdayStr = new Date(now.getTime() - 86400000).toISOString().split('T')[0];

      if (uniqueDates[0] === todayStr || uniqueDates[0] === yesterdayStr) {
        streak = 1;
        for (let i = 1; i < uniqueDates.length; i++) {
          const prev = new Date(uniqueDates[i - 1]);
          const curr = new Date(uniqueDates[i]);
          const diffDays = (prev - curr) / 86400000;
          // Allow gaps up to 3 days (weekends/holidays)
          if (diffDays <= 3) {
            streak++;
          } else {
            break;
          }
        }
      }
    }

    await KanchoStudent.update(
      { last_attendance: new Date(), total_classes: total, attendance_streak: streak },
      { where: { id: studentId } }
    );
  }

  // Helper: update class average_attendance and fill_rate
  async function updateClassAggregates(classId) {
    if (!classId) return;

    const classObj = await KanchoClass.findByPk(classId, { raw: true });
    if (!classObj) return;

    // Count distinct dates with attendance for this class
    const dates = await KanchoAttendance.findAll({
      where: { class_id: classId },
      attributes: [[fn('DISTINCT', col('date')), 'date']],
      raw: true
    });

    if (dates.length === 0) return;

    // Total check-ins / number of class sessions
    const totalCheckins = await KanchoAttendance.count({
      where: { class_id: classId, status: { [Op.in]: ['present', 'late'] } }
    });

    const avgAttendance = Math.round((totalCheckins / dates.length) * 100) / 100;
    const fillRate = classObj.capacity > 0 ? Math.round((avgAttendance / classObj.capacity) * 10000) / 100 : 0;

    await KanchoClass.update(
      { average_attendance: avgAttendance, fill_rate: fillRate },
      { where: { id: classId } }
    );
  }

  // POST /api/v1/attendance/check-in - Single student check-in
  router.post('/check-in', async (req, res) => {
    try {
      const { school_id, student_id, class_id, date, status } = req.body;

      if (!school_id || !student_id) {
        return res.status(400).json({ error: 'school_id and student_id required' });
      }

      const checkDate = date || new Date().toISOString().split('T')[0];

      // Check for duplicate
      const existingWhere = { school_id, student_id, date: checkDate };
      if (class_id) existingWhere.class_id = class_id;
      else existingWhere.class_id = null;

      const existing = await KanchoAttendance.findOne({ where: existingWhere });
      if (existing) {
        return res.status(409).json({ error: 'Student already checked in for this class/date' });
      }

      const record = await KanchoAttendance.create({
        school_id,
        student_id,
        class_id: class_id || null,
        date: checkDate,
        checked_in_at: new Date(),
        status: status || 'present',
        recorded_by: 'quick'
      });

      // Update aggregates
      await updateStudentAggregates(student_id);
      if (class_id) await updateClassAggregates(class_id);

      res.status(201).json({ success: true, data: record });
    } catch (error) {
      console.error('Error checking in student:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/v1/attendance/bulk-check-in - Bulk check-in for a class
  router.post('/bulk-check-in', async (req, res) => {
    try {
      const { school_id, class_id, date, student_ids, status } = req.body;

      if (!school_id || !student_ids || !student_ids.length) {
        return res.status(400).json({ error: 'school_id and student_ids required' });
      }

      const checkDate = date || new Date().toISOString().split('T')[0];
      const checkStatus = status || 'present';
      const created = [];
      const skipped = [];

      for (const sid of student_ids) {
        const existingWhere = { school_id, student_id: sid, date: checkDate };
        if (class_id) existingWhere.class_id = class_id;
        else existingWhere.class_id = null;

        const existing = await KanchoAttendance.findOne({ where: existingWhere });
        if (existing) {
          skipped.push(sid);
          continue;
        }

        const record = await KanchoAttendance.create({
          school_id,
          student_id: sid,
          class_id: class_id || null,
          date: checkDate,
          checked_in_at: new Date(),
          status: checkStatus,
          recorded_by: 'bulk'
        });
        created.push(record);
      }

      // Update aggregates for all checked-in students
      for (const sid of student_ids) {
        await updateStudentAggregates(sid);
      }
      if (class_id) await updateClassAggregates(class_id);

      res.status(201).json({
        success: true,
        data: { created: created.length, skipped: skipped.length, total: student_ids.length },
        message: `${created.length} students checked in${skipped.length > 0 ? `, ${skipped.length} already checked in` : ''}`
      });
    } catch (error) {
      console.error('Error bulk checking in:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/v1/attendance/:id - Remove an attendance record
  router.delete('/:id', async (req, res) => {
    try {
      const record = await KanchoAttendance.findByPk(req.params.id);

      if (!record) {
        return res.status(404).json({ error: 'Attendance record not found' });
      }

      const studentId = record.student_id;
      const classId = record.class_id;

      await record.destroy();

      // Recalculate aggregates
      await updateStudentAggregates(studentId);
      if (classId) await updateClassAggregates(classId);

      res.json({ success: true, message: 'Attendance record deleted' });
    } catch (error) {
      console.error('Error deleting attendance:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
