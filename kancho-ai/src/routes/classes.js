// kancho-ai/src/routes/classes.js
// Class schedule CRUD + public routes for Kancho AI

const express = require('express');
const router = express.Router();

module.exports = (models) => {
  const { KanchoClass, KanchoAttendance, KanchoClassEnrollment } = models;

  // GET /api/v1/classes - List all classes for a school (admin)
  router.get('/', async (req, res) => {
    try {
      const { school_id } = req.query;
      if (!school_id) return res.status(400).json({ error: 'school_id required' });

      const classes = await KanchoClass.findAll({
        where: { school_id },
        order: [['name', 'ASC']]
      });

      res.json({ success: true, data: classes });
    } catch (error) {
      console.error('Error fetching classes:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/v1/classes - Create a class
  router.post('/', async (req, res) => {
    try {
      const { school_id, name } = req.body;
      if (!school_id || !name) return res.status(400).json({ error: 'school_id and name required' });

      const cls = await KanchoClass.create({
        ...req.body,
        is_active: req.body.is_active !== false,
        created_at: new Date(),
        updated_at: new Date()
      });

      res.status(201).json({ success: true, data: cls });
    } catch (error) {
      console.error('Error creating class:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PUT /api/v1/classes/:id - Update a class
  router.put('/:id', async (req, res) => {
    try {
      const cls = await KanchoClass.findByPk(req.params.id);
      if (!cls) return res.status(404).json({ error: 'Class not found' });

      await cls.update({ ...req.body, updated_at: new Date() });
      res.json({ success: true, data: cls });
    } catch (error) {
      console.error('Error updating class:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/v1/classes/:id - Delete a class (cascade)
  router.delete('/:id', async (req, res) => {
    try {
      const cls = await KanchoClass.findByPk(req.params.id);
      if (!cls) return res.status(404).json({ error: 'Class not found' });

      await KanchoAttendance.destroy({ where: { class_id: cls.id } });
      await KanchoClassEnrollment.destroy({ where: { class_id: cls.id } });
      await cls.destroy();

      res.json({ success: true, message: 'Class deleted' });
    } catch (error) {
      console.error('Error deleting class:', error);
      res.status(500).json({ error: error.message });
    }
  });

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
      name: 'Goju Ryu',
      martial_art: 'Goju Ryu',
      level: 'All Levels',
      description: 'Okinawan karate style combining hard striking and soft circular techniques. The core art of Ronin Goju Ryu Kai (RGRK) with roots in Naha, Okinawa.',
      popularity_score: 95
    },
    {
      id: 'demo-4',
      name: 'Okinawa Kempo',
      martial_art: 'Okinawa Kempo',
      level: 'All Levels',
      description: 'Traditional Okinawan fighting system emphasizing practical self-defense, pressure points, and full-contact sparring. Rooted in Toshimitsu Kina lineage.',
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
      name: 'RPDTA Defensive Tactics',
      martial_art: 'Defensive Tactics',
      level: 'Advanced',
      description: 'Elite tactical training from the Ronin Police Defensive Tactics Association. Designed for law enforcement, military, and intelligence professionals.',
      popularity_score: 90
    },
    {
      id: 'demo-9',
      name: 'Shaolin Tsu Kempo',
      martial_art: 'Shaolin Kempo',
      level: 'All Levels',
      description: 'Chinese-influenced striking and self-defense system blending Shaolin techniques with practical combat applications. Part of the Ronin lineage.',
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
      name: 'Kobudo (Weapons)',
      martial_art: 'Kobudo',
      level: 'Intermediate',
      description: 'Traditional Okinawan weapons training including bo staff, sai, nunchaku, and tonfa. Preserves ancient warrior weapon forms.',
      popularity_score: 87
    },
    {
      id: 'demo-12',
      name: 'Kata & Forms',
      martial_art: 'Kata',
      level: 'All Levels',
      description: 'Structured patterns of movement encoding fighting techniques passed down through generations. The soul of traditional martial arts.',
      popularity_score: 86
    },
    {
      id: 'demo-13',
      name: 'Kumite (Sparring)',
      martial_art: 'Kumite',
      level: 'Intermediate',
      description: 'Controlled full-contact and point sparring to develop timing, distance, and fighting spirit. Competition preparation for all levels.',
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
