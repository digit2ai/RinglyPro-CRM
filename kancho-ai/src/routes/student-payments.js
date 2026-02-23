// kancho-ai/src/routes/student-payments.js
// Student-facing payment endpoints (Stripe Checkout, autopay, merchandise purchase)

const express = require('express');
const router = express.Router();

module.exports = (models) => {
  const { KanchoStudent, KanchoRevenue, KanchoMerchandise, KanchoSchool } = models;

  // Lazy-load stripe to avoid crash if key missing
  function getStripe() {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('Stripe not configured');
    return require('stripe')(process.env.STRIPE_SECRET_KEY);
  }

  function getWebhookBase() {
    return process.env.WEBHOOK_BASE_URL || 'https://aiagent.ringlypro.com';
  }

  // POST /pay - Create Stripe Checkout for one-time payment (membership, testing fee, etc.)
  router.post('/pay', async (req, res) => {
    try {
      if (!req.studentId) return res.status(403).json({ success: false, error: 'Account not linked' });

      const stripe = getStripe();
      const { amount, type, description } = req.body;
      if (!amount || amount <= 0) return res.status(400).json({ success: false, error: 'Valid amount required' });

      const student = await KanchoStudent.findByPk(req.studentId);
      if (!student) return res.status(404).json({ success: false, error: 'Student not found' });

      const school = await KanchoSchool.findByPk(req.schoolId);
      const base = getWebhookBase();

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: (type || 'Payment') + ' - ' + (school?.name || 'School'),
              description: description || 'Student payment'
            },
            unit_amount: Math.round(amount * 100)
          },
          quantity: 1
        }],
        mode: 'payment',
        metadata: {
          student_id: String(req.studentId),
          school_id: String(req.schoolId),
          type: type || 'membership',
          description: description || '',
          source: 'student_portal'
        },
        success_url: base + '/kanchoai/student/?payment=success',
        cancel_url: base + '/kanchoai/student/?payment=canceled'
      });

      res.json({ success: true, url: session.url, sessionId: session.id });
    } catch (error) {
      console.error('Student payment error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /autopay/setup - Create Stripe Checkout in setup mode to save card + create subscription
  router.post('/autopay/setup', async (req, res) => {
    try {
      if (!req.studentId) return res.status(403).json({ success: false, error: 'Account not linked' });

      const stripe = getStripe();
      const student = await KanchoStudent.findByPk(req.studentId);
      if (!student) return res.status(404).json({ success: false, error: 'Student not found' });
      if (!student.monthly_rate || student.monthly_rate <= 0) {
        return res.status(400).json({ success: false, error: 'No monthly rate configured for your account' });
      }

      const school = await KanchoSchool.findByPk(req.schoolId);
      const base = getWebhookBase();

      // Create a subscription checkout
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Monthly Membership - ' + (school?.name || 'School'),
              description: (student.membership_type || 'Standard') + ' membership'
            },
            unit_amount: Math.round(parseFloat(student.monthly_rate) * 100),
            recurring: { interval: 'month' }
          },
          quantity: 1
        }],
        mode: 'subscription',
        metadata: {
          student_id: String(req.studentId),
          school_id: String(req.schoolId),
          type: 'membership',
          source: 'student_portal_autopay'
        },
        success_url: base + '/kanchoai/student/?autopay=success',
        cancel_url: base + '/kanchoai/student/?autopay=canceled'
      });

      res.json({ success: true, url: session.url, sessionId: session.id });
    } catch (error) {
      console.error('Autopay setup error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /autopay/status - Check if student has active subscription
  router.get('/autopay/status', async (req, res) => {
    try {
      if (!req.studentId) return res.status(403).json({ success: false, error: 'Account not linked' });

      // Check for recent recurring payment as proxy for subscription
      const lastRecurring = await KanchoRevenue.findOne({
        where: { student_id: req.studentId, is_recurring: true },
        order: [['date', 'DESC']]
      });

      const student = await KanchoStudent.findByPk(req.studentId, {
        attributes: ['payment_status', 'monthly_rate', 'last_payment_date', 'membership_type']
      });

      res.json({
        success: true,
        data: {
          hasAutopay: !!lastRecurring,
          paymentStatus: student?.payment_status || 'unknown',
          monthlyRate: student?.monthly_rate || 0,
          lastPaymentDate: student?.last_payment_date || lastRecurring?.date || null,
          membershipType: student?.membership_type || 'Standard'
        }
      });
    } catch (error) {
      console.error('Autopay status error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /autopay/cancel - Cancel active Stripe subscription
  router.post('/autopay/cancel', async (req, res) => {
    try {
      if (!req.studentId) return res.status(403).json({ success: false, error: 'Account not linked' });

      const stripe = getStripe();
      const student = await KanchoStudent.findByPk(req.studentId);
      if (!student) return res.status(404).json({ success: false, error: 'Student not found' });

      // Find active subscriptions for this student by listing from Stripe
      // Search by metadata.student_id
      const subscriptions = await stripe.subscriptions.list({
        limit: 10,
        status: 'active'
      });

      const studentSubs = subscriptions.data.filter(
        s => s.metadata?.student_id === String(req.studentId)
      );

      if (studentSubs.length === 0) {
        return res.status(404).json({ success: false, error: 'No active subscription found' });
      }

      // Cancel the most recent subscription
      const sub = studentSubs[0];
      await stripe.subscriptions.cancel(sub.id);

      // Update student record
      await student.update({ payment_status: 'cancelled' });

      // Mark recurring revenue records
      await KanchoRevenue.update(
        { is_recurring: false },
        { where: { student_id: req.studentId, is_recurring: true } }
      );

      res.json({ success: true, message: 'Autopay cancelled successfully' });
    } catch (error) {
      console.error('Autopay cancel error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /merchandise/buy - Create Stripe Checkout for merchandise purchase
  router.post('/merchandise/buy', async (req, res) => {
    try {
      if (!req.studentId) return res.status(403).json({ success: false, error: 'Account not linked' });

      const stripe = getStripe();
      const { item_id, size } = req.body;
      if (!item_id) return res.status(400).json({ success: false, error: 'item_id required' });

      const item = await KanchoMerchandise.findOne({ where: { id: item_id, school_id: req.schoolId } });
      if (!item) return res.status(404).json({ success: false, error: 'Item not found' });
      if (!item.in_stock) return res.status(400).json({ success: false, error: 'Item out of stock' });

      const school = await KanchoSchool.findByPk(req.schoolId);
      const base = getWebhookBase();

      const productName = item.name + (size ? ' (' + size + ')' : '');

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: productName,
              description: (item.description || '') + (school ? ' - ' + school.name : ''),
              ...(item.image_url ? { images: [item.image_url] } : {})
            },
            unit_amount: Math.round(parseFloat(item.price) * 100)
          },
          quantity: 1
        }],
        mode: 'payment',
        metadata: {
          student_id: String(req.studentId),
          school_id: String(req.schoolId),
          type: 'retail',
          merchandise_id: String(item.id),
          merchandise_name: item.name,
          size: size || '',
          source: 'student_portal_shop'
        },
        success_url: base + '/kanchoai/student/?purchase=success',
        cancel_url: base + '/kanchoai/student/?purchase=canceled'
      });

      res.json({ success: true, url: session.url, sessionId: session.id });
    } catch (error) {
      console.error('Merchandise purchase error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
};
