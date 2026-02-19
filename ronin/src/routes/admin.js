'use strict';

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const JWT_SECRET = process.env.JWT_SECRET || 'ronin-brotherhood-secret-2024';

let models;
try { models = require('../../models'); } catch (e) { console.log('Ronin models not loaded:', e.message); }

// Admin credentials (Ronin Brotherhood admin)
const ADMIN_EMAIL = 'admin@roninbrotherhood.com';
const ADMIN_PASSWORD = 'Ronin2024!';

// POST /login - Admin login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      const token = jwt.sign(
        { memberId: 0, email: ADMIN_EMAIL, tenantId: 1, isAdmin: true },
        JWT_SECRET,
        { expiresIn: '24h' }
      );
      return res.json({ success: true, token, admin: { email: ADMIN_EMAIL, name: 'Ronin Admin' } });
    }

    return res.status(401).json({ success: false, error: 'Invalid admin credentials' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /dashboard - Admin dashboard stats
router.get('/dashboard', async (req, res) => {
  try {
    const [memberCount, orderCount, courseCount, eventCount, sponsorCount, revenue] = await Promise.all([
      models.RoninMember.count({ where: { tenant_id: 1 } }),
      models.RoninOrder.count({ where: { tenant_id: 1 } }),
      models.RoninTrainingCourse.count({ where: { tenant_id: 1 } }),
      models.RoninEvent.count({ where: { tenant_id: 1 } }),
      models.RoninSponsor.count({ where: { tenant_id: 1, status: 'active' } }),
      models.RoninOrder.sum('total', { where: { tenant_id: 1, payment_status: 'paid' } })
    ]);

    const recentMembers = await models.RoninMember.findAll({
      where: { tenant_id: 1 },
      attributes: { exclude: ['password_hash'] },
      order: [['created_at', 'DESC']],
      limit: 5
    });

    const recentOrders = await models.RoninOrder.findAll({
      where: { tenant_id: 1 },
      order: [['created_at', 'DESC']],
      limit: 5,
      include: [{ model: models.RoninOrderItem, as: 'items' }]
    });

    res.json({
      success: true,
      data: {
        stats: {
          members: memberCount,
          orders: orderCount,
          courses: courseCount,
          events: eventCount,
          sponsors: sponsorCount,
          revenue: revenue || 0
        },
        recentMembers,
        recentOrders
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /seed - Seed initial data (groups, sample products, courses)
router.post('/seed', async (req, res) => {
  try {
    // Seed the 5 Ronin Brotherhood groups
    const groups = [
      {
        code: 'RGRK', name: 'Ronin Goju Ryu Kai', sort_order: 1,
        full_name: 'Ronin Goju Ryu Kai World Karate Organization',
        description: 'An empty hand based academic system of self-defense focused on Okinawan and Japanese karate traditions. Founded by Hanshi Carlos H. Montalvo in 2000.',
        mission: 'To preserve traditional Goju Ryu while integrating modern combat and situational awareness training.',
        founded_year: 2000, focus: 'Okinawan/Japanese Karate-Do',
        countries_active: 16, member_count: 600,
        requirements: ['Minimum 1st Dan Black Belt in any recognized martial art', 'Letter of recommendation from current instructor']
      },
      {
        code: 'IRMAF', name: 'International Ronin Martial Arts Federation', sort_order: 2,
        full_name: 'International Ronin Martial Arts Federation',
        description: 'General martial arts federation welcoming practitioners from all traditional and modern martial arts disciplines.',
        mission: 'Unite martial artists worldwide under the seven virtues: Justice, Respect, Honor, Benevolence, Humility, Courage, and Loyalty.',
        focus: 'Multi-Discipline Martial Arts',
        countries_active: 28, member_count: 1000,
        requirements: ['Active martial arts practitioner', 'Minimum 1st Dan or equivalent']
      },
      {
        code: 'RPDTA', name: 'Ronin Police Defensive Tactics Association', sort_order: 3,
        full_name: 'Ronin Police Defensive Tactics Association',
        description: 'Composed of Martial Arts and Police Instructors and sworn city, state, federal personnel. Membership by invitation and background investigation only.',
        mission: 'Provide elite tactical training for law enforcement, military, and intelligence professionals.',
        focus: 'Defensive Tactics / Law Enforcement',
        countries_active: 8, member_count: 150,
        requirements: ['Active law enforcement, military, or intelligence personnel', 'Background investigation', 'Invitation required']
      },
      {
        code: 'RBS', name: 'Ronin Red Belt Society', sort_order: 4,
        full_name: 'Ronin Red Belt Society',
        description: 'Exclusive society for masters holding 4th Degree Black Belt (Yondan) and above.',
        mission: 'Recognize and connect the highest-ranking martial artists in the Ronin Brotherhood network.',
        focus: 'Masters & Grand Masters',
        countries_active: 20, member_count: 100,
        requirements: ['Minimum 4th Dan (Yondan)', 'Active membership in RGRK or IRMAF', 'Peer recommendation']
      },
      {
        code: 'MMA', name: 'Ronin MMA', sort_order: 5,
        full_name: 'Ronin Mixed Martial Arts International',
        description: 'For martial artists with mixed martial arts training and competition background.',
        mission: 'Bridge traditional martial arts with modern competitive MMA.',
        focus: 'Mixed Martial Arts Competition',
        countries_active: 12, member_count: 200,
        requirements: ['Active MMA training or competition record', 'Membership in IRMAF or RGRK']
      }
    ];

    for (const g of groups) {
      await models.RoninGroup.findOrCreate({ where: { tenant_id: 1, code: g.code }, defaults: { ...g, tenant_id: 1 } });
    }

    // Seed sample products
    const products = [
      {
        name: 'Ronin Executive Gi - 14oz Heavyweight', slug: 'ronin-executive-gi-14oz',
        description: 'The official Ronin Brotherhood 14-ounce heavyweight karate gi. Double and triple-stitched construction designed from four decades of competitive experience. Features Hanshi Carlos Montalvo\'s official signature and Japanese hanko (seal).',
        short_description: 'Official 14oz heavyweight karate gi with founder signature',
        price: 189.99, category: 'uniforms', status: 'active', featured: true,
        tags: ['gi', 'karate', 'heavyweight', 'official'], inventory_quantity: 50,
        has_variants: true, variant_options: ['Size']
      },
      {
        name: 'Ronin Brotherhood Training Gi - 10oz', slug: 'ronin-training-gi-10oz',
        description: 'Lightweight training gi perfect for daily practice. Premium cotton blend with reinforced stitching.',
        short_description: 'Lightweight 10oz training karate gi',
        price: 99.99, category: 'uniforms', status: 'active', featured: true,
        tags: ['gi', 'training', 'lightweight'], inventory_quantity: 100,
        has_variants: true, variant_options: ['Size']
      },
      {
        name: 'RGRK Official Patch', slug: 'rgrk-official-patch',
        description: 'Embroidered Ronin Goju Ryu Kai official organization patch.',
        price: 15.99, category: 'patches', status: 'active',
        tags: ['patch', 'rgrk', 'embroidered'], inventory_quantity: 200
      },
      {
        name: 'Ronin Brotherhood Belt - Black', slug: 'ronin-brotherhood-belt-black',
        description: 'Premium black belt with Ronin Brotherhood embroidery in gold thread.',
        price: 49.99, category: 'gear', status: 'active', featured: true,
        tags: ['belt', 'black belt', 'premium'], inventory_quantity: 75,
        has_variants: true, variant_options: ['Size']
      },
      {
        name: 'RPDTA Tactical Training Shirt', slug: 'rpdta-tactical-training-shirt',
        description: 'Moisture-wicking tactical training shirt with RPDTA logo.',
        price: 39.99, category: 'apparel', status: 'active',
        tags: ['rpdta', 'tactical', 'shirt'], inventory_quantity: 150,
        group_exclusive: 'RPDTA',
        has_variants: true, variant_options: ['Size']
      },
      {
        name: 'Ronin Brotherhood Hoodie', slug: 'ronin-brotherhood-hoodie',
        description: 'Premium heavyweight hoodie with embroidered Ronin Brotherhood logo.',
        price: 69.99, category: 'apparel', status: 'active', featured: true,
        tags: ['hoodie', 'apparel', 'premium'], inventory_quantity: 80,
        has_variants: true, variant_options: ['Size', 'Color']
      },
      {
        name: 'Makiwara Training Board', slug: 'makiwara-training-board',
        description: 'Traditional Okinawan makiwara striking post for hand conditioning.',
        price: 129.99, category: 'training_equipment', status: 'active',
        tags: ['makiwara', 'training', 'okinawan'], inventory_quantity: 30
      },
      {
        name: 'Ronin Challenge Coin', slug: 'ronin-challenge-coin',
        description: 'Limited edition Ronin Brotherhood challenge coin. Minted in solid brass with antique finish.',
        price: 24.99, category: 'collectibles', status: 'active',
        tags: ['coin', 'collectible', 'limited'], inventory_quantity: 500
      }
    ];

    for (const p of products) {
      await models.RoninProduct.findOrCreate({ where: { tenant_id: 1, slug: p.slug }, defaults: { ...p, tenant_id: 1 } });
    }

    // Seed RPDTA tactical training courses
    const courses = [
      {
        title: 'Vehicle Operations & Felony Stops', slug: 'vehicle-operations-felony-stops',
        description: 'Safe techniques for approaching vehicles during felony arrests. Practical exercises with various vehicle types and suspect extraction procedures.',
        category: 'tactical', group: 'RPDTA', duration_hours: 40, price: 1200,
        max_enrollment: 20, requires_clearance: true,
        certification_awarded: 'RPDTA Vehicle Operations Certification',
        syllabus: ['Vehicle approach techniques', 'Felony stop procedures', 'Suspect extraction', 'Tactical positioning', 'Night operations'],
        status: 'open'
      },
      {
        title: 'Structural Entry Operations', slug: 'structural-entry-operations',
        description: 'Team exercises covering commercial buildings, residences, and multi-story apartments with breaching techniques and low-light operations.',
        category: 'tactical', group: 'RPDTA', duration_hours: 40, price: 1500,
        max_enrollment: 16, requires_clearance: true,
        certification_awarded: 'RPDTA Structural Entry Certification',
        syllabus: ['Breaching techniques', 'Room clearing', 'Low-light operations', 'Multi-story entry', 'Team coordination'],
        status: 'open'
      },
      {
        title: 'Executive Protection Program', slug: 'executive-protection-program',
        description: 'Three-level defensive firearms shooting program addressing on-foot protection, vehicle-based protection, and combined scenarios.',
        category: 'tactical', group: 'RPDTA', duration_hours: 80, price: 2500,
        max_enrollment: 12, requires_clearance: true,
        certification_awarded: 'RPDTA Executive Protection Specialist',
        syllabus: ['On-foot protection', 'Vehicle-based protection', 'Combined scenarios', 'Defensive firearms', 'Client management logistics'],
        featured: true, status: 'open'
      },
      {
        title: 'Ground Defense & Tactical Combatives', slug: 'ground-defense-tactical-combatives',
        description: 'Ground avoidance and fighting skills while wearing tactical gear, with hands-on practical exercises.',
        category: 'tactical', group: 'RPDTA', duration_hours: 40, price: 1000,
        max_enrollment: 24, requires_clearance: true,
        certification_awarded: 'RPDTA Ground Defense Certification',
        syllabus: ['Ground avoidance', 'Tactical gear combat', 'Control techniques', 'Weapon retention', 'Scenario training'],
        status: 'open'
      },
      {
        title: 'Knife Defense & Tactical Shooting', slug: 'knife-defense-tactical-shooting',
        description: 'Tactical movement, reloading, cover utilization, and defensive knife techniques for armed response scenarios.',
        category: 'tactical', group: 'RPDTA', duration_hours: 40, price: 1200,
        max_enrollment: 20, requires_clearance: true,
        certification_awarded: 'RPDTA Edged Weapons & Tactical Shooting',
        syllabus: ['Tactical movement', 'Defensive knife techniques', 'Cover utilization', 'Reloading drills', 'Armed response scenarios'],
        status: 'open'
      },
      {
        title: 'Goju Ryu Kata Masterclass', slug: 'goju-ryu-kata-masterclass',
        description: 'Deep dive into traditional Goju Ryu katas with historical context and practical application.',
        category: 'martial_arts', group: 'RGRK', duration_hours: 16, price: 350,
        max_enrollment: 30,
        certification_awarded: 'RGRK Kata Proficiency Certificate',
        syllabus: ['Sanchin kata', 'Tensho kata', 'Gekisai Dai Ichi/Ni', 'Saifa', 'Seiunchin', 'Application (bunkai)'],
        status: 'open'
      },
      {
        title: 'MMA Fundamentals for Traditional Martial Artists', slug: 'mma-fundamentals-traditional',
        description: 'Bridge the gap between traditional martial arts and modern MMA competition.',
        category: 'martial_arts', group: 'MMA', duration_hours: 24, price: 500,
        max_enrollment: 25,
        syllabus: ['Stance and footwork', 'Clinch work', 'Takedown defense', 'Ground basics', 'MMA rules and strategy'],
        status: 'open'
      }
    ];

    for (const c of courses) {
      await models.RoninTrainingCourse.findOrCreate({ where: { tenant_id: 1, slug: c.slug }, defaults: { ...c, tenant_id: 1 } });
    }

    res.json({
      success: true,
      message: 'Ronin Brotherhood data seeded successfully',
      seeded: {
        groups: groups.length,
        products: products.length,
        courses: courses.length
      }
    });
  } catch (error) {
    console.error('Seed error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
