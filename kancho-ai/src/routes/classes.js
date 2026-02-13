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
      name: 'Karate',
      martial_art: 'Karate',
      level: 'All Levels',
      description: 'Traditional striking art focused on powerful punches, kicks, and blocks. Builds discipline, respect, and sharp reflexes through kata and sparring.',
      popularity_score: 98
    },
    {
      id: 'demo-2',
      name: 'Taekwondo',
      martial_art: 'Taekwondo',
      level: 'All Levels',
      description: 'Olympic combat sport known for dynamic high kicks and fast footwork. Develops flexibility, balance, and explosive power.',
      popularity_score: 96
    },
    {
      id: 'demo-3',
      name: 'Brazilian Jiu-Jitsu',
      martial_art: 'BJJ',
      level: 'All Levels',
      description: 'Ground-based grappling art where technique overcomes size. Master takedowns, positional control, and submissions.',
      popularity_score: 95
    },
    {
      id: 'demo-4',
      name: 'Muay Thai',
      martial_art: 'Muay Thai',
      level: 'All Levels',
      description: 'The "Art of Eight Limbs" using punches, kicks, elbows, and knees. Elite striking and clinch work from Thailand.',
      popularity_score: 94
    },
    {
      id: 'demo-5',
      name: 'Mixed Martial Arts',
      martial_art: 'MMA',
      level: 'All Levels',
      description: 'Complete combat system combining striking, wrestling, and submissions. Train like the pros across all ranges of fighting.',
      popularity_score: 93
    },
    {
      id: 'demo-6',
      name: 'Kickboxing',
      martial_art: 'Kickboxing',
      level: 'All Levels',
      description: 'High-energy stand-up fighting combining punches and kicks. Great for fitness, self-defense, and competitive fighting.',
      popularity_score: 92
    },
    {
      id: 'demo-7',
      name: 'Judo',
      martial_art: 'Judo',
      level: 'All Levels',
      description: 'Olympic throwing art that uses leverage and timing to control opponents. The "gentle way" that builds unshakable balance.',
      popularity_score: 91
    },
    {
      id: 'demo-8',
      name: 'Krav Maga',
      martial_art: 'Krav Maga',
      level: 'All Levels',
      description: 'Reality-based self-defense system from the Israeli military. Practical techniques for real-world threat scenarios.',
      popularity_score: 90
    },
    {
      id: 'demo-9',
      name: 'Boxing',
      martial_art: 'Boxing',
      level: 'All Levels',
      description: 'The sweet science of punching. Develop hand speed, head movement, footwork, and knockout power in the ring.',
      popularity_score: 89
    },
    {
      id: 'demo-10',
      name: 'Kung Fu',
      martial_art: 'Kung Fu',
      level: 'All Levels',
      description: 'Ancient Chinese martial art with diverse styles and fluid movements. Combines striking, grappling, and weapons training.',
      popularity_score: 88
    },
    {
      id: 'demo-11',
      name: 'Aikido',
      martial_art: 'Aikido',
      level: 'All Levels',
      description: 'Harmonious martial art that redirects an attacker\'s energy through joint locks and throws. Defense without aggression.',
      popularity_score: 87
    },
    {
      id: 'demo-12',
      name: 'Capoeira',
      martial_art: 'Capoeira',
      level: 'All Levels',
      description: 'Brazilian art blending acrobatic kicks, sweeps, and music. Equal parts martial art, dance, and cultural expression.',
      popularity_score: 86
    },
    {
      id: 'demo-13',
      name: 'Wrestling',
      martial_art: 'Wrestling',
      level: 'All Levels',
      description: 'Foundational grappling art focused on takedowns, pins, and control. The base of every great MMA fighter.',
      popularity_score: 85
    },
    {
      id: 'demo-14',
      name: 'Hapkido',
      martial_art: 'Hapkido',
      level: 'All Levels',
      description: 'Korean self-defense art combining joint locks, throws, and dynamic kicks. Effective techniques for all body types.',
      popularity_score: 84
    },
    {
      id: 'demo-15',
      name: 'Jeet Kune Do',
      martial_art: 'Jeet Kune Do',
      level: 'All Levels',
      description: 'Bruce Lee\'s philosophy of combat — absorb what is useful, reject what is useless. Adaptive, formless fighting.',
      popularity_score: 83
    }
  ];
}
