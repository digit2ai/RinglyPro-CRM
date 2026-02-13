// kancho-ai/src/routes/classes.js
// Public class schedule routes for Kancho AI

const express = require('express');
const router = express.Router();

module.exports = (models) => {
  const { KanchoClass } = models;

  // GET /api/v1/classes/public - Get public class listings
  router.get('/public', async (req, res) => {
    try {
      const { school_id } = req.query;

      if (!school_id) {
        return res.json({
          success: true,
          demo: true,
          data: getSampleClasses()
        });
      }

      const classes = await KanchoClass.findAll({
        where: { school_id, is_active: true },
        order: [['popularity_score', 'DESC'], ['name', 'ASC']]
      });

      if (classes.length === 0) {
        return res.json({
          success: true,
          demo: true,
          data: getSampleClasses()
        });
      }

      res.json({ success: true, demo: false, data: classes });
    } catch (error) {
      console.error('Error fetching public classes:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
};

function getSampleClasses() {
  return [
    {
      id: 'demo-1',
      name: 'Brazilian Jiu-Jitsu Fundamentals',
      martial_art: 'BJJ',
      level: 'Beginner',
      description: 'Learn the fundamentals of Brazilian Jiu-Jitsu including takedowns, guard work, and submissions.',
      schedule: { monday: '6:00 PM', wednesday: '6:00 PM', friday: '6:00 PM' },
      duration_minutes: 60,
      instructor: 'Professor Silva',
      price: 149.00,
      popularity_score: 95
    },
    {
      id: 'demo-2',
      name: 'Muay Thai Kickboxing',
      martial_art: 'Muay Thai',
      level: 'All Levels',
      description: 'High-energy Muay Thai training combining strikes, clinch work, and conditioning.',
      schedule: { tuesday: '7:00 PM', thursday: '7:00 PM', saturday: '10:00 AM' },
      duration_minutes: 60,
      instructor: 'Coach Rodriguez',
      price: 139.00,
      popularity_score: 90
    },
    {
      id: 'demo-3',
      name: 'Kids Martial Arts',
      martial_art: 'Mixed',
      level: 'Kids (5-12)',
      description: 'Fun, engaging martial arts classes that build discipline, confidence, and fitness.',
      schedule: { monday: '4:30 PM', wednesday: '4:30 PM', friday: '4:30 PM' },
      duration_minutes: 45,
      instructor: 'Sensei Martinez',
      price: 99.00,
      popularity_score: 88
    },
    {
      id: 'demo-4',
      name: 'Advanced MMA',
      martial_art: 'MMA',
      level: 'Advanced',
      description: 'Competitive MMA training combining striking, grappling, and cage work.',
      schedule: { tuesday: '8:00 PM', thursday: '8:00 PM', saturday: '9:00 AM' },
      duration_minutes: 90,
      instructor: 'Coach Thompson',
      price: 199.00,
      popularity_score: 85
    },
    {
      id: 'demo-5',
      name: 'Boxing Fundamentals',
      martial_art: 'Boxing',
      level: 'Beginner',
      description: 'Learn proper boxing technique, footwork, and combinations in a supportive environment.',
      schedule: { monday: '7:00 PM', wednesday: '7:00 PM', saturday: '11:00 AM' },
      duration_minutes: 60,
      instructor: 'Coach Williams',
      price: 129.00,
      popularity_score: 82
    },
    {
      id: 'demo-6',
      name: 'Women\'s Self-Defense',
      martial_art: 'Mixed',
      level: 'All Levels',
      description: 'Practical self-defense techniques from multiple martial arts, designed for real-world situations.',
      schedule: { tuesday: '6:00 PM', saturday: '12:00 PM' },
      duration_minutes: 60,
      instructor: 'Instructor Park',
      price: 119.00,
      popularity_score: 80
    }
  ];
}
