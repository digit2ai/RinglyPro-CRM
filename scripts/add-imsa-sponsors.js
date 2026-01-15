/**
 * Script to add IMSA Daytona Sponsors to Client 43's contacts
 * Run with: node scripts/add-imsa-sponsors.js
 */

require('dotenv').config();
const { Sequelize } = require('sequelize');

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sequelize = new Sequelize(databaseUrl, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  }
});

const sponsors = [
  { name: 'VP Racing Fuels', phone: '8443316478' },
  { name: 'WeatherTech', phone: '8004416287' },
  { name: 'Michelin North America', phone: '8886222306' },
  { name: 'BDO USA', phone: '3474608200' },
  { name: 'Bosch USA', phone: '8002341905' },
  { name: 'Brembo North America', phone: '8775692236' },
  { name: 'CrowdStrike', phone: '8885128906' },
  { name: 'Evolve Workforce Solutions', phone: '8772445009' },
  { name: 'Gainbridge', phone: '8884331122' },
  { name: 'Global Motorsport Relations (GMR)', phone: '8004320520' },
  { name: 'Hagerty', phone: '8009224050' },
  { name: 'Konica Minolta', phone: '8004562247' },
  { name: 'Motul USA', phone: '7149376400' },
  { name: 'National Carts', phone: '8002219913' },
  { name: 'NetJets', phone: '8775385687' },
  { name: 'OMP Racing', phone: '3056212778' },
  { name: 'Racer Media & Marketing', phone: '5613470300' },
  { name: 'Racing Optics', phone: '8008430512' },
  { name: 'Recaro Automotive', phone: '8003697226' },
  { name: 'Rolex USA', phone: '8004454438' },
  { name: 'Sports Car Club of America (SCCA)', phone: '5173326720' },
  { name: 'IMSA (International Motor Sports Association)', phone: '3863106500' }
];

async function addSponsors() {
  try {
    console.log('Adding IMSA Daytona Sponsors to Client 43...\n');

    let added = 0;
    let skipped = 0;

    for (const sponsor of sponsors) {
      // Check if phone already exists for this client
      const [existing] = await sequelize.query(
        `SELECT id, first_name FROM contacts WHERE client_id = 43 AND phone = :phone`,
        { replacements: { phone: sponsor.phone }, type: Sequelize.QueryTypes.SELECT }
      );

      if (existing) {
        console.log(`  Skipped: ${sponsor.name} (already exists)`);
        skipped++;
        continue;
      }

      // Generate unique email
      const emailSlug = sponsor.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
      const email = `${emailSlug}@imsa-sponsors-c43.temp`;

      await sequelize.query(
        `INSERT INTO contacts (client_id, first_name, last_name, phone, email, source, status, created_at, updated_at)
         VALUES (43, :firstName, 'Sponsor', :phone, :email, 'csv_import', 'active', NOW(), NOW())`,
        { replacements: { firstName: sponsor.name, phone: sponsor.phone, email } }
      );

      console.log(`  Added: ${sponsor.name} - ${sponsor.phone}`);
      added++;
    }

    console.log(`\nDone! Added ${added} contacts, skipped ${skipped}`);

    // Verify
    const [count] = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM contacts WHERE client_id = 43 AND source = 'csv_import'`,
      { type: Sequelize.QueryTypes.SELECT }
    );
    console.log(`Total IMSA sponsors in Client 43: ${count.cnt}`);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

addSponsors();
