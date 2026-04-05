'use strict';

/**
 * Demo tutors for Torna Idioma Learner v2.
 *
 * Three personas covering the core market:
 *   - Maria (Filipino-Spanish native, Chabacano from Zamboanga)
 *   - Diego (Mexican Spanish, BPO specialist)
 *   - Carlos (Colombian, business Spanish)
 *
 * All pre-approved for demo purposes. Real tutors go through /tutors/apply
 * and await admin approval.
 */

module.exports = [
  {
    display_name: 'Maria Elena Reyes',
    headline: 'Filipino-Spanish heritage teacher from Zamboanga',
    bio: `¡Hola, mi apo! I'm Maria, born and raised in Zamboanga City where Chabacano (Philippine Creole Spanish) is still spoken daily. My grandmother taught me Spanish at the dinner table, and I've been teaching Filipinos to reconnect with their Hispanic heritage for 12 years. I specialize in cognate-based learning — showing you how much Spanish you already know through Tagalog and Chabacano. My approach is warm, patient, and culturally rooted.`,
    accent: 'filipino_spanish',
    native_language: 'chabacano',
    languages_spoken: ['Spanish (Chabacano/LatAm)', 'Filipino', 'Tagalog', 'English'],
    specialties: ['heritage', 'beginner', 'cognates', 'conversation', 'cultural'],
    certifications: ['DELE C2 (Instituto Cervantes Manila)', 'TESDA NC II Spanish'],
    years_experience: 12,
    hourly_rate_usd: 22.00,
    status: 'approved',
    timezone: 'Asia/Manila',
    rating_avg: 4.9,
    rating_count: 147,
    total_sessions: 892,
    total_students: 213,
    photo_url: null,
    availability: [
      { day_of_week: 1, start_time: '09:00', end_time: '12:00' }, // Mon morning
      { day_of_week: 1, start_time: '18:00', end_time: '21:00' }, // Mon evening
      { day_of_week: 3, start_time: '09:00', end_time: '12:00' }, // Wed morning
      { day_of_week: 3, start_time: '18:00', end_time: '21:00' },
      { day_of_week: 5, start_time: '14:00', end_time: '18:00' }, // Fri afternoon
      { day_of_week: 6, start_time: '09:00', end_time: '13:00' }  // Sat morning
    ]
  },
  {
    display_name: 'Diego Ramírez',
    headline: 'Mexican Spanish · BPO & call center specialist',
    bio: `¡Qué onda, estudiante! I'm Diego, from Guadalajara, Mexico. For the last 8 years I've trained BPO workers in Manila, Makati, and Cebu to handle Spanish-speaking customer service calls for Latin American clients. I know exactly what you need: real-world BPO vocabulary, customer service scripts, complaint handling, and natural conversation flow. My students consistently earn 30-40% salary premiums after certification. Let's get you ready for your next promotion.`,
    accent: 'latin_american',
    native_language: 'spanish',
    languages_spoken: ['Spanish (Mexican)', 'English'],
    specialties: ['bpo', 'business', 'customer_service', 'intermediate', 'phone_conversation'],
    certifications: ['UNAM Teaching Spanish as Foreign Language', 'Microsoft Dynamics Certified'],
    years_experience: 8,
    hourly_rate_usd: 28.00,
    status: 'approved',
    timezone: 'America/Mexico_City',
    rating_avg: 4.8,
    rating_count: 312,
    total_sessions: 1540,
    total_students: 389,
    photo_url: null,
    availability: [
      { day_of_week: 0, start_time: '20:00', end_time: '23:00' }, // Sun evening (matches PH morning)
      { day_of_week: 1, start_time: '20:00', end_time: '23:00' },
      { day_of_week: 2, start_time: '20:00', end_time: '23:00' },
      { day_of_week: 3, start_time: '20:00', end_time: '23:00' },
      { day_of_week: 4, start_time: '20:00', end_time: '23:00' }
    ]
  },
  {
    display_name: 'Carlos Moreno',
    headline: 'Colombian · Business Spanish & advanced conversation',
    bio: `Buenas, ¿cómo le va? Soy Carlos, from Medellín, Colombia — recently ranked the world's most innovative city. I teach advanced business Spanish with a focus on the professional, diplomatic, and tourism sectors. My students include government officials from Makati City Hall and executives at Philippine BPO companies expanding to Latin America. I bring 15 years of experience and partnerships through Universidad de Medellín's trilateral program with University of Makati and Colegio de San Juan de Letrán.`,
    accent: 'latin_american',
    native_language: 'spanish',
    languages_spoken: ['Spanish (Colombian)', 'English', 'Portuguese'],
    specialties: ['business', 'advanced', 'diplomacy', 'tourism', 'writing'],
    certifications: ['Universidad de Medellín MA Spanish Linguistics', 'Instituto Cervantes C2'],
    years_experience: 15,
    hourly_rate_usd: 35.00,
    status: 'approved',
    timezone: 'America/Bogota',
    rating_avg: 5.0,
    rating_count: 89,
    total_sessions: 624,
    total_students: 134,
    photo_url: null,
    availability: [
      { day_of_week: 1, start_time: '07:00', end_time: '12:00' },
      { day_of_week: 2, start_time: '07:00', end_time: '12:00' },
      { day_of_week: 3, start_time: '07:00', end_time: '12:00' },
      { day_of_week: 4, start_time: '07:00', end_time: '12:00' }
    ]
  }
];
