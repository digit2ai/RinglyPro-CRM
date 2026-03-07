#!/usr/bin/env node
/**
 * PACC-CFL Demo Account Seed Script
 * Philippine American Chamber of Commerce - Central Florida
 * Creates user, client, and realistic demo data
 */

require('dotenv').config();
const { Sequelize, QueryTypes } = require('sequelize');

const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false
});

// Pre-generated bcrypt hash for "Palindrome@7" (12 rounds)
const PASSWORD_HASH = '$2b$12$7OGOn.ILPVpKEGOVsxv03eV1aBv7cIvuuQrV8gmI/BWNV.4Z105Ye';

// Helper: random date in last N days
function randomDate(daysBack, daysForward = 0) {
  const now = new Date();
  const start = new Date(now.getTime() - daysBack * 86400000);
  const end = new Date(now.getTime() + daysForward * 86400000);
  const d = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  return d.toISOString();
}

function randomDateOnly(daysBack, daysForward = 0) {
  const d = new Date(randomDate(daysBack, daysForward));
  return d.toISOString().split('T')[0];
}

function randomTime() {
  const h = 9 + Math.floor(Math.random() * 8);
  const m = Math.random() < 0.5 ? '00' : '30';
  return `${String(h).padStart(2, '0')}:${m}:00`;
}

function randomPhone() {
  return `+1407${String(Math.floor(Math.random() * 9000000) + 1000000)}`;
}

function randomConfCode() {
  return 'PACC' + String(Math.floor(Math.random() * 900000) + 100000);
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

async function main() {
  try {
    await sequelize.authenticate();
    console.log('Connected to database');

    // =========================================
    // 1. CREATE USER
    // =========================================
    console.log('\n--- Creating User ---');

    // Check if user exists
    const [existingUser] = await sequelize.query(
      "SELECT id FROM users WHERE email = 'mstagg@ringlypro.com'",
      { type: QueryTypes.SELECT }
    ).catch(() => [null]);

    let userId;
    if (existingUser) {
      userId = existingUser.id;
      console.log(`User already exists with id=${userId}, updating...`);
      await sequelize.query(`
        UPDATE users SET
          password_hash = :hash,
          first_name = 'Manuel',
          last_name = 'Stagg',
          business_name = 'Philippine American Chamber of Commerce - Central Florida',
          business_phone = '+14075551001',
          phone_number = '+14075551002',
          business_type = 'professional',
          website_url = 'https://pacccfl.org/',
          business_description = 'Chamber of Commerce serving Filipino-American businesses and professionals in Central Florida. Focused on business growth, networking, community partnerships, and cultural exchange.',
          business_hours = '{"open": "09", "close": "17"}',
          services = 'Membership Services, Business Networking, Community Events, Sponsorships, Partnerships, Business Directory',
          terms_accepted = true,
          onboarding_completed = true,
          email_verified = true,
          must_change_password = false,
          is_admin = true,
          tokens_balance = 5000,
          tokens_used_this_month = 342,
          token_package = 'professional',
          subscription_plan = 'professional',
          subscription_status = 'active',
          billing_frequency = 'monthly',
          monthly_token_allocation = 7500,
          billing_cycle_start = CURRENT_DATE - INTERVAL '15 days',
          last_token_reset = CURRENT_DATE - INTERVAL '15 days',
          updated_at = CURRENT_TIMESTAMP
        WHERE email = 'mstagg@ringlypro.com'
      `, { replacements: { hash: PASSWORD_HASH } });
    } else {
      const [result] = await sequelize.query(`
        INSERT INTO users (
          email, password_hash, first_name, last_name, business_name,
          business_phone, phone_number, business_type, website_url,
          business_description, business_hours, services, terms_accepted,
          free_trial_minutes, onboarding_completed, email_verified,
          must_change_password, is_admin, tokens_balance, tokens_used_this_month,
          token_package, subscription_plan, subscription_status, billing_frequency,
          monthly_token_allocation, billing_cycle_start, last_token_reset,
          created_at, updated_at
        ) VALUES (
          'mstagg@ringlypro.com', :hash, 'Manuel', 'Stagg',
          'Philippine American Chamber of Commerce - Central Florida',
          '+14075551001', '+14075551002', 'professional', 'https://pacccfl.org/',
          'Chamber of Commerce serving Filipino-American businesses and professionals in Central Florida. Focused on business growth, networking, community partnerships, and cultural exchange.',
          '{"open": "09", "close": "17"}',
          'Membership Services, Business Networking, Community Events, Sponsorships, Partnerships, Business Directory',
          true, 0, true, true, false, true, 5000, 342, 'professional',
          'professional', 'active', 'monthly', 7500,
          CURRENT_DATE - INTERVAL '15 days', CURRENT_DATE - INTERVAL '15 days',
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        ) RETURNING id
      `, { replacements: { hash: PASSWORD_HASH } });
      userId = result[0].id;
      console.log(`Created user with id=${userId}`);
    }

    // =========================================
    // 2. CREATE CLIENT
    // =========================================
    console.log('\n--- Creating Client ---');

    const [existingClient] = await sequelize.query(
      "SELECT id FROM clients WHERE user_id = :userId",
      { type: QueryTypes.SELECT, replacements: { userId } }
    ).catch(() => [null]);

    let clientId;
    if (existingClient) {
      clientId = existingClient.id;
      console.log(`Client already exists with id=${clientId}, updating...`);
      await sequelize.query(`
        UPDATE clients SET
          business_name = 'Philippine American Chamber of Commerce - Central Florida',
          owner_name = 'Manuel Stagg',
          owner_phone = '+14075551002',
          owner_email = 'mstagg@ringlypro.com',
          website_url = 'https://pacccfl.org/',
          custom_greeting = 'Thank you for calling the Philippine American Chamber of Commerce of Central Florida. I''m Rachel, your AI assistant. How can I help you today? Whether you''re interested in membership, upcoming events, or sponsorship opportunities, I''m here to assist.',
          business_hours_start = '09:00:00',
          business_hours_end = '17:00:00',
          business_days = 'Mon,Tue,Wed,Thu,Fri',
          timezone = 'America/New_York',
          appointment_duration = 30,
          booking_enabled = true,
          sms_notifications = true,
          rachel_enabled = true,
          active = true,
          monthly_free_minutes = 500,
          ivr_enabled = true,
          ivr_options = :ivr,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = :clientId
      `, { replacements: {
        clientId,
        ivr: JSON.stringify([
          { label: 'Membership Information', phone: '+14075551001', enabled: true },
          { label: 'Events & Programs', phone: '+14075551001', enabled: true },
          { label: 'Sponsorship Opportunities', phone: '+14075551001', enabled: true },
          { label: 'General Inquiries', phone: '+14075551001', enabled: true }
        ])
      }});
    } else {
      const [result] = await sequelize.query(`
        INSERT INTO clients (
          business_name, business_phone, ringlypro_number, twilio_number_sid,
          forwarding_status, owner_name, owner_phone, owner_email,
          website_url, custom_greeting, business_hours_start, business_hours_end,
          business_days, timezone, appointment_duration, booking_enabled,
          sms_notifications, rachel_enabled, active, user_id,
          monthly_free_minutes, per_minute_rate, deposit_required,
          ivr_enabled, ivr_options,
          created_at, updated_at
        ) VALUES (
          'Philippine American Chamber of Commerce - Central Florida',
          '+14075551001', '+14075551001', 'PNdemo_pacccfl_001',
          'active', 'Manuel Stagg', '+14075551002', 'mstagg@ringlypro.com',
          'https://pacccfl.org/',
          'Thank you for calling the Philippine American Chamber of Commerce of Central Florida. I''m Rachel, your AI assistant. How can I help you today? Whether you''re interested in membership, upcoming events, or sponsorship opportunities, I''m here to assist.',
          '09:00:00', '17:00:00', 'Mon,Tue,Wed,Thu,Fri', 'America/New_York',
          30, true, true, true, true, :userId,
          500, 0.450, false, true, :ivr,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        ) RETURNING id
      `, { replacements: {
        userId,
        ivr: JSON.stringify([
          { label: 'Membership Information', phone: '+14075551001', enabled: true },
          { label: 'Events & Programs', phone: '+14075551001', enabled: true },
          { label: 'Sponsorship Opportunities', phone: '+14075551001', enabled: true },
          { label: 'General Inquiries', phone: '+14075551001', enabled: true }
        ])
      }});
      clientId = result[0].id;
      console.log(`Created client with id=${clientId}`);
    }

    // =========================================
    // 3. CREATE CREDIT ACCOUNT
    // =========================================
    console.log('\n--- Creating Credit Account ---');
    const [existingCA] = await sequelize.query(
      "SELECT id FROM credit_accounts WHERE client_id = :clientId",
      { type: QueryTypes.SELECT, replacements: { clientId } }
    ).catch(() => [null]);

    if (!existingCA) {
      await sequelize.query(`
        INSERT INTO credit_accounts (client_id, balance, free_minutes_used, free_minutes_reset_date,
          total_minutes_used, total_amount_spent, low_balance_notified, created_at, updated_at)
        VALUES (:clientId, 25.00, 87, CURRENT_DATE - INTERVAL '15 days', 87, 0, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, { replacements: { clientId } });
      console.log('Created credit account');
    } else {
      console.log('Credit account exists');
    }

    // =========================================
    // 4. CLEAR OLD DEMO DATA (if re-running)
    // =========================================
    console.log('\n--- Clearing old demo data for this client ---');
    await sequelize.query("DELETE FROM appointments WHERE client_id = :clientId", { replacements: { clientId } });
    await sequelize.query("DELETE FROM messages WHERE client_id = :clientId", { replacements: { clientId } });
    await sequelize.query("DELETE FROM calls WHERE client_id = :clientId", { replacements: { clientId } });
    await sequelize.query("DELETE FROM contacts WHERE client_id = :clientId", { replacements: { clientId } });
    await sequelize.query("DELETE FROM lead_tracker WHERE client_id = :clientId", { replacements: { clientId } });
    await sequelize.query("DELETE FROM admin_notes WHERE client_id = :clientId", { replacements: { clientId } });
    console.log('Cleared previous data');

    // =========================================
    // 5. SEED CONTACTS (85 contacts)
    // =========================================
    console.log('\n--- Seeding Contacts ---');

    const contactData = [
      // Membership Inquiries (15)
      { fn: 'Maria', ln: 'Santos', biz: 'Santos Law Group', type: 'membership', source: 'voice_call', status: 'active', tags: 'membership-inquiry,legal' },
      { fn: 'Roberto', ln: 'Cruz', biz: 'Cruz Real Estate', type: 'membership', source: 'voice_call', status: 'active', tags: 'membership-inquiry,real-estate' },
      { fn: 'Carmen', ln: 'Reyes', biz: 'Reyes Accounting Services', type: 'membership', source: 'sms', status: 'active', tags: 'membership-inquiry,accounting' },
      { fn: 'Antonio', ln: 'Garcia', biz: 'Garcia Auto Group', type: 'membership', source: 'voice_call', status: 'active', tags: 'membership-inquiry,automotive' },
      { fn: 'Patricia', ln: 'Dela Cruz', biz: 'Dela Cruz Medical Clinic', type: 'membership', source: 'voice_call', status: 'active', tags: 'membership-inquiry,healthcare' },
      { fn: 'Michael', ln: 'Ramos', biz: 'Ramos Construction LLC', type: 'membership', source: 'manual', status: 'active', tags: 'membership-inquiry,construction' },
      { fn: 'Jennifer', ln: 'Aquino', biz: 'Aquino Beauty Spa', type: 'membership', source: 'voice_call', status: 'active', tags: 'membership-inquiry,beauty' },
      { fn: 'David', ln: 'Bautista', biz: 'Bautista IT Consulting', type: 'membership', source: 'sms', status: 'active', tags: 'membership-inquiry,technology' },
      { fn: 'Angela', ln: 'Mendoza', biz: 'Mendoza Financial Advisors', type: 'membership', source: 'voice_call', status: 'active', tags: 'membership-inquiry,finance' },
      { fn: 'Joseph', ln: 'Torres', biz: 'Torres Marketing Agency', type: 'membership', source: 'manual', status: 'active', tags: 'membership-inquiry,marketing' },
      { fn: 'Grace', ln: 'Villanueva', biz: 'Villanueva CPA', type: 'membership', source: 'voice_call', status: 'inactive', tags: 'membership-lost,accounting' },
      { fn: 'Raymond', ln: 'Pascual', biz: 'Pascual Dental Care', type: 'membership', source: 'voice_call', status: 'active', tags: 'membership-inquiry,healthcare' },
      { fn: 'Linda', ln: 'Soriano', biz: 'Soriano Insurance Agency', type: 'membership', source: 'sms', status: 'active', tags: 'membership-inquiry,insurance' },
      { fn: 'Mark', ln: 'Fernandez', biz: 'Fernandez Engineering', type: 'membership', source: 'voice_call', status: 'active', tags: 'membership-confirmed,engineering' },
      { fn: 'Diana', ln: 'Castillo', biz: 'Castillo Home Services', type: 'membership', source: 'manual', status: 'active', tags: 'membership-confirmed,home-services' },

      // Event Inquiries (20)
      { fn: 'Elena', ln: 'Manalo', biz: 'Orlando Filipino Restaurant', type: 'event', source: 'voice_call', status: 'active', tags: 'event-inquiry,restaurant,vendor' },
      { fn: 'Carlos', ln: 'Rivera', biz: 'Rivera Photography', type: 'event', source: 'voice_call', status: 'active', tags: 'event-inquiry,photographer,vendor' },
      { fn: 'Sarah', ln: 'Lim', biz: 'Lim Event Planning', type: 'event', source: 'sms', status: 'active', tags: 'event-inquiry,event-planner' },
      { fn: 'Brandon', ln: 'Tan', biz: 'Tan Catering Services', type: 'event', source: 'voice_call', status: 'active', tags: 'event-registered,catering' },
      { fn: 'Michelle', ln: 'De Leon', biz: 'De Leon Floral Design', type: 'event', source: 'voice_call', status: 'active', tags: 'event-registered,florist' },
      { fn: 'Ryan', ln: 'Ocampo', biz: 'Ocampo Media Group', type: 'event', source: 'manual', status: 'active', tags: 'event-inquiry,media' },
      { fn: 'Jessica', ln: 'Aguilar', biz: null, type: 'event', source: 'voice_call', status: 'active', tags: 'event-rsvp,individual' },
      { fn: 'Kevin', ln: 'Santos', biz: 'Santos BBQ House', type: 'event', source: 'voice_call', status: 'active', tags: 'event-registered,restaurant,vendor' },
      { fn: 'Nicole', ln: 'Magsaysay', biz: null, type: 'event', source: 'sms', status: 'active', tags: 'event-rsvp,individual' },
      { fn: 'Andrew', ln: 'Valdez', biz: 'Valdez Sound Systems', type: 'event', source: 'voice_call', status: 'active', tags: 'event-vendor,entertainment' },
      { fn: 'Stephanie', ln: 'Navarro', biz: 'Navarro Dance Studio', type: 'event', source: 'manual', status: 'active', tags: 'event-performer,arts' },
      { fn: 'Daniel', ln: 'Gutierrez', biz: null, type: 'event', source: 'voice_call', status: 'active', tags: 'event-rsvp,individual' },
      { fn: 'Kathleen', ln: 'Velasco', biz: 'Velasco Party Supplies', type: 'event', source: 'sms', status: 'active', tags: 'event-vendor,party-supplies' },
      { fn: 'James', ln: 'Domingo', biz: 'Domingo Productions', type: 'event', source: 'voice_call', status: 'active', tags: 'event-inquiry,entertainment' },
      { fn: 'Laura', ln: 'Estrada', biz: null, type: 'event', source: 'voice_call', status: 'active', tags: 'event-rsvp,individual' },
      { fn: 'Philip', ln: 'Salazar', biz: 'Salazar Print Shop', type: 'event', source: 'manual', status: 'active', tags: 'event-vendor,printing' },
      { fn: 'Victoria', ln: 'Rosario', biz: 'Rosario Bakery', type: 'event', source: 'voice_call', status: 'active', tags: 'event-registered,bakery,vendor' },
      { fn: 'Christopher', ln: 'Abad', biz: null, type: 'event', source: 'sms', status: 'active', tags: 'event-inquiry,individual' },
      { fn: 'Anna', ln: 'Corpuz', biz: 'Corpuz Travel Agency', type: 'event', source: 'voice_call', status: 'active', tags: 'event-registered,travel' },
      { fn: 'Theodore', ln: 'Pineda', biz: 'Pineda Security Services', type: 'event', source: 'voice_call', status: 'active', tags: 'event-vendor,security' },

      // Sponsorship Leads (12)
      { fn: 'Alexander', ln: 'Concepcion', biz: 'Concepcion Holdings', type: 'sponsor', source: 'voice_call', status: 'active', tags: 'sponsor-lead,corporate,hot' },
      { fn: 'Elizabeth', ln: 'Sy', biz: 'Sy Development Corp', type: 'sponsor', source: 'manual', status: 'active', tags: 'sponsor-lead,real-estate,hot' },
      { fn: 'Richard', ln: 'Ayala', biz: 'Ayala Properties FL', type: 'sponsor', source: 'voice_call', status: 'active', tags: 'sponsor-lead,real-estate,warm' },
      { fn: 'Margaret', ln: 'Zobel', biz: 'Zobel Insurance Group', type: 'sponsor', source: 'voice_call', status: 'active', tags: 'sponsor-proposal-sent,insurance' },
      { fn: 'William', ln: 'Gokongwei', biz: 'Central FL Filipino Market', type: 'sponsor', source: 'sms', status: 'active', tags: 'sponsor-lead,retail,warm' },
      { fn: 'Catherine', ln: 'Araneta', biz: 'Araneta Medical Center', type: 'sponsor', source: 'voice_call', status: 'active', tags: 'sponsor-negotiation,healthcare' },
      { fn: 'Francis', ln: 'Pangilinan', biz: 'Pangilinan Law Office', type: 'sponsor', source: 'manual', status: 'active', tags: 'sponsor-lead,legal' },
      { fn: 'Theresa', ln: 'Cojuangco', biz: 'Heritage Bank of FL', type: 'sponsor', source: 'voice_call', status: 'active', tags: 'sponsor-won,banking' },
      { fn: 'George', ln: 'Tan', biz: 'Jollibee Orlando', type: 'sponsor', source: 'voice_call', status: 'active', tags: 'sponsor-won,restaurant,food' },
      { fn: 'Maricel', ln: 'Lopez', biz: 'TFC Media Network', type: 'sponsor', source: 'manual', status: 'active', tags: 'sponsor-lead,media' },
      { fn: 'Benjamin', ln: 'Ongpin', biz: 'Ongpin Financial Services', type: 'sponsor', source: 'voice_call', status: 'inactive', tags: 'sponsor-lost,finance' },
      { fn: 'Rosario', ln: 'Villar', biz: 'Villar Properties Group', type: 'sponsor', source: 'voice_call', status: 'active', tags: 'sponsor-proposal-sent,real-estate' },

      // Partnership / Community (10)
      { fn: 'Gabriel', ln: 'Legaspi', biz: 'Filipino Community Center', type: 'partner', source: 'manual', status: 'active', tags: 'partner,community,nonprofit' },
      { fn: 'Irene', ln: 'Del Rosario', biz: 'Orlando Asian Festival Committee', type: 'partner', source: 'voice_call', status: 'active', tags: 'partner,events,community' },
      { fn: 'Victor', ln: 'Santiago', biz: 'Central FL Hispanic Chamber', type: 'partner', source: 'manual', status: 'active', tags: 'partner,chamber,networking' },
      { fn: 'Beatrice', ln: 'Mercado', biz: 'University of Central Florida', type: 'partner', source: 'voice_call', status: 'active', tags: 'partner,education' },
      { fn: 'Samuel', ln: 'Enriquez', biz: 'Philippine Consulate Orlando', type: 'partner', source: 'manual', status: 'active', tags: 'partner,government' },
      { fn: 'Cynthia', ln: 'Panganiban', biz: 'Filipino Nurses Association FL', type: 'partner', source: 'voice_call', status: 'active', tags: 'partner,healthcare,professional' },
      { fn: 'Dennis', ln: 'Bello', biz: 'Asian American Business Alliance', type: 'partner', source: 'manual', status: 'active', tags: 'partner,business-alliance' },
      { fn: 'Monica', ln: 'Magno', biz: 'Orlando Business Journal', type: 'partner', source: 'voice_call', status: 'active', tags: 'media,press' },
      { fn: 'Paul', ln: 'Laurel', biz: 'Laurel Advisory Group', type: 'partner', source: 'sms', status: 'active', tags: 'partner,consulting' },
      { fn: 'Clarissa', ln: 'Romualdez', biz: 'FILAM News Orlando', type: 'partner', source: 'manual', status: 'active', tags: 'media,press,community' },

      // General Inquiries / Misc (18)
      { fn: 'Ernesto', ln: 'Dizon', biz: null, type: 'general', source: 'voice_call', status: 'active', tags: 'general-inquiry' },
      { fn: 'Felicia', ln: 'Bonifacio', biz: 'Bonifacio Filipino Store', type: 'general', source: 'voice_call', status: 'active', tags: 'general-inquiry,retail' },
      { fn: 'Harold', ln: 'Quezon', biz: null, type: 'general', source: 'sms', status: 'active', tags: 'newsletter,general' },
      { fn: 'Isabel', ln: 'Marcos', biz: 'Marcos Real Estate FL', type: 'general', source: 'voice_call', status: 'active', tags: 'general-inquiry,real-estate' },
      { fn: 'Kenneth', ln: 'Alvarez', biz: 'Alvarez Plumbing', type: 'general', source: 'voice_call', status: 'active', tags: 'referral,home-services' },
      { fn: 'Lorraine', ln: 'Dumlao', biz: null, type: 'general', source: 'sms', status: 'active', tags: 'newsletter,individual' },
      { fn: 'Nathan', ln: 'Francisco', biz: 'Francisco Auto Repair', type: 'general', source: 'voice_call', status: 'inactive', tags: 'general-resolved,automotive' },
      { fn: 'Olivia', ln: 'Hernandez', biz: 'Hernandez Staffing', type: 'general', source: 'manual', status: 'active', tags: 'general-inquiry,staffing' },
      { fn: 'Peter', ln: 'Macapagal', biz: null, type: 'general', source: 'voice_call', status: 'active', tags: 'general-inquiry,individual' },
      { fn: 'Rachel', ln: 'Dimaculangan', biz: 'Fil-Am Tutoring Services', type: 'general', source: 'sms', status: 'active', tags: 'general-inquiry,education' },
      { fn: 'Steven', ln: 'Batac', biz: 'Batac Tax Services', type: 'general', source: 'voice_call', status: 'active', tags: 'referral,tax-services' },
      { fn: 'Tiffany', ln: 'Luzuriaga', biz: null, type: 'general', source: 'voice_call', status: 'active', tags: 'general-inquiry,individual' },
      { fn: 'Ulysses', ln: 'Marasigan', biz: 'Marasigan Wellness Center', type: 'general', source: 'manual', status: 'active', tags: 'general-inquiry,wellness' },
      { fn: 'Vanessa', ln: 'Arroyo', biz: 'Arroyo Immigration Law', type: 'general', source: 'voice_call', status: 'active', tags: 'referral,legal,immigration' },
      { fn: 'Walter', ln: 'Cayetano', biz: null, type: 'general', source: 'sms', status: 'active', tags: 'newsletter,individual' },
      { fn: 'Yvonne', ln: 'Zamora', biz: 'Zamora Daycare Center', type: 'general', source: 'voice_call', status: 'active', tags: 'general-inquiry,childcare' },
      { fn: 'Albert', ln: 'Lacson', biz: 'Lacson Printing & Design', type: 'general', source: 'manual', status: 'active', tags: 'vendor-inquiry,printing' },
      { fn: 'Bernadette', ln: 'Ejercito', biz: null, type: 'general', source: 'voice_call', status: 'active', tags: 'general-inquiry,individual' },

      // Additional contacts for volume (10)
      { fn: 'Christian', ln: 'Roxas', biz: 'Roxas Filipino Cuisine', type: 'event', source: 'voice_call', status: 'active', tags: 'event-vendor,restaurant' },
      { fn: 'Danielle', ln: 'Osmena', biz: null, type: 'membership', source: 'sms', status: 'active', tags: 'membership-inquiry,individual' },
      { fn: 'Edward', ln: 'Laurel', biz: 'Laurel Construction Co', type: 'sponsor', source: 'voice_call', status: 'active', tags: 'sponsor-lead,construction' },
      { fn: 'Fiona', ln: 'Recto', biz: 'Recto Pharmacy', type: 'membership', source: 'voice_call', status: 'active', tags: 'membership-inquiry,pharmacy' },
      { fn: 'Gerald', ln: 'Abaya', biz: null, type: 'general', source: 'voice_call', status: 'active', tags: 'general-inquiry,individual' },
      { fn: 'Hannah', ln: 'Binay', biz: 'Binay Consulting Group', type: 'partner', source: 'manual', status: 'active', tags: 'partner,consulting' },
      { fn: 'Ivan', ln: 'Carandang', biz: 'Carandang Tech Solutions', type: 'membership', source: 'voice_call', status: 'active', tags: 'membership-confirmed,technology' },
      { fn: 'Julia', ln: 'Drilon', biz: 'Drilon & Associates', type: 'sponsor', source: 'voice_call', status: 'active', tags: 'sponsor-lead,legal' },
      { fn: 'Leo', ln: 'Escudero', biz: 'Escudero Filipino Market', type: 'event', source: 'sms', status: 'active', tags: 'event-vendor,market' },
      { fn: 'Marian', ln: 'Sotto', biz: null, type: 'general', source: 'voice_call', status: 'active', tags: 'newsletter,individual' },
    ];

    const contactIds = [];
    for (let i = 0; i < contactData.length; i++) {
      const c = contactData[i];
      const phone = randomPhone();
      const email = `${c.fn.toLowerCase()}.${c.ln.toLowerCase()}@${c.biz ? c.biz.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 15) : 'gmail'}.com`;
      const daysBack = Math.floor(Math.random() * 55) + 5;

      try {
        const [result] = await sequelize.query(`
          INSERT INTO contacts (client_id, first_name, last_name, phone, email, notes, status, source, last_contacted_at, created_at, updated_at)
          VALUES (:clientId, :fn, :ln, :phone, :email, :notes, :status, :source, :lastContact, :created, :updated)
          RETURNING id
        `, { replacements: {
          clientId,
          fn: c.fn,
          ln: c.ln,
          phone,
          email,
          notes: c.biz ? `Business: ${c.biz}. Category: ${c.type}. Tags: ${c.tags}` : `Category: ${c.type}. Tags: ${c.tags}`,
          status: c.status,
          source: c.source,
          lastContact: randomDate(daysBack > 10 ? 10 : daysBack),
          created: randomDate(daysBack),
          updated: randomDate(Math.min(daysBack, 5))
        }});
        contactIds.push({ id: result[0].id, ...c, phone });
      } catch (err) {
        // Skip duplicates
        console.log(`  Skipped duplicate: ${c.fn} ${c.ln} - ${err.message.substring(0, 60)}`);
      }
    }
    console.log(`Created ${contactIds.length} contacts`);

    // =========================================
    // 6. SEED CALLS (65 call records)
    // =========================================
    console.log('\n--- Seeding Calls ---');

    const callSummaries = [
      'Caller inquired about chamber membership benefits and annual dues. Captured contact details and offered to send membership packet.',
      'Incoming call about upcoming business mixer event. Provided date, time, and location. Caller registered for attendance.',
      'Sponsorship inquiry for annual gala. Discussed gold and platinum sponsorship packages. Caller requested follow-up call with committee chair.',
      'New member application follow-up. Confirmed receipt of application and explained next steps in approval process.',
      'Caller asked about vendor booth opportunities at the cultural festival. Provided pricing and availability information.',
      'Partnership inquiry from another business association. Discussed co-hosting networking events. Scheduled meeting for next week.',
      'Membership renewal reminder call. Member confirmed intent to renew. Updated contact information on file.',
      'General inquiry about business directory listing. Explained inclusion benefits for chamber members.',
      'Event RSVP confirmation call. Attendee confirmed for 2 guests at the quarterly business luncheon.',
      'Caller interested in advertising in the chamber newsletter. Provided rate card and submission deadlines.',
      'Inquiry about small business resources and mentorship programs offered through the chamber.',
      'Caller asked about volunteer opportunities with the chamber. Directed to community engagement committee.',
      'Bilingual caller inquired about membership. Provided information in English. Offered Tagalog-speaking staff callback.',
      'Follow-up call regarding sponsorship proposal sent last week. Sponsor is reviewing with their marketing team.',
      'Caller requested information about upcoming trade mission to the Philippines. Provided registration details.',
      'Missed call from potential member. Left voicemail with callback number and membership info link.',
      'Incoming call about board meeting schedule. Provided next meeting date and agenda preview.',
      'Caller asked about scholarship program for Filipino-American students. Provided application details and deadlines.',
      'Business referral inquiry. Caller looking for Filipino-owned CPA firm. Provided three member referrals.',
      'Event cancellation call. Updated RSVP list and offered alternative upcoming events.',
    ];

    const callStatuses = ['completed', 'completed', 'completed', 'completed', 'completed', 'missed', 'completed', 'completed', 'missed', 'completed'];
    let callCount = 0;

    for (let i = 0; i < 65; i++) {
      const contact = contactIds.length > 0 ? pick(contactIds) : null;
      const daysBack = Math.floor(Math.random() * 55) + 1;
      const duration = Math.floor(Math.random() * 300) + 30;
      const status = pick(callStatuses);
      const callStatus = status === 'missed' ? 'missed' : 'completed';

      try {
        await sequelize.query(`
          INSERT INTO calls (client_id, contact_id, twilio_call_sid, direction, from_number, to_number,
            status, call_status, duration, start_time, end_time, caller_name, notes,
            created_at, updated_at)
          VALUES (:clientId, :contactId, :sid, :direction, :from, :to,
            :status, :callStatus, :duration, :startTime, :endTime, :callerName, :notes,
            :created, :updated)
        `, { replacements: {
          clientId,
          contactId: contact ? contact.id : null,
          sid: `CA_demo_pacc_${Date.now()}_${i}`,
          direction: Math.random() < 0.75 ? 'incoming' : 'outgoing',
          from: contact ? contact.phone : randomPhone(),
          to: '+14075551001',
          status,
          callStatus,
          duration: status === 'missed' ? 0 : duration,
          startTime: randomDate(daysBack),
          endTime: randomDate(daysBack),
          callerName: contact ? `${contact.fn} ${contact.ln}` : 'Unknown Caller',
          notes: status === 'missed' ? 'Missed call. AI voicemail left.' : pick(callSummaries),
          created: randomDate(daysBack),
          updated: randomDate(daysBack)
        }});
        callCount++;
      } catch (err) {
        // Skip
      }
    }
    console.log(`Created ${callCount} call records`);

    // =========================================
    // 7. SEED MESSAGES (50 messages)
    // =========================================
    console.log('\n--- Seeding Messages ---');

    const smsTemplates = [
      { body: 'Thank you for contacting the Philippine American Chamber of Commerce - Central Florida! We received your inquiry and will get back to you within 24 hours.', dir: 'outgoing' },
      { body: 'Hi, I am interested in joining the chamber. Can you send me membership information?', dir: 'incoming' },
      { body: 'Reminder: PACC-CFL Quarterly Business Mixer is this Thursday at 6 PM. See you there!', dir: 'outgoing' },
      { body: 'What are the sponsorship packages available for the annual gala?', dir: 'incoming' },
      { body: 'Thank you for your interest in sponsoring our event! Our team will call you tomorrow to discuss packages.', dir: 'outgoing' },
      { body: 'Can I get more details about the vendor booth at the cultural festival?', dir: 'incoming' },
      { body: 'Your membership application has been received! Expect a confirmation within 5 business days.', dir: 'outgoing' },
      { body: 'Hi, when is the next networking event?', dir: 'incoming' },
      { body: 'Do you offer any resources for small business owners?', dir: 'incoming' },
      { body: 'We missed your call earlier. Please call us back at your convenience or reply to this message!', dir: 'outgoing' },
      { body: 'Is there a membership discount for multiple employees from the same company?', dir: 'incoming' },
      { body: 'Great news! You have been confirmed as a Gold Sponsor for the 2026 Annual Gala. Details to follow.', dir: 'outgoing' },
      { body: 'I would like to register for the business luncheon next month. How do I sign up?', dir: 'incoming' },
      { body: 'Thank you for registering! Your confirmation code is PACC2026. See you at the event!', dir: 'outgoing' },
      { body: 'Can my business be listed in the PACC-CFL directory?', dir: 'incoming' },
      { body: 'How can I volunteer with the chamber?', dir: 'incoming' },
      { body: 'Just a reminder: Membership renewal is due by end of month. Renew online or call us!', dir: 'outgoing' },
      { body: 'Thank you for attending last night event! We hope you enjoyed it.', dir: 'outgoing' },
      { body: 'Is there a scholarship program through the chamber?', dir: 'incoming' },
      { body: 'Excited to partner with PACC-CFL! Looking forward to our meeting next week.', dir: 'incoming' },
    ];

    let msgCount = 0;
    for (let i = 0; i < 50; i++) {
      const tmpl = smsTemplates[i % smsTemplates.length];
      const contact = contactIds.length > 0 ? pick(contactIds) : null;
      const daysBack = Math.floor(Math.random() * 50) + 1;

      try {
        await sequelize.query(`
          INSERT INTO messages (client_id, contact_id, twilio_sid, direction, from_number, to_number,
            body, status, sent_at, read, message_source, message_type, created_at, updated_at)
          VALUES (:clientId, :contactId, :sid, :direction, :from, :to,
            :body, :status, :sentAt, :read, 'twilio', 'sms', :created, :updated)
        `, { replacements: {
          clientId,
          contactId: contact ? contact.id : null,
          sid: `SM_demo_pacc_${Date.now()}_${i}`,
          direction: tmpl.dir,
          from: tmpl.dir === 'incoming' ? (contact ? contact.phone : randomPhone()) : '+14075551001',
          to: tmpl.dir === 'incoming' ? '+14075551001' : (contact ? contact.phone : randomPhone()),
          body: tmpl.body,
          status: tmpl.dir === 'incoming' ? 'received' : 'delivered',
          sentAt: randomDate(daysBack),
          read: Math.random() < 0.7,
          created: randomDate(daysBack),
          updated: randomDate(daysBack)
        }});
        msgCount++;
      } catch (err) { }
    }
    console.log(`Created ${msgCount} messages`);

    // =========================================
    // 8. SEED APPOINTMENTS (18 appointments)
    // =========================================
    console.log('\n--- Seeding Appointments ---');

    const appointmentPurposes = [
      'Membership Consultation', 'Sponsorship Discussion', 'Partnership Meeting',
      'Event Planning Call', 'Board Introduction', 'Business Directory Review',
      'Vendor Booth Inquiry', 'Newsletter Advertising', 'Scholarship Committee',
      'New Member Orientation', 'Community Outreach Planning', 'Trade Mission Briefing',
      'Membership Renewal', 'Sponsor Proposal Review', 'Annual Gala Planning',
      'Business Mixer Planning', 'Cultural Festival Coordination', 'Media Partnership'
    ];
    const apptStatuses = ['confirmed', 'confirmed', 'pending', 'completed', 'completed', 'completed', 'scheduled', 'no-show'];

    let apptCount = 0;
    for (let i = 0; i < 18; i++) {
      const contact = contactIds.length > 0 ? pick(contactIds) : null;
      const isFuture = i < 6;

      try {
        await sequelize.query(`
          INSERT INTO appointments (client_id, contact_id, customer_name, customer_phone, customer_email,
            appointment_date, appointment_time, duration, purpose, status, confirmation_code, source,
            created_at, updated_at)
          VALUES (:clientId, :contactId, :name, :phone, :email,
            :date, :time, :duration, :purpose, :status, :code, :source,
            :created, :updated)
        `, { replacements: {
          clientId,
          contactId: contact ? contact.id : null,
          name: contact ? `${contact.fn} ${contact.ln}` : 'Walk-in Visitor',
          phone: contact ? contact.phone : randomPhone(),
          email: contact ? `${contact.fn.toLowerCase()}.${contact.ln.toLowerCase()}@email.com` : 'visitor@email.com',
          date: isFuture ? randomDateOnly(0, 14) : randomDateOnly(30),
          time: randomTime(),
          duration: pick([30, 30, 45, 60]),
          purpose: appointmentPurposes[i],
          status: isFuture ? pick(['confirmed', 'pending', 'scheduled']) : pick(apptStatuses),
          code: randomConfCode(),
          source: pick(['voice_booking', 'manual', 'online', 'voice_booking']),
          created: randomDate(isFuture ? 7 : 30),
          updated: randomDate(isFuture ? 3 : 15)
        }});
        apptCount++;
      } catch (err) { }
    }
    console.log(`Created ${apptCount} appointments`);

    // =========================================
    // 9. SEED LEAD TRACKER (30 leads)
    // =========================================
    console.log('\n--- Seeding Lead Tracker ---');

    const leadTypes = ['Membership', 'Event', 'Sponsorship', 'Partnership', 'General', 'Referral'];
    const leadSubcats = ['Hot Lead', 'Warm Lead', 'Cold Lead', 'Callback Requested', 'Info Sent', 'Follow-Up Needed'];
    const leadSummaries = [
      'Interested in corporate membership package for team of 5',
      'Wants to sponsor upcoming business mixer - gold package',
      'Inquired about vendor booth at cultural festival',
      'New business owner looking for networking opportunities',
      'Referred by existing member, interested in joining',
      'Partnership discussion for co-hosted workshop',
      'Event RSVP + interested in membership',
      'Media contact interested in press partnership',
      'Corporate sponsor renewal discussion needed',
      'Inquiry about youth scholarship program',
    ];

    let leadCount = 0;
    for (let i = 0; i < 30; i++) {
      const contact = contactIds.length > 0 ? pick(contactIds) : null;
      const daysBack = Math.floor(Math.random() * 45) + 1;

      try {
        await sequelize.query(`
          INSERT INTO lead_tracker (client_id, conversation_id, lead_date, lead_type, subcategory,
            phone, business_name, duration, summary, created_at)
          VALUES (:clientId, :convId, :leadDate, :leadType, :subcat,
            :phone, :bizName, :duration, :summary, :created)
        `, { replacements: {
          clientId,
          convId: `conv_pacc_${Date.now()}_${i}`,
          leadDate: randomDateOnly(daysBack),
          leadType: pick(leadTypes),
          subcat: pick(leadSubcats),
          phone: contact ? contact.phone : randomPhone(),
          bizName: contact && contact.biz ? contact.biz : null,
          duration: Math.floor(Math.random() * 240) + 30,
          summary: pick(leadSummaries),
          created: randomDate(daysBack)
        }});
        leadCount++;
      } catch (err) { }
    }
    console.log(`Created ${leadCount} lead tracker entries`);

    // =========================================
    // 10. SEED ADMIN NOTES (20 notes)
    // =========================================
    console.log('\n--- Seeding Admin Notes ---');

    const noteTexts = [
      'Interested in corporate membership - has 5 employees. Send corporate package info.',
      'Wants gold sponsorship for annual gala. Budget $2,500-5,000. Follow up by Friday.',
      'Excellent vendor prospect for cultural festival. Specializes in Filipino food.',
      'Referred by Maria Santos. Very interested in networking events.',
      'Called twice about membership. Send application link ASAP.',
      'Partnership potential with UCF Filipino Student Association.',
      'Bilingual communication preferred (Tagalog/English).',
      'Board member referred this contact. VIP treatment.',
      'Wants to advertise in chamber newsletter. Send rate card.',
      'Previous member - lapsed. Re-engagement opportunity.',
      'Event vendor inquiry - photography services. Get portfolio.',
      'Media contact - wants to cover annual gala. Assign PR committee.',
      'Small business owner - new to area. Needs community resources.',
      'Scholarship inquiry for daughter. Send application packet.',
      'Trade mission interest. Add to Philippines delegation list.',
      'Requested callback next week for sponsorship discussion.',
      'Wants to host a workshop at chamber office. Check calendar availability.',
      'Corporate member renewal due next month. Proactive outreach needed.',
      'Interested in business directory premium listing.',
      'Community partner - Filipino Nurses Association. Co-event opportunity.',
    ];

    for (let i = 0; i < 20; i++) {
      try {
        await sequelize.query(`
          INSERT INTO admin_notes (admin_user_id, client_id, note, note_type, created_at, updated_at)
          VALUES (:userId, :clientId, :note, :type, :created, :updated)
        `, { replacements: {
          userId,
          clientId,
          note: noteTexts[i],
          type: pick(['general', 'follow-up', 'important', 'general']),
          created: randomDate(40),
          updated: randomDate(15)
        }});
      } catch (err) { }
    }
    console.log('Created 20 admin notes');

    // =========================================
    // 11. SEED FOLLOW-UP ITEMS (25 tasks)
    // =========================================
    console.log('\n--- Seeding Follow-Up Items ---');

    const followUps = [
      { msg: 'Follow up with Maria Santos on corporate membership application', status: 'pending', daysFromNow: 1 },
      { msg: 'Call Alexander Concepcion about gold sponsorship package', status: 'pending', daysFromNow: 0 },
      { msg: 'Send event registration info to Elena Manalo', status: 'completed', daysFromNow: -3 },
      { msg: 'Send partnership overview to Gabriel Legaspi', status: 'pending', daysFromNow: 2 },
      { msg: 'Confirm RSVP for quarterly business luncheon - 14 attendees', status: 'pending', daysFromNow: 0 },
      { msg: 'Follow up with inactive prospects from last quarter', status: 'pending', daysFromNow: 3 },
      { msg: 'Reach out to Andrew Valdez about vendor booth pricing', status: 'completed', daysFromNow: -5 },
      { msg: 'Review and respond to missed calls from this week', status: 'pending', daysFromNow: 0 },
      { msg: 'Send sponsorship proposal to Rosario Villar', status: 'completed', daysFromNow: -7 },
      { msg: 'Call back Roberto Cruz about real estate membership', status: 'pending', daysFromNow: 1 },
      { msg: 'Schedule board introduction meeting for new members', status: 'pending', daysFromNow: 5 },
      { msg: 'Prepare newsletter content for March edition', status: 'completed', daysFromNow: -2 },
      { msg: 'Follow up with Jollibee Orlando on event catering sponsorship', status: 'completed', daysFromNow: -10 },
      { msg: 'Send trade mission briefing to interested members', status: 'pending', daysFromNow: 4 },
      { msg: 'Call Catherine Araneta - sponsorship negotiation follow-up', status: 'pending', daysFromNow: -1 },
      { msg: 'Update business directory listings for Q1 members', status: 'completed', daysFromNow: -8 },
      { msg: 'Send scholarship application packets to requesting families', status: 'completed', daysFromNow: -4 },
      { msg: 'Coordinate with UCF for next campus networking event', status: 'pending', daysFromNow: 7 },
      { msg: 'Review vendor applications for cultural festival', status: 'pending', daysFromNow: 3 },
      { msg: 'Call TFC Media about press coverage for annual gala', status: 'pending', daysFromNow: 2 },
      { msg: 'Follow up on 3 pending membership applications', status: 'pending', daysFromNow: 0 },
      { msg: 'Send renewal reminders to members expiring this month', status: 'completed', daysFromNow: -6 },
      { msg: 'Finalize seating chart for business luncheon', status: 'pending', daysFromNow: 5 },
      { msg: 'Prepare sponsorship deck for Q2 events', status: 'pending', daysFromNow: 10 },
      { msg: 'Thank you notes to November event sponsors', status: 'completed', daysFromNow: -15 },
    ];

    for (const fu of followUps) {
      const eventDate = new Date();
      eventDate.setDate(eventDate.getDate() + fu.daysFromNow);

      try {
        await sequelize.query(`
          INSERT INTO follow_up_items (message, assigned_to, source, status, created_at, completed_at, event_date, event_title)
          VALUES (:msg, :assignee, :source, :status, :created, :completed, :eventDate, :title)
        `, { replacements: {
          msg: fu.msg,
          assignee: 'Manuel Stagg',
          source: pick(['ai_call', 'manual', 'system', 'ai_call']),
          status: fu.status,
          created: randomDate(Math.abs(fu.daysFromNow) + 5),
          completed: fu.status === 'completed' ? randomDate(3) : null,
          eventDate: eventDate.toISOString(),
          title: fu.msg.substring(0, 50)
        }});
      } catch (err) { }
    }
    console.log('Created 25 follow-up items');

    // =========================================
    // SUMMARY
    // =========================================
    console.log('\n========================================');
    console.log('PACC-CFL Demo Account Seeding Complete');
    console.log('========================================');
    console.log(`User ID: ${userId}`);
    console.log(`Client ID: ${clientId}`);
    console.log(`Email: mstagg@ringlypro.com`);
    console.log(`Password: Palindrome@7`);
    console.log(`Contacts: ${contactIds.length}`);
    console.log(`Calls: ${callCount}`);
    console.log(`Messages: ${msgCount}`);
    console.log(`Appointments: ${apptCount}`);
    console.log(`Lead Tracker: ${leadCount}`);
    console.log(`Follow-Ups: 25`);
    console.log(`Admin Notes: 20`);
    console.log('========================================');

    await sequelize.close();
    process.exit(0);
  } catch (err) {
    console.error('FATAL ERROR:', err.message);
    console.error(err.stack);
    await sequelize.close();
    process.exit(1);
  }
}

main();
