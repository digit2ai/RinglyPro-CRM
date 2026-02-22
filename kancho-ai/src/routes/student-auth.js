// kancho-ai/src/routes/student-auth.js
// Student portal authentication routes

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';

module.exports = (models) => {
  const { KanchoStudentAuth, KanchoStudent, KanchoSchool } = models;

  // Middleware: authenticate student JWT
  function authenticateStudent(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.source !== 'student_portal') {
        return res.status(401).json({ success: false, error: 'Invalid token source' });
      }
      req.studentAuthId = decoded.studentAuthId;
      req.studentId = decoded.studentId;
      req.schoolId = decoded.schoolId;
      req.userEmail = decoded.email;
      next();
    } catch (error) {
      return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
  }

  // POST /register
  router.post('/register', async (req, res) => {
    try {
      const { email, password, first_name, last_name, phone, school_id } = req.body;

      if (!email || !password || !first_name || !last_name || !school_id) {
        return res.status(400).json({ success: false, error: 'Email, password, first name, last name, and school are required' });
      }

      if (password.length < 8) {
        return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
      }

      // Verify school exists
      const school = await KanchoSchool.findByPk(school_id);
      if (!school) {
        return res.status(404).json({ success: false, error: 'School not found' });
      }

      // Check if email already registered at this school
      const existing = await KanchoStudentAuth.findOne({ where: { email, school_id } });
      if (existing) {
        return res.status(409).json({ success: false, error: 'An account already exists with this email at this school' });
      }

      const password_hash = await bcrypt.hash(password, 12);

      // Try to auto-link to existing KanchoStudent record by email
      let student_id = null;
      let status = 'pending';
      const existingStudent = await KanchoStudent.findOne({ where: { email, school_id } });
      if (existingStudent) {
        student_id = existingStudent.id;
        status = 'active'; // Auto-approve if email matches
      }

      const auth = await KanchoStudentAuth.create({
        school_id,
        student_id,
        email,
        password_hash,
        first_name,
        last_name,
        phone: phone || null,
        status
      });

      if (status === 'active' && student_id) {
        // Generate JWT immediately
        const token = jwt.sign({
          studentAuthId: auth.id,
          studentId: student_id,
          schoolId: school_id,
          email,
          source: 'student_portal'
        }, JWT_SECRET, { expiresIn: '30d' });

        await auth.update({ last_login: new Date() });

        return res.status(201).json({
          success: true,
          status: 'active',
          token,
          data: {
            studentAuthId: auth.id,
            studentId: student_id,
            schoolName: school.name,
            firstName: first_name,
            lastName: last_name
          }
        });
      }

      // Pending approval
      res.status(201).json({
        success: true,
        status: 'pending',
        message: 'Account created. Please wait for your school to approve your account.',
        data: {
          studentAuthId: auth.id,
          schoolName: school.name,
          firstName: first_name,
          lastName: last_name
        }
      });
    } catch (error) {
      console.error('Student register error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /login
  router.post('/login', async (req, res) => {
    try {
      const { email, password, school_id } = req.body;

      if (!email || !password || !school_id) {
        return res.status(400).json({ success: false, error: 'Email, password, and school are required' });
      }

      const auth = await KanchoStudentAuth.findOne({ where: { email, school_id } });
      if (!auth) {
        return res.status(401).json({ success: false, error: 'Invalid credentials' });
      }

      const isValid = await bcrypt.compare(password, auth.password_hash);
      if (!isValid) {
        return res.status(401).json({ success: false, error: 'Invalid credentials' });
      }

      if (auth.status === 'suspended') {
        return res.status(403).json({ success: false, error: 'Your account has been suspended. Contact your school.' });
      }

      if (auth.status === 'pending') {
        return res.status(403).json({ success: false, error: 'Your account is pending approval. Please wait for your school to approve it.' });
      }

      const school = await KanchoSchool.findByPk(school_id, { attributes: ['id', 'name'] });

      const token = jwt.sign({
        studentAuthId: auth.id,
        studentId: auth.student_id,
        schoolId: auth.school_id,
        email: auth.email,
        source: 'student_portal'
      }, JWT_SECRET, { expiresIn: '30d' });

      await auth.update({ last_login: new Date() });

      res.json({
        success: true,
        token,
        data: {
          studentAuthId: auth.id,
          studentId: auth.student_id,
          schoolName: school?.name || 'Unknown School',
          firstName: auth.first_name,
          lastName: auth.last_name
        }
      });
    } catch (error) {
      console.error('Student login error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /me - Get student profile
  router.get('/me', authenticateStudent, async (req, res) => {
    try {
      const auth = await KanchoStudentAuth.findByPk(req.studentAuthId);
      if (!auth) return res.status(404).json({ success: false, error: 'Account not found' });

      const school = await KanchoSchool.findByPk(req.schoolId, { attributes: ['id', 'name', 'martial_art_type'] });

      let student = null;
      if (req.studentId) {
        student = await KanchoStudent.findByPk(req.studentId, {
          attributes: ['id', 'first_name', 'last_name', 'email', 'phone', 'belt_rank', 'belt_stripes',
            'attendance_streak', 'total_classes', 'membership_type', 'monthly_rate',
            'status', 'churn_risk', 'last_payment_date', 'payment_status', 'enrollment_date',
            'emergency_contact', 'parent_guardian', 'date_of_birth', 'notes', 'tags']
        });
      }

      res.json({
        success: true,
        data: {
          auth: {
            id: auth.id,
            email: auth.email,
            firstName: auth.first_name,
            lastName: auth.last_name,
            phone: auth.phone,
            status: auth.status
          },
          student: student ? {
            id: student.id,
            firstName: student.first_name,
            lastName: student.last_name,
            email: student.email,
            phone: student.phone,
            beltRank: student.belt_rank,
            beltStripes: student.belt_stripes,
            attendanceStreak: student.attendance_streak,
            totalClasses: student.total_classes,
            membershipType: student.membership_type,
            monthlyRate: student.monthly_rate,
            status: student.status,
            paymentStatus: student.payment_status,
            lastPaymentDate: student.last_payment_date,
            enrollmentDate: student.enrollment_date,
            emergencyContact: student.emergency_contact,
            parentGuardian: student.parent_guardian,
            dateOfBirth: student.date_of_birth
          } : null,
          school: school ? {
            id: school.id,
            name: school.name,
            martialArtType: school.martial_art_type
          } : null
        }
      });
    } catch (error) {
      console.error('Student profile error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /schools - List schools for registration dropdown
  router.get('/schools', async (req, res) => {
    try {
      const schools = await KanchoSchool.findAll({
        where: { status: { [require('sequelize').Op.ne]: 'inactive' } },
        attributes: ['id', 'name', 'martial_art_type', 'city', 'state'],
        order: [['name', 'ASC']]
      });
      res.json({ success: true, data: schools });
    } catch (error) {
      console.error('Error fetching schools:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /forgot-password
  router.post('/forgot-password', async (req, res) => {
    try {
      const { email, school_id } = req.body;
      if (!email || !school_id) {
        return res.status(400).json({ success: false, error: 'Email and school are required' });
      }

      const auth = await KanchoStudentAuth.findOne({ where: { email, school_id } });
      if (!auth) {
        return res.json({ success: true, message: 'If an account exists, a reset link has been sent.' });
      }

      const resetToken = jwt.sign(
        { studentAuthId: auth.id, email: auth.email, schoolId: auth.school_id, type: 'student_password_reset' },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      await auth.update({ email_verification_token: resetToken });

      const APP_URL = process.env.APP_URL || 'https://aiagent.ringlypro.com';
      const resetLink = `${APP_URL}/kanchoai/student/?reset_token=${resetToken}`;

      try {
        const sgMail = require('@sendgrid/mail');
        if (process.env.SENDGRID_API_KEY) {
          sgMail.setApiKey(process.env.SENDGRID_API_KEY);
          const school = await KanchoSchool.findByPk(auth.school_id, { attributes: ['name'] });
          await sgMail.send({
            to: email,
            from: { email: process.env.FROM_EMAIL || 'noreply@ringlypro.com', name: 'Kancho AI - Student Portal' },
            subject: 'Reset Your Student Portal Password',
            html: `<!DOCTYPE html><html><head><style>body{font-family:Arial,sans-serif;line-height:1.6;color:#333}.container{max-width:600px;margin:0 auto;padding:20px}.header{background:linear-gradient(135deg,#1A1A1A 0%,#2A2A2A 100%);padding:30px;text-align:center;border-radius:10px 10px 0 0}.header h1{color:#E85A4F;margin:0;font-size:24px}.content{background:#111;padding:30px;border:1px solid #2A2A2A;color:#ccc}.button{display:inline-block;background:#E85A4F;color:white;padding:14px 30px;text-decoration:none;border-radius:8px;margin:20px 0;font-weight:bold}.footer{text-align:center;color:#6b7280;margin-top:20px;font-size:14px;padding:16px}</style></head><body><div class="container"><div class="header"><h1>Student Portal</h1><p style="color:#ccc;margin:5px 0 0">${school?.name || 'Your School'}</p></div><div class="content"><p>Hello <strong>${auth.first_name}</strong>,</p><p>You requested a password reset for your student portal account.</p><div style="text-align:center"><a href="${resetLink}" class="button">Reset My Password</a></div><p style="color:#f59e0b"><strong>This link expires in 1 hour.</strong></p><p style="font-size:14px;color:#6b7280">If the button doesn't work, copy this link:<br><code style="color:#E85A4F">${resetLink}</code></p></div><div class="footer"><p>Powered by Kancho AI</p></div></div></body></html>`
          });
        }
      } catch (emailErr) {
        console.error('Student reset email error:', emailErr.message);
      }

      res.json({ success: true, message: 'If an account exists, a reset link has been sent.' });
    } catch (error) {
      console.error('Student forgot password error:', error);
      res.status(500).json({ success: false, error: 'Failed to process request' });
    }
  });

  // POST /verify-reset-token
  router.post('/verify-reset-token', async (req, res) => {
    try {
      const { token } = req.body;
      if (!token) return res.status(400).json({ success: false, error: 'Token is required' });

      let decoded;
      try {
        decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.type !== 'student_password_reset') throw new Error('Invalid token type');
      } catch (err) {
        return res.status(400).json({ success: false, error: 'Invalid or expired reset link' });
      }

      const auth = await KanchoStudentAuth.findOne({
        where: { id: decoded.studentAuthId, email: decoded.email, email_verification_token: token }
      });

      if (!auth) return res.status(400).json({ success: false, error: 'Invalid or already used reset link' });

      res.json({ success: true, email: auth.email, school_id: auth.school_id });
    } catch (error) {
      console.error('Verify student reset token error:', error);
      res.status(500).json({ success: false, error: 'Failed to verify token' });
    }
  });

  // POST /reset-password
  router.post('/reset-password', async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      if (!token || !newPassword) return res.status(400).json({ success: false, error: 'Token and new password are required' });
      if (newPassword.length < 8) return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });

      let decoded;
      try {
        decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.type !== 'student_password_reset') throw new Error('Invalid token type');
      } catch (err) {
        return res.status(400).json({ success: false, error: 'Invalid or expired reset link' });
      }

      const auth = await KanchoStudentAuth.findOne({
        where: { id: decoded.studentAuthId, email: decoded.email, email_verification_token: token }
      });
      if (!auth) return res.status(400).json({ success: false, error: 'Invalid reset token' });

      const hashedPassword = await bcrypt.hash(newPassword, 12);
      await auth.update({ password_hash: hashedPassword, email_verification_token: null });

      res.json({ success: true, message: 'Password reset successfully. You can now sign in.' });
    } catch (error) {
      console.error('Student reset password error:', error);
      res.status(500).json({ success: false, error: 'Failed to reset password' });
    }
  });

  // Export router and middleware
  router.authenticateStudent = authenticateStudent;
  return router;
};
