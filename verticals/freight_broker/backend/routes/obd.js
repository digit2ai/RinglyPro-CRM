// FreightMind OBD Scanner — Diagnostic Engine for Freight Broker Operations
// Mounted at /api/obd
const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const sequelize = require('../services/db.freight');

// Use the CW Carriers ingestion service — same tables, same pipeline
let cwIngestion = null;
try {
  cwIngestion = require(path.join(__dirname, '../../../cw_carriers/backend/services/ingestion.cw'));
} catch (e) {
  console.warn('[OBD] CW Carriers ingestion service not available:', e.message);
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ─────────────────────────────────────────────────────────────────────────────
// TABLE CREATION ON MODULE LOAD
// ─────────────────────────────────────────────────────────────────────────────
(async () => {
  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS lg_obd_findings (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(100) NOT NULL,
        scan_id VARCHAR(100),
        scan_module VARCHAR(50) NOT NULL,
        severity VARCHAR(20) NOT NULL CHECK (severity IN ('critical','warning','advisory','info')),
        category VARCHAR(100),
        title VARCHAR(255) NOT NULL,
        diagnostic TEXT NOT NULL,
        prescription TEXT,
        recommended_agent VARCHAR(100),
        recommended_tools JSONB DEFAULT '[]',
        estimated_monthly_savings DECIMAL(10,2),
        confidence VARCHAR(20) DEFAULT 'medium',
        data JSONB DEFAULT '{}',
        status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open','acknowledged','in_progress','resolved')),
        created_at TIMESTAMP DEFAULT NOW(),
        resolved_at TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_obd_findings_tenant ON lg_obd_findings(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_obd_findings_scan ON lg_obd_findings(scan_id);
      CREATE INDEX IF NOT EXISTS idx_obd_findings_severity ON lg_obd_findings(severity);
      CREATE INDEX IF NOT EXISTS idx_obd_findings_module ON lg_obd_findings(scan_module);

      CREATE TABLE IF NOT EXISTS lg_obd_scans (
        id SERIAL PRIMARY KEY,
        scan_id VARCHAR(100) UNIQUE NOT NULL,
        tenant_id VARCHAR(100) NOT NULL,
        modules_run JSONB DEFAULT '[]',
        findings_count INTEGER DEFAULT 0,
        critical_count INTEGER DEFAULT 0,
        warning_count INTEGER DEFAULT 0,
        advisory_count INTEGER DEFAULT 0,
        info_count INTEGER DEFAULT 0,
        overall_score INTEGER DEFAULT 0,
        duration_ms INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_obd_scans_tenant ON lg_obd_scans(tenant_id);

      CREATE TABLE IF NOT EXISTS lg_obd_ingestion_batches (
        id SERIAL PRIMARY KEY,
        batch_id VARCHAR(100) UNIQUE NOT NULL,
        tenant_id VARCHAR(100) NOT NULL,
        source_type VARCHAR(50),
        source_name VARCHAR(100),
        file_name VARCHAR(255),
        file_format VARCHAR(20),
        profile_used VARCHAR(50),
        total_rows INTEGER DEFAULT 0,
        mapped_rows INTEGER DEFAULT 0,
        failed_rows INTEGER DEFAULT 0,
        entity_type VARCHAR(50),
        field_mappings JSONB DEFAULT '{}',
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','mapping','ingesting','complete','failed')),
        errors JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_obd_ingestion_tenant ON lg_obd_ingestion_batches(tenant_id);
    `);
    console.log('[obd] Tables ready');
  } catch (err) {
    console.error('[obd] Table creation error:', err.message);
  }
})();

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function genScanId() { return `obd_scan_${Date.now()}_${Math.random().toString(36).substr(2,6)}`; }
function genBatchId() { return `obd_batch_${Date.now()}_${Math.random().toString(36).substr(2,6)}`; }

function safeNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

// ─────────────────────────────────────────────────────────────────────────────
// LEVENSHTEIN DISTANCE
// ─────────────────────────────────────────────────────────────────────────────
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[m][n];
}

function tokenOverlap(a, b) {
  const ta = new Set(a.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean));
  const tb = new Set(b.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  for (const t of ta) { if (tb.has(t)) overlap++; }
  return overlap / Math.max(ta.size, tb.size);
}

// ─────────────────────────────────────────────────────────────────────────────
// CANONICAL FIELD ALIAS DICTIONARIES (500+ aliases)
// ─────────────────────────────────────────────────────────────────────────────
const CANONICAL_FIELDS = {
  loads: {
    load_number: ['load_number','load_id','load_num','load #','load#','loadnumber','load no','loadid','shipment_id','shipment_number','shipment_num','shipment #','shipment#','order_id','order_number','order_num','order #','order#','pro_number','pro_num','pro #','pro#','bol_number','bol_num','bol #','bol#','reference_number','ref_number','ref_num','ref #','ref#','reference_id','trip_id','trip_number','move_id','move_number','dispatch_id','dispatch_number','load id','shipment id','order id','bill_of_lading','confirmation_number','confirmation #','conf_number','booking_number','booking_id','haul_id','freight_id','load_ref'],
    origin_city: ['origin_city','orig_city','pickup_city','ship_from_city','shipper_city','origin city','pickup city','from_city','source_city','loading_city','o_city','pu_city','pick_up_city','consignor_city','start_city','depart_city','departure_city','ship_city','origination_city','orig city','from city'],
    origin_state: ['origin_state','orig_state','pickup_state','ship_from_state','shipper_state','origin state','pickup state','from_state','source_state','o_state','pu_state','pick_up_state','consignor_state','start_state','depart_state','orig state','from state','origin_st','orig_st','o_st'],
    origin_zip: ['origin_zip','orig_zip','pickup_zip','ship_from_zip','shipper_zip','origin zip','pickup zip','from_zip','source_zip','o_zip','pu_zip','pick_up_zip','consignor_zip','start_zip','origin_postal','orig_postal','o_postal','origin_zipcode','orig_zipcode','from zip'],
    destination_city: ['destination_city','dest_city','delivery_city','ship_to_city','receiver_city','consignee_city','destination city','delivery city','to_city','drop_city','dropoff_city','d_city','del_city','unloading_city','end_city','arrival_city','dest city','to city','recv_city','receiving_city'],
    destination_state: ['destination_state','dest_state','delivery_state','ship_to_state','receiver_state','consignee_state','destination state','delivery state','to_state','drop_state','d_state','del_state','end_state','dest state','to state','dest_st','d_st','destination_st'],
    destination_zip: ['destination_zip','dest_zip','delivery_zip','ship_to_zip','receiver_zip','consignee_zip','destination zip','delivery zip','to_zip','drop_zip','d_zip','del_zip','dest_postal','destination_postal','d_postal','dest_zipcode','dest zip','to zip'],
    pickup_date: ['pickup_date','pick_up_date','pickup_dt','ship_date','ship_dt','load_date','origin_date','depart_date','departure_date','pu_date','early_pickup','earliest_pickup','pickup date','ship date','load date','start_date','pick_date','collection_date','ready_date','available_date','pickup_datetime','ship_datetime'],
    delivery_date: ['delivery_date','deliver_date','delivery_dt','deliver_dt','drop_date','dropoff_date','arrival_date','dest_date','destination_date','del_date','expected_delivery','delivery date','drop date','end_date','unload_date','receipt_date','delivery_datetime','deliver_datetime','due_date','required_date','appointment_date'],
    equipment_type: ['equipment_type','equip_type','trailer_type','equipment','equip','mode','trailer','truck_type','vehicle_type','eq_type','equipment type','trailer type','transport_type','shipping_mode','freight_type','service_type','capacity_type','unit_type','eqp_type','load_type'],
    weight: ['weight','gross_weight','total_weight','lbs','pounds','weight_lbs','load_weight','freight_weight','cargo_weight','ship_weight','net_weight','actual_weight','wgt','wt','weight_pounds','total_lbs','gross_lbs','payload','tonnage','weight_kg','kilos'],
    miles: ['miles','distance','total_miles','loaded_miles','trip_miles','route_miles','mileage','dist','mi','total_distance','loaded_distance','leg_miles','haul_miles','drive_miles','road_miles','practical_miles','hh_miles','pc_miles','distance_miles','estimated_miles','actual_miles'],
    customer_rate: ['customer_rate','cust_rate','shipper_rate','sell_rate','revenue','total_revenue','customer_revenue','line_haul','linehaul','customer_total','billing_amount','invoice_amount','gross_revenue','charge','total_charge','freight_charge','shipping_charge','customer_charge','sell_price','rate_to_customer','billed_amount','customer rate','sell rate'],
    carrier_rate: ['carrier_rate','carrier_pay','carrier_cost','buy_rate','cost','total_cost','carrier_total','carrier_charge','pay_amount','settlement','carrier_settlement','vendor_cost','purchase_rate','buy_price','rate_to_carrier','carrier_amount','truck_cost','transport_cost','carrier rate','buy rate','hauler_rate','trucker_pay'],
    fuel_surcharge: ['fuel_surcharge','fsc','fuel','fuel_charge','fuel_cost','fuel_amount','fuel surcharge','fuel_sc','fsc_amount','fuel_adj','fuel_adjustment','fuel_fee','fuel_add','surcharge','fuel_pct'],
    status: ['status','load_status','shipment_status','order_status','current_status','state','stage','load_stage','disposition','movement_status','tracking_status','booking_status','dispatch_status','progress','delivery_status'],
    commodity: ['commodity','commodities','product','material','cargo','freight','goods','item','product_type','cargo_type','freight_description','product_description','commodity_description','load_description','description','what','contents','lading','cargo_desc','freight_desc','shipment_type'],
    shipper_name: ['shipper_name','shipper','customer_name','customer','consignor','ship_from','ship_from_name','client_name','client','account_name','account','company_name','company','bill_to','bill_to_name','payer','shipper name','customer name','sender','consignor_name','booking_party','origin_company','pickup_company'],
    carrier_name: ['carrier_name','carrier','trucking_company','transport_company','vendor','vendor_name','hauler','hauler_name','trucker','motor_carrier','mc_name','drayage','dray_company','carrier name','vendor name','transport_name','trucking_co','freight_carrier','assigned_carrier','dispatched_carrier','selected_carrier'],
    driver_name: ['driver_name','driver','operator','trucker_name','driver_first','driver_last','driver_full','assigned_driver','dispatched_driver','operator_name','chauffeur','driver name','dvr_name','drvr','driver_contact'],
    broker_margin: ['broker_margin','margin','profit','gross_margin','net_margin','gross_profit','markup','spread','commission','broker_profit','margin_amount','margin_pct','margin_percent','gp','gross_profit_amount','net_revenue','broker margin','profit_margin','revenue_minus_cost','margin_dollars']
  },
  carriers: {
    carrier_name: ['carrier_name','carrier','company_name','company','name','legal_name','dba','doing_business_as','trucking_company','motor_carrier','transport_company','vendor_name','vendor','hauler','carrier name','company name','business_name','entity_name','firm_name','organization','corp_name'],
    mc_number: ['mc_number','mc_num','mc#','mc #','mc','motor_carrier_number','authority_number','auth_num','operating_authority','mc_no','mcnumber','mc number','interstate_authority','carrier_mc','fmcsa_mc','icc_mc','authority','carrier_authority'],
    dot_number: ['dot_number','dot_num','dot#','dot #','dot','usdot','us_dot','usdot_number','dot_no','dotnumber','dot number','usdot_num','federal_dot','fmcsa_dot','carrier_dot','usdot#'],
    scac_code: ['scac_code','scac','standard_carrier_alpha_code','carrier_code','alpha_code','scac code','carrier_scac','std_carrier_code'],
    safety_rating: ['safety_rating','safety_score','csa_score','safety','rating','inspection_rating','fmcsa_rating','compliance_rating','safety rating','safety_status','carrier_rating','risk_rating','risk_score','saf_rating'],
    insurance_status: ['insurance_status','insurance','ins_status','coverage_status','insured','liability_status','cargo_insurance','insurance_active','ins_active','insurance status','coverage','policy_status','insured_status'],
    fleet_size: ['fleet_size','trucks','truck_count','power_units','num_trucks','number_of_trucks','fleet','equipment_count','vehicle_count','fleet_count','fleet size','total_trucks','unit_count','tractor_count','trailer_count','capacity'],
    contact_name: ['contact_name','contact','primary_contact','rep_name','representative','point_of_contact','poc','poc_name','dispatcher_name','contact name','account_rep','sales_contact','main_contact','person_name','first_last'],
    contact_phone: ['contact_phone','phone','phone_number','telephone','tel','cell','mobile','contact_tel','primary_phone','office_phone','contact phone','phone_num','ph','cell_phone','mobile_phone','work_phone','fax'],
    contact_email: ['contact_email','email','email_address','e_mail','contact_email_address','primary_email','contact email','email_addr','e-mail','electronic_mail','mail','inbox'],
    equipment_types: ['equipment_types','equipment','trailer_types','trailers','services','capabilities','equip_types','truck_types','available_equipment','equipment types','trailer types','service_types','modes','transport_modes','freight_types'],
    payment_terms: ['payment_terms','terms','pay_terms','payment','net_days','payment_method','pay_method','billing_terms','settlement_terms','payment terms','pay terms','remittance_terms','payment_schedule','factoring','quickpay']
  },
  trucks: {
    unit_number: ['unit_number','unit_num','unit #','unit#','unit','truck_number','truck_num','truck#','truck #','tractor_number','tractor_num','vehicle_number','vehicle_num','asset_number','asset_num','equipment_number','equipment_num','fleet_number','unit number','truck number','asset_id','vehicle_id','truck_id','power_unit'],
    vin: ['vin','vin_number','vehicle_identification_number','serial_number','serial_num','chassis_number','vehicle_vin','truck_vin','vin#','vin number','vehicle_serial','sn'],
    make: ['make','manufacturer','mfg','brand','vehicle_make','truck_make','oem','mfr','builder','make_name'],
    model: ['model','vehicle_model','truck_model','model_name','model_number','model_num','series'],
    year: ['year','model_year','vehicle_year','truck_year','yr','manufacture_year','built_year','mfg_year','vintage'],
    equipment_type: ['equipment_type','equip_type','type','vehicle_type','truck_type','trailer_type','unit_type','asset_type','equipment type','category','class','vehicle_class'],
    status: ['status','truck_status','vehicle_status','unit_status','current_status','availability','available','state','condition','operational_status','active','active_status'],
    license_plate: ['license_plate','plate','plate_number','plate_num','tag','tag_number','registration','reg_number','license','license_number','license plate','plate_no','reg_no','vehicle_plate','plate#'],
    current_location: ['current_location','location','current_city','position','gps','gps_location','last_known_location','city','where','lat_long','coordinates','current_position','current location','last_location','geo','tracking_location'],
    mileage: ['mileage','odometer','miles','total_miles','current_miles','odo','hubometer','hub_miles','vehicle_miles','truck_miles','lifetime_miles','running_miles','total_mileage','odo_reading'],
    eld_provider: ['eld_provider','eld','telematics','tracking_provider','gps_provider','eld_vendor','eld_system','eld provider','telematics_provider','logging_device','e_log','electronic_log','elog_provider']
  },
  drivers: {
    driver_name: ['driver_name','name','driver','full_name','first_last','first_name','last_name','operator','employee_name','employee','driver_full_name','dvr_name','drvr','driver name','operator_name','chauffeur','person_name'],
    license_number: ['license_number','license_num','cdl_number','cdl_num','cdl#','cdl #','license#','license #','dl_number','dl_num','drivers_license','driver_license','license','cdl','dl','license number','cdl number','permit_number','credential_number'],
    license_state: ['license_state','cdl_state','dl_state','state_of_issue','issuing_state','license state','cdl state','state','dl_issue_state','license_issued','credential_state'],
    phone: ['phone','phone_number','cell','mobile','telephone','tel','driver_phone','contact_phone','cell_phone','mobile_phone','ph','driver phone','primary_phone','home_phone','work_phone'],
    email: ['email','email_address','e_mail','driver_email','contact_email','electronic_mail','mail','e-mail','driver email','inbox','personal_email','work_email'],
    hos_status: ['hos_status','hos','hours_of_service','duty_status','eld_status','driving_status','availability','available_hours','remaining_hours','hos status','log_status','driver_status','compliance_status','clock','drive_time_remaining'],
    cdl_class: ['cdl_class','class','license_class','dl_class','cdl_type','license_type','credential_class','endorsement_class','cdl class','driver_class','classification'],
    endorsements: ['endorsements','endorsement','cdl_endorsements','license_endorsements','special_endorsements','tanker','hazmat','doubles_triples','restrictions','qualifications','certifications','special_quals','credential_endorsements'],
    medical_expiry: ['medical_expiry','medical_card','med_card','medical_card_expiry','medical_expiration','med_expiry','physical_date','physical_expiry','dot_physical','dot_physical_date','medical_cert','medical_certificate','med_cert_expiry','medical expiry','health_card','medical_due','next_physical']
  },
  rates: {
    lane_origin: ['lane_origin','origin','from','orig','pickup','ship_from','start','source','origin_city','orig_city','from_city','lane_start','lane_from','lane origin','o_city','pu_city','pickup_location','source_location'],
    lane_destination: ['lane_destination','destination','to','dest','delivery','ship_to','end','target','dest_city','destination_city','to_city','lane_end','lane_to','lane destination','d_city','del_city','delivery_location','target_location'],
    rate_per_mile: ['rate_per_mile','rpm','per_mile','cost_per_mile','price_per_mile','mile_rate','$/mile','rate/mile','cpm','cents_per_mile','rate per mile','per mile rate','mileage_rate','unit_rate','per_mi'],
    total_rate: ['total_rate','rate','total','amount','price','charge','cost','flat_rate','all_in_rate','total_amount','line_haul','linehaul','total rate','total_price','flat_amount','gross_rate','billing_rate'],
    fuel_surcharge: ['fuel_surcharge','fsc','fuel','fuel_charge','fuel_cost','fuel_amount','surcharge','fuel_adj','fuel_adjustment','fuel surcharge','fsc_amount','fuel_pct','fuel_percentage'],
    equipment_type: ['equipment_type','equipment','equip','trailer_type','mode','type','service_type','truck_type','transport_type','equipment type','trailer','equip_type','freight_type','capacity_type'],
    effective_date: ['effective_date','start_date','begin_date','valid_from','from_date','eff_date','rate_start','contract_start','effective date','start date','activation_date','commence_date','begin','inception_date'],
    expiration_date: ['expiration_date','end_date','expire_date','valid_to','to_date','exp_date','rate_end','contract_end','expiration date','end date','termination_date','expiry','expires','valid_until','valid_through','sunset_date'],
    rate_type: ['rate_type','type','pricing_type','contract_type','rate_category','spot','contract','committed','rate type','pricing','market_type','lane_type','rate_classification','tender_type']
  },
  invoices: {
    invoice_number: ['invoice_number','invoice_num','invoice#','invoice #','invoice_id','inv_number','inv_num','inv#','inv_id','billing_number','bill_number','bill_num','bill#','invoice number','inv number','document_number','doc_number','voucher_number','voucher_num','ap_number','ar_number'],
    load_number: ['load_number','load_num','load#','load_id','shipment_id','shipment_number','order_id','order_number','reference','ref','ref_number','pro_number','bol_number','associated_load','related_load','load number','order number','trip_id'],
    amount: ['amount','total','total_amount','invoice_amount','billed_amount','charge','payment_amount','net_amount','gross_amount','billing_amount','sum','balance','subtotal','line_total','amt','dollar_amount','usd','cost','price','value'],
    due_date: ['due_date','payment_due','pay_by','due','due_by','payment_date','pay_date','maturity_date','due date','payment due','net_date','terms_date','expected_payment','promised_date'],
    payment_status: ['payment_status','status','pay_status','paid','payment_state','settled','cleared','remittance_status','payment status','invoice_status','billing_status','collection_status','ar_status','ap_status'],
    aging_days: ['aging_days','days_outstanding','age','aging','days_old','dso','past_due_days','overdue_days','outstanding_days','aging days','days outstanding','day_count','elapsed_days','open_days'],
    carrier_name: ['carrier_name','carrier','vendor','vendor_name','payee','pay_to','trucking_company','transport_company','carrier name','vendor name','ap_vendor','settlement_carrier'],
    shipper_name: ['shipper_name','shipper','customer','customer_name','bill_to','payer','account','client','client_name','shipper name','customer name','ar_customer','billing_customer','invoiced_to']
  }
};

// Build a flat lookup: canonical_field -> Set of aliases (lowercased)
const ALIAS_LOOKUP = {};
for (const [entityType, fields] of Object.entries(CANONICAL_FIELDS)) {
  for (const [canonical, aliases] of Object.entries(fields)) {
    const key = `${entityType}.${canonical}`;
    if (!ALIAS_LOOKUP[key]) ALIAS_LOOKUP[key] = new Set();
    for (const a of aliases) ALIAS_LOOKUP[key].add(a.toLowerCase().trim());
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FUZZY FIELD MATCHING
// ─────────────────────────────────────────────────────────────────────────────
function fuzzyMatchFields(headers, entityType) {
  const fieldDefs = CANONICAL_FIELDS[entityType] || {};
  const canonicalKeys = Object.keys(fieldDefs);
  const results = [];

  for (const header of headers) {
    const h = header.toLowerCase().trim();
    let bestMatch = null;
    let bestConfidence = 0;
    let bestMethod = 'none';

    for (const canonical of canonicalKeys) {
      const aliases = fieldDefs[canonical];

      // 1. Exact match
      if (aliases.includes(h)) {
        bestMatch = canonical;
        bestConfidence = 100;
        bestMethod = 'exact';
        break;
      }

      // 2. Lowercase normalized match (remove underscores, dashes, spaces)
      const hNorm = h.replace(/[_\-\s]+/g, '');
      for (const alias of aliases) {
        const aNorm = alias.replace(/[_\-\s]+/g, '');
        if (hNorm === aNorm) {
          if (98 > bestConfidence) {
            bestMatch = canonical;
            bestConfidence = 98;
            bestMethod = 'normalized';
          }
          break;
        }
      }
      if (bestConfidence >= 98) continue;

      // 3. Levenshtein distance
      for (const alias of aliases) {
        const dist = levenshtein(h, alias.toLowerCase());
        const maxLen = Math.max(h.length, alias.length);
        if (maxLen === 0) continue;
        const similarity = Math.round((1 - dist / maxLen) * 100);
        if (similarity > bestConfidence && similarity >= 65) {
          bestMatch = canonical;
          bestConfidence = similarity;
          bestMethod = 'levenshtein';
        }
      }

      // 4. Token overlap
      for (const alias of aliases) {
        const overlap = tokenOverlap(h, alias);
        const score = Math.round(overlap * 90);
        if (score > bestConfidence && score >= 55) {
          bestMatch = canonical;
          bestConfidence = score;
          bestMethod = 'token_overlap';
        }
      }
    }

    results.push({
      header,
      canonical_field: bestMatch,
      confidence: bestConfidence,
      method: bestMethod
    });
  }

  return results;
}

// Detect entity type from headers
function detectEntityType(headers) {
  const h = headers.map(x => x.toLowerCase());
  const scores = {};
  for (const [etype, fields] of Object.entries(CANONICAL_FIELDS)) {
    scores[etype] = 0;
    for (const [, aliases] of Object.entries(fields)) {
      for (const header of h) {
        if (aliases.some(a => a.toLowerCase() === header || a.toLowerCase().replace(/[_\-\s]+/g,'') === header.replace(/[_\-\s]+/g,''))) {
          scores[etype]++;
          break;
        }
      }
    }
  }
  let best = 'loads';
  let bestScore = 0;
  for (const [etype, score] of Object.entries(scores)) {
    if (score > bestScore) { best = etype; bestScore = score; }
  }
  return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// INGESTION PROFILES — Pre-built TMS/ELD field mappings
// ─────────────────────────────────────────────────────────────────────────────
const INGESTION_PROFILES = {
  mcleod: {
    name: 'McLeod LoadMaster',
    description: 'McLeod Software LoadMaster TMS export',
    entity_types: ['loads','carriers','drivers','trucks','invoices'],
    mappings: {
      loads: { 'Movement ID': 'load_number', 'Origin City': 'origin_city', 'Origin State': 'origin_state', 'Origin Zip': 'origin_zip', 'Dest City': 'destination_city', 'Dest State': 'destination_state', 'Dest Zip': 'destination_zip', 'Ship Date': 'pickup_date', 'Del Date': 'delivery_date', 'Equipment': 'equipment_type', 'Weight': 'weight', 'Miles': 'miles', 'Customer Charge': 'customer_rate', 'Carrier Pay': 'carrier_rate', 'Fuel Surcharge': 'fuel_surcharge', 'Status': 'status', 'Commodity': 'commodity', 'Customer': 'shipper_name', 'Carrier': 'carrier_name', 'Driver': 'driver_name', 'Margin': 'broker_margin' },
      carriers: { 'Carrier Name': 'carrier_name', 'MC #': 'mc_number', 'DOT #': 'dot_number', 'SCAC': 'scac_code', 'Safety Rating': 'safety_rating', 'Insurance Status': 'insurance_status', 'Fleet Size': 'fleet_size', 'Contact': 'contact_name', 'Phone': 'contact_phone', 'Email': 'contact_email', 'Equipment': 'equipment_types', 'Pay Terms': 'payment_terms' }
    }
  },
  tmw: {
    name: 'TMW Suite',
    description: 'TMW Systems TMS export (TruckMate/TotalMail)',
    entity_types: ['loads','carriers','drivers','trucks'],
    mappings: {
      loads: { 'Order Number': 'load_number', 'Orig City': 'origin_city', 'Orig State': 'origin_state', 'Orig Zip': 'origin_zip', 'Dest City': 'destination_city', 'Dest State': 'destination_state', 'Dest Zip': 'destination_zip', 'PU Date': 'pickup_date', 'DEL Date': 'delivery_date', 'Equip Type': 'equipment_type', 'Total Weight': 'weight', 'Total Miles': 'miles', 'Revenue': 'customer_rate', 'Cost': 'carrier_rate', 'FSC': 'fuel_surcharge', 'Ord Status': 'status', 'Commodity Desc': 'commodity', 'Bill To': 'shipper_name', 'Carrier Name': 'carrier_name', 'Driver Name': 'driver_name', 'Gross Margin': 'broker_margin' },
      carriers: { 'Name': 'carrier_name', 'MC Number': 'mc_number', 'DOT Number': 'dot_number', 'SCAC Code': 'scac_code' }
    }
  },
  mercurygate: {
    name: 'MercuryGate TMS',
    description: 'MercuryGate (Descartes) TMS export',
    entity_types: ['loads','rates','carriers'],
    mappings: {
      loads: { 'Shipment ID': 'load_number', 'Origin City': 'origin_city', 'Origin State': 'origin_state', 'Origin Postal Code': 'origin_zip', 'Destination City': 'destination_city', 'Destination State': 'destination_state', 'Destination Postal Code': 'destination_zip', 'Pickup Date': 'pickup_date', 'Delivery Date': 'delivery_date', 'Mode': 'equipment_type', 'Weight (lbs)': 'weight', 'Distance': 'miles', 'Sell Rate': 'customer_rate', 'Buy Rate': 'carrier_rate', 'Fuel': 'fuel_surcharge', 'Shipment Status': 'status', 'Description': 'commodity', 'Shipper': 'shipper_name', 'Carrier': 'carrier_name', 'Net Margin': 'broker_margin' },
      rates: { 'Origin': 'lane_origin', 'Destination': 'lane_destination', 'Rate Per Mile': 'rate_per_mile', 'Total Rate': 'total_rate', 'FSC': 'fuel_surcharge', 'Equipment': 'equipment_type', 'Effective': 'effective_date', 'Expiration': 'expiration_date', 'Type': 'rate_type' }
    }
  },
  turvo: {
    name: 'Turvo',
    description: 'Turvo collaborative TMS export',
    entity_types: ['loads','carriers'],
    mappings: {
      loads: { 'Shipment #': 'load_number', 'PU City': 'origin_city', 'PU State': 'origin_state', 'PU Zip': 'origin_zip', 'DEL City': 'destination_city', 'DEL State': 'destination_state', 'DEL Zip': 'destination_zip', 'PU Appt': 'pickup_date', 'DEL Appt': 'delivery_date', 'Trailer Type': 'equipment_type', 'Weight': 'weight', 'Miles': 'miles', 'Customer Rate': 'customer_rate', 'Carrier Rate': 'carrier_rate', 'FSC': 'fuel_surcharge', 'Status': 'status', 'Commodity': 'commodity', 'Customer': 'shipper_name', 'Carrier': 'carrier_name', 'Driver': 'driver_name', 'Margin': 'broker_margin' }
    }
  },
  dat: {
    name: 'DAT',
    description: 'DAT Freight & Analytics load board / rate data export',
    entity_types: ['loads','rates'],
    mappings: {
      loads: { 'Reference #': 'load_number', 'Origin': 'origin_city', 'Origin St': 'origin_state', 'Origin Zip': 'origin_zip', 'Destination': 'destination_city', 'Dest St': 'destination_state', 'Dest Zip': 'destination_zip', 'Pick Up': 'pickup_date', 'Deliver By': 'delivery_date', 'Equipment': 'equipment_type', 'Weight': 'weight', 'Distance': 'miles', 'Rate': 'customer_rate', 'Carrier Cost': 'carrier_rate' },
      rates: { 'Origin Market': 'lane_origin', 'Destination Market': 'lane_destination', 'Rate/Mile': 'rate_per_mile', 'All-In Rate': 'total_rate', 'Fuel Surcharge': 'fuel_surcharge', 'Equipment': 'equipment_type', 'Date': 'effective_date', 'Type': 'rate_type' }
    }
  },
  truckstop: {
    name: 'Truckstop.com',
    description: 'Truckstop load board / rate data export',
    entity_types: ['loads','rates'],
    mappings: {
      loads: { 'Load #': 'load_number', 'Pickup City': 'origin_city', 'Pickup State': 'origin_state', 'Pickup Zip': 'origin_zip', 'Delivery City': 'destination_city', 'Delivery State': 'destination_state', 'Delivery Zip': 'destination_zip', 'Pickup Date': 'pickup_date', 'Delivery Date': 'delivery_date', 'Trailer': 'equipment_type', 'Pounds': 'weight', 'Miles': 'miles', 'Price': 'customer_rate' },
      rates: { 'Lane Origin': 'lane_origin', 'Lane Dest': 'lane_destination', 'Per Mile': 'rate_per_mile', 'Total': 'total_rate', 'FSC': 'fuel_surcharge', 'Type': 'equipment_type', 'Start': 'effective_date', 'End': 'expiration_date', 'Rate Type': 'rate_type' }
    }
  },
  '123loadboard': {
    name: '123Loadboard',
    description: '123Loadboard data export',
    entity_types: ['loads'],
    mappings: {
      loads: { 'ID': 'load_number', 'From City': 'origin_city', 'From State': 'origin_state', 'From Zip': 'origin_zip', 'To City': 'destination_city', 'To State': 'destination_state', 'To Zip': 'destination_zip', 'Available': 'pickup_date', 'Needed By': 'delivery_date', 'Equipment': 'equipment_type', 'Weight': 'weight', 'Miles': 'miles', 'Rate': 'customer_rate', 'Comment': 'commodity' }
    }
  },
  samsara: {
    name: 'Samsara',
    description: 'Samsara fleet management / ELD export',
    entity_types: ['trucks','drivers'],
    mappings: {
      trucks: { 'Vehicle Name': 'unit_number', 'VIN': 'vin', 'Make': 'make', 'Model': 'model', 'Year': 'year', 'Vehicle Type': 'equipment_type', 'Status': 'status', 'License Plate': 'license_plate', 'Current Location': 'current_location', 'Odometer (mi)': 'mileage', 'ELD': 'eld_provider' },
      drivers: { 'Driver Name': 'driver_name', 'License Number': 'license_number', 'License State': 'license_state', 'Phone': 'phone', 'Email': 'email', 'HOS Status': 'hos_status', 'CDL Class': 'cdl_class', 'Endorsements': 'endorsements', 'Medical Card Expiry': 'medical_expiry' }
    }
  },
  motive: {
    name: 'Motive (KeepTruckin)',
    description: 'Motive / KeepTruckin ELD & fleet management export',
    entity_types: ['trucks','drivers'],
    mappings: {
      trucks: { 'Unit #': 'unit_number', 'VIN': 'vin', 'Make': 'make', 'Model': 'model', 'Year': 'year', 'Type': 'equipment_type', 'Vehicle Status': 'status', 'Plate': 'license_plate', 'Last Location': 'current_location', 'Odometer': 'mileage', 'ELD Provider': 'eld_provider' },
      drivers: { 'Name': 'driver_name', 'CDL #': 'license_number', 'CDL State': 'license_state', 'Phone #': 'phone', 'Email': 'email', 'Duty Status': 'hos_status', 'Class': 'cdl_class', 'Endorsements': 'endorsements', 'Med Card Exp': 'medical_expiry' }
    }
  },
  quickbooks: {
    name: 'QuickBooks',
    description: 'QuickBooks accounting export (invoices/bills)',
    entity_types: ['invoices'],
    mappings: {
      invoices: { 'Invoice No.': 'invoice_number', 'Memo': 'load_number', 'Total': 'amount', 'Due Date': 'due_date', 'Status': 'payment_status', 'Days Overdue': 'aging_days', 'Vendor': 'carrier_name', 'Customer': 'shipper_name' }
    }
  },
  hubspot: {
    name: 'HubSpot CRM',
    description: 'HubSpot CRM deal/contact/company export',
    entity_types: ['customers'],
    mappings: {
      customers: { 'Company': 'customer_name', 'Contact Name': 'contact_name', 'Contact Email': 'email', 'Contact Phone': 'phone', 'Amount': 'payment_terms', 'Stage': 'billing_address', 'Deal Name': 'customer_name', 'Owner': 'contact_name' }
    }
  },
  carrier_assure: {
    name: 'Carrier Assure',
    description: 'Carrier Assure compliance and scoring export',
    entity_types: ['carriers'],
    mappings: {
      carriers: { 'Carrier Name': 'carrier_name', 'MC Number': 'mc_number', 'DOT Number': 'dot_number', 'SCAC': 'scac_code', 'Authority Status': 'operating_status', 'Insurance Status': 'insurance_status', 'Safety Rating': 'safety_rating', 'CSA Score': 'csa_score', 'Power Units': 'fleet_size', 'Equipment Types': 'equipment_types', 'Home State': 'home_state', 'Payment Terms': 'payment_terms', 'Reliability Score': 'reliability_score', 'Contract Status': 'contract_status' }
    }
  },
  macropoint: {
    name: 'Macropoint',
    description: 'Macropoint tracking/visibility event export',
    entity_types: ['tracking'],
    mappings: {
      tracking: { 'Load ID': 'load_ref', 'Carrier': 'carrier_name', 'Truck Number': 'truck_number', 'Driver': 'driver_name', 'Status': 'status', 'Latitude': 'latitude', 'Longitude': 'longitude', 'City': 'city', 'State': 'state', 'Timestamp': 'timestamp', 'ETA': 'eta', 'Miles Remaining': 'miles_remaining', 'Speed MPH': 'speed', 'Temperature F': 'temperature', 'Event Type': 'event_type', 'Notes': 'notes' }
    }
  },
  dat: {
    name: 'DAT RateView',
    description: 'DAT market rate benchmarks by lane and equipment type',
    entity_types: ['rates'],
    mappings: {
      rates: { 'Origin State': 'origin_state', 'Destination State': 'destination_state', 'Equipment Type': 'equipment_type', 'Avg Rate Per Mile': 'rate_per_mile_avg', 'Min Rate Per Mile': 'rate_per_mile_p25', 'Max Rate Per Mile': 'rate_per_mile_p75', 'Avg Total Rate': 'avg_rate', 'Sample Size': 'sample_size', 'Confidence': 'confidence', 'Rate Date': 'rate_date', 'Benchmark Source': 'benchmark_source' }
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// FILE PARSING UTILITIES
// ─────────────────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  // Handle quoted CSV fields
  function parseLine(line) {
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  }

  // Detect delimiter (comma, tab, pipe)
  const delimiters = [',', '\t', '|'];
  let bestDelim = ',';
  let bestCount = 0;
  for (const d of delimiters) {
    const cnt = (lines[0].match(new RegExp(d === '|' ? '\\|' : (d === '\t' ? '\t' : d), 'g')) || []).length;
    if (cnt > bestCount) { bestCount = cnt; bestDelim = d; }
  }

  let headers, rows;
  if (bestDelim === ',') {
    headers = parseLine(lines[0]);
    rows = lines.slice(1).map(l => {
      const vals = parseLine(l);
      const obj = {};
      headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
      return obj;
    });
  } else {
    headers = lines[0].split(bestDelim).map(h => h.trim());
    rows = lines.slice(1).map(l => {
      const vals = l.split(bestDelim).map(v => v.trim());
      const obj = {};
      headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
      return obj;
    });
  }
  return { headers, rows };
}

function parseEDI(text) {
  // Basic EDI 204/210/214 parser — extracts key segments into tabular form
  const segments = text.split(/~|\n/).map(s => s.trim()).filter(Boolean);
  const rows = [];
  let current = {};

  for (const seg of segments) {
    const els = seg.split('*');
    const id = els[0];

    if (id === 'ST') {
      if (Object.keys(current).length > 0) rows.push(current);
      current = { transaction_type: els[1] || '' };
    } else if (id === 'B1' || id === 'B2' || id === 'B2A') {
      current.load_number = els[2] || els[1] || '';
    } else if (id === 'N1') {
      const qual = els[1];
      if (qual === 'SH') current.shipper_name = els[2] || '';
      else if (qual === 'CN') current.consignee_name = els[2] || '';
      else if (qual === 'CA') current.carrier_name = els[2] || '';
    } else if (id === 'N3') {
      // Address line — skip for now
    } else if (id === 'N4') {
      if (current.shipper_name && !current.origin_city) {
        current.origin_city = els[1] || '';
        current.origin_state = els[2] || '';
        current.origin_zip = els[3] || '';
      } else {
        current.destination_city = els[1] || '';
        current.destination_state = els[2] || '';
        current.destination_zip = els[3] || '';
      }
    } else if (id === 'G62') {
      if (els[1] === '10') current.pickup_date = els[2] || '';
      else if (els[1] === '02') current.delivery_date = els[2] || '';
    } else if (id === 'L11') {
      current.reference_number = els[1] || '';
    } else if (id === 'AT8') {
      current.weight = els[3] || '';
    }
  }
  if (Object.keys(current).length > 0) rows.push(current);

  const headers = [...new Set(rows.flatMap(r => Object.keys(r)))];
  return { headers, rows };
}

function detectFormat(buffer, filename) {
  const text = buffer.toString('utf-8').trim();
  // JSON detection
  if (text.startsWith('[') || text.startsWith('{')) {
    try { JSON.parse(text); return 'json'; } catch (e) { /* not json */ }
  }
  // EDI detection
  if (text.startsWith('ISA') || text.startsWith('ST')) return 'edi';
  // Default CSV
  return 'csv';
}

function parseFile(buffer, format) {
  const text = buffer.toString('utf-8').trim();
  if (format === 'json') {
    let data = JSON.parse(text);
    if (!Array.isArray(data)) data = [data];
    const headers = [...new Set(data.flatMap(r => Object.keys(r)))];
    return { headers, rows: data };
  }
  if (format === 'edi') return parseEDI(text);
  return parseCSV(text);
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTITY TYPE → TABLE NAME MAPPING
// ─────────────────────────────────────────────────────────────────────────────
const ENTITY_TABLE_MAP = {
  loads: 'lg_loads',
  carriers: 'lg_carriers',
  trucks: 'lg_trucks',
  drivers: 'lg_drivers',
  rates: 'lg_rate_benchmarks',
  invoices: 'lg_invoices',
  customers: 'lg_customers',
  compliance: 'lg_compliance',
  tracking: 'lg_tracking_events'
};

// ─────────────────────────────────────────────────────────────────────────────
// SCAN MODULES — 7 diagnostic modules
// ─────────────────────────────────────────────────────────────────────────────

async function scanLoadOperations(tenantId) {
  const findings = [];

  try {
    // Dead mile analysis
    const [loadMiles] = await sequelize.query(`
      SELECT COUNT(*) as total_loads,
             COALESCE(AVG(NULLIF(miles,0)), 0) as avg_miles,
             COALESCE(SUM(CASE WHEN miles < 100 THEN 1 ELSE 0 END), 0) as short_haul_count
      FROM lg_loads WHERE tenant_id = :tid
    `, { replacements: { tid: tenantId } });

    const lm = loadMiles[0] || {};
    const totalLoads = parseInt(lm.total_loads) || 0;

    if (totalLoads === 0) {
      findings.push({
        scan_module: 'load_operations', severity: 'info', category: 'data_quality',
        title: 'No load data found',
        diagnostic: 'No loads were found for this tenant. Import load data to enable operational diagnostics.',
        prescription: 'Upload load data via the OBD Scanner ingestion pipeline or connect your TMS.',
        recommended_agent: 'DataConnector', recommended_tools: ['upload_file', 'map_fields'],
        estimated_monthly_savings: null, confidence: 'high', data: {}
      });
      return findings;
    }

    // Lane concentration
    const [lanes] = await sequelize.query(`
      SELECT origin_state || '-' || destination_state as lane,
             COUNT(*) as load_count,
             COALESCE(AVG(sell_rate::numeric), 0) as avg_rate
      FROM lg_loads WHERE tenant_id = :tid AND origin_state IS NOT NULL AND destination_state IS NOT NULL
      GROUP BY origin_state, destination_state
      ORDER BY load_count DESC LIMIT 10
    `, { replacements: { tid: tenantId } });

    if (lanes.length > 0) {
      const topLane = lanes[0];
      const topLanePct = totalLoads > 0 ? Math.round((parseInt(topLane.load_count) / totalLoads) * 100) : 0;
      if (topLanePct > 40) {
        findings.push({
          scan_module: 'load_operations', severity: 'warning', category: 'lane_concentration',
          title: `High lane concentration: ${topLane.lane} = ${topLanePct}% of loads`,
          diagnostic: `Your top lane ${topLane.lane} accounts for ${topLanePct}% of all loads. Concentration above 40% creates vulnerability to market shifts, rate pressure, and capacity squeezes in that corridor.`,
          prescription: `1. Diversify by prospecting shippers in adjacent lanes. 2. Build backhaul partnerships to reduce deadhead on the return leg. 3. Consider rate locks or contracts for this high-volume lane. 4. Develop 2-3 alternative lanes that rebalance your portfolio below 30% concentration.`,
          recommended_agent: 'LaneAnalyzer', recommended_tools: ['find_backhaul_lanes', 'rate_benchmarking', 'shipper_prospecting'],
          estimated_monthly_savings: Math.round(totalLoads * 0.02 * parseFloat(topLane.avg_rate || 1500)), confidence: 'high',
          data: { top_lane: topLane.lane, concentration_pct: topLanePct, load_count: parseInt(topLane.load_count), top_10_lanes: lanes }
        });
      }
    }

    // Load-to-truck ratio
    const [truckCount] = await sequelize.query(`SELECT COUNT(*) as cnt FROM lg_trucks WHERE tenant_id = :tid AND status != 'inactive'`, { replacements: { tid: tenantId } });
    const activeTrucks = parseInt(truckCount[0]?.cnt) || 0;
    if (activeTrucks > 0) {
      const ratio = (totalLoads / activeTrucks).toFixed(1);
      if (parseFloat(ratio) < 3) {
        findings.push({
          scan_module: 'load_operations', severity: 'critical', category: 'utilization',
          title: `Low load-to-truck ratio: ${ratio} loads per truck`,
          diagnostic: `With ${totalLoads} loads across ${activeTrucks} active trucks, your ratio is ${ratio}. Industry benchmark is 4-6 loads per truck per month. This indicates significant under-utilization of available capacity.`,
          prescription: `1. Review dispatch efficiency — are trucks sitting idle between loads? 2. Optimize route planning to chain loads and reduce empty miles. 3. Consider reducing fleet size or subletting capacity. 4. Target high-frequency lanes for relay operations.`,
          recommended_agent: 'FleetOptimizer', recommended_tools: ['optimize_dispatch', 'chain_loads', 'capacity_planning'],
          estimated_monthly_savings: Math.round(activeTrucks * 500 * (4 - parseFloat(ratio))), confidence: 'medium',
          data: { total_loads: totalLoads, active_trucks: activeTrucks, ratio: parseFloat(ratio), benchmark: '4-6' }
        });
      }
    }

    // Win rate on quotes
    const [quoteStats] = await sequelize.query(`
      SELECT COUNT(*) as total_quotes,
             SUM(CASE WHEN outcome = 'won' THEN 1 ELSE 0 END) as won_quotes
      FROM lg_quotes WHERE tenant_id = :tid
    `, { replacements: { tid: tenantId } });

    const totalQuotes = parseInt(quoteStats[0]?.total_quotes) || 0;
    const wonQuotes = parseInt(quoteStats[0]?.won_quotes) || 0;
    if (totalQuotes > 10) {
      const winRate = Math.round((wonQuotes / totalQuotes) * 100);
      if (winRate < 25) {
        findings.push({
          scan_module: 'load_operations', severity: 'warning', category: 'win_rate',
          title: `Low quote win rate: ${winRate}% (${wonQuotes}/${totalQuotes})`,
          diagnostic: `Your quote win rate is ${winRate}%, below the 30-40% industry benchmark. You may be pricing too high, responding too slowly, or targeting the wrong lanes.`,
          prescription: `1. Analyze lost quotes by lane to identify pricing gaps. 2. Reduce quote response time — aim for under 15 minutes. 3. Use rate intelligence to price competitively on high-probability lanes. 4. Focus quoting effort on lanes where you have carrier relationships.`,
          recommended_agent: 'QuoteOptimizer', recommended_tools: ['analyze_lost_quotes', 'rate_benchmarking', 'auto_quote'],
          estimated_monthly_savings: Math.round((totalQuotes * 0.1) * 200), confidence: 'medium',
          data: { total_quotes: totalQuotes, won_quotes: wonQuotes, win_rate: winRate, benchmark: '30-40%' }
        });
      } else if (winRate > 70) {
        findings.push({
          scan_module: 'load_operations', severity: 'advisory', category: 'win_rate',
          title: `Very high win rate: ${winRate}% — you may be leaving money on the table`,
          diagnostic: `A ${winRate}% win rate suggests your pricing is below market. While high volume is good, you could likely increase rates by 5-10% and still maintain healthy volume.`,
          prescription: `1. Gradually increase rates by 3-5% on your strongest lanes. 2. A/B test pricing on similar lanes. 3. Focus on margin per load, not just volume.`,
          recommended_agent: 'QuoteOptimizer', recommended_tools: ['margin_analysis', 'rate_optimization'],
          estimated_monthly_savings: Math.round(wonQuotes * 75), confidence: 'medium',
          data: { total_quotes: totalQuotes, won_quotes: wonQuotes, win_rate: winRate }
        });
      }
    }

    // Short haul analysis
    const shortHaulCount = parseInt(lm.short_haul_count) || 0;
    const shortHaulPct = totalLoads > 0 ? Math.round((shortHaulCount / totalLoads) * 100) : 0;
    if (shortHaulPct > 30) {
      findings.push({
        scan_module: 'load_operations', severity: 'advisory', category: 'dead_miles',
        title: `${shortHaulPct}% of loads are short-haul (<100 miles)`,
        diagnostic: `${shortHaulCount} of ${totalLoads} loads are under 100 miles. Short-haul loads have higher cost ratios due to fixed costs (loading, unloading, dwell time) being spread over fewer miles.`,
        prescription: `1. Bundle short-haul loads into multi-stop routes. 2. Negotiate minimum charges that cover fixed costs. 3. Prioritize short-haul loads with high rate-per-mile. 4. Use dedicated/regional carriers for dray and local moves.`,
        recommended_agent: 'RouteOptimizer', recommended_tools: ['bundle_loads', 'multi_stop_routing', 'min_charge_analysis'],
        estimated_monthly_savings: Math.round(shortHaulCount * 35), confidence: 'medium',
        data: { short_haul_count: shortHaulCount, total_loads: totalLoads, pct: shortHaulPct }
      });
    }
  } catch (err) {
    findings.push({
      scan_module: 'load_operations', severity: 'info', category: 'scan_error',
      title: 'Load operations scan encountered an error',
      diagnostic: `Error querying load data: ${err.message}. This may indicate missing tables or schema differences.`,
      prescription: 'Ensure lg_loads, lg_trucks, and lg_quotes tables exist and contain data for this tenant.',
      recommended_agent: 'DataConnector', recommended_tools: ['verify_schema', 'seed_demo_data'],
      estimated_monthly_savings: null, confidence: 'low', data: { error: err.message }
    });
  }

  return findings;
}

async function scanRateIntelligence(tenantId) {
  const findings = [];

  try {
    // Margin per load
    const [marginData] = await sequelize.query(`
      SELECT COUNT(*) as cnt,
             COALESCE(AVG(NULLIF(sell_rate::numeric, 0)), 0) as avg_customer_rate,
             COALESCE(AVG(NULLIF(buy_rate::numeric, 0)), 0) as avg_carrier_rate,
             COALESCE(AVG(NULLIF(sell_rate::numeric, 0) - NULLIF(buy_rate::numeric, 0)), 0) as avg_margin,
             COALESCE(AVG(CASE WHEN NULLIF(sell_rate::numeric,0) > 0 THEN ((sell_rate::numeric - COALESCE(buy_rate::numeric,0)) / sell_rate::numeric * 100) END), 0) as avg_margin_pct
      FROM lg_loads WHERE tenant_id = :tid AND sell_rate IS NOT NULL
    `, { replacements: { tid: tenantId } });

    const md = marginData[0] || {};
    const avgMarginPct = parseFloat(md.avg_margin_pct) || 0;
    const avgMargin = parseFloat(md.avg_margin) || 0;
    const loadCount = parseInt(md.cnt) || 0;

    if (loadCount > 0 && avgMarginPct < 12) {
      findings.push({
        scan_module: 'rate_intelligence', severity: 'critical', category: 'margin',
        title: `Below-target margins: ${avgMarginPct.toFixed(1)}% average (industry: 15-18%)`,
        diagnostic: `Average gross margin is ${avgMarginPct.toFixed(1)}% ($${avgMargin.toFixed(0)} per load). The freight brokerage benchmark is 15-18%. At current volume, this margin gap costs approximately $${Math.round((0.15 - avgMarginPct/100) * parseFloat(md.avg_customer_rate) * loadCount)} in missed revenue.`,
        prescription: `1. Identify bottom-10% margin loads and renegotiate or drop them. 2. Use rate benchmarking to find lanes where you're under-pricing. 3. Negotiate volume discounts with carriers on high-frequency lanes. 4. Add fuel surcharge pass-through where missing. 5. Consider load bundling for better carrier rates.`,
        recommended_agent: 'RateAnalyzer', recommended_tools: ['margin_analysis', 'rate_benchmarking', 'carrier_negotiation'],
        estimated_monthly_savings: Math.round(loadCount * (0.15 * parseFloat(md.avg_customer_rate || 2000) - avgMargin)), confidence: 'high',
        data: { avg_margin_pct: avgMarginPct.toFixed(1), avg_margin_dollars: avgMargin.toFixed(0), avg_customer_rate: parseFloat(md.avg_customer_rate).toFixed(0), avg_carrier_rate: parseFloat(md.avg_carrier_rate).toFixed(0), load_count: loadCount }
      });
    }

    // Negative margin loads
    const [negativeMargin] = await sequelize.query(`
      SELECT COUNT(*) as cnt FROM lg_loads
      WHERE tenant_id = :tid AND sell_rate IS NOT NULL AND buy_rate IS NOT NULL
      AND sell_rate::numeric < buy_rate::numeric AND sell_rate::numeric > 0
    `, { replacements: { tid: tenantId } });

    const negCount = parseInt(negativeMargin[0]?.cnt) || 0;
    if (negCount > 0) {
      const negPct = loadCount > 0 ? Math.round((negCount / loadCount) * 100) : 0;
      findings.push({
        scan_module: 'rate_intelligence', severity: 'critical', category: 'negative_margin',
        title: `${negCount} loads with negative margin (${negPct}% of book)`,
        diagnostic: `You have ${negCount} loads where carrier pay exceeds customer rate. This represents direct losses. Common causes: emergency coverage at spot rates, rate miscalculation, or contractual obligations below cost.`,
        prescription: `1. Flag all negative-margin loads for immediate review. 2. Implement rate floor alerts before booking. 3. Renegotiate or exit contracts that force below-cost operations. 4. Build a spot-rate alert system to catch market spikes before accepting loads.`,
        recommended_agent: 'RateAnalyzer', recommended_tools: ['flag_negative_margin', 'rate_floor_alerts', 'contract_review'],
        estimated_monthly_savings: Math.round(negCount * 150), confidence: 'high',
        data: { negative_margin_loads: negCount, total_loads: loadCount, pct: negPct }
      });
    }

    // Benchmark rate comparison
    const [rateBenchmarks] = await sequelize.query(`
      SELECT COUNT(*) as cnt, COALESCE(AVG(rate_per_mile_avg::numeric), 0) as avg_benchmark,
             COALESCE(AVG(sample_size), 0) as avg_sample
      FROM lg_rate_benchmarks WHERE tenant_id = :tid
    `, { replacements: { tid: tenantId } });

    if (parseInt(rateBenchmarks[0]?.cnt) > 5) {
      findings.push({
        scan_module: 'rate_intelligence', severity: 'advisory', category: 'rate_benchmarks',
        title: `${rateBenchmarks[0].cnt} lane benchmarks available for pricing optimization`,
        diagnostic: `You have ${rateBenchmarks[0].cnt} market rate benchmarks with an average rate of $${parseFloat(rateBenchmarks[0].avg_benchmark).toFixed(2)}/mile. Use these to validate your pricing on key lanes.`,
        prescription: `1. Compare each active lane's actual RPM against benchmarks. 2. Flag lanes where you're 10%+ below market. 3. Use benchmarks to support rate increase negotiations. 4. Update benchmarks quarterly from DAT/Truckstop data.`,
        recommended_agent: 'RateAnalyzer', recommended_tools: ['rate_benchmarking', 'lane_analysis'],
        estimated_monthly_savings: Math.round(parseInt(rateBenchmarks[0].cnt) * 100), confidence: 'medium',
        data: { benchmark_count: parseInt(rateBenchmarks[0].cnt), avg_benchmark_rpm: parseFloat(rateBenchmarks[0].avg_benchmark).toFixed(2) }
      });
    }

    // Lanes below market rate
    const [belowMarket] = await sequelize.query(`
      SELECT rb.origin_state, rb.destination_state, rb.rate_per_mile_avg as benchmark_rpm,
             COALESCE(AVG(l.sell_rate::numeric / NULLIF(l.miles::numeric, 0)), 0) as actual_rpm
      FROM lg_rate_benchmarks rb
      LEFT JOIN lg_loads l ON l.tenant_id = rb.tenant_id
        AND l.origin_state = rb.origin_state AND l.destination_state = rb.destination_state
      WHERE rb.tenant_id = :tid AND rb.rate_per_mile_avg IS NOT NULL
      GROUP BY rb.origin_state, rb.destination_state, rb.rate_per_mile_avg
      HAVING COALESCE(AVG(l.sell_rate::numeric / NULLIF(l.miles::numeric, 0)), 0) > 0
        AND COALESCE(AVG(l.sell_rate::numeric / NULLIF(l.miles::numeric, 0)), 0) < rb.rate_per_mile_avg::numeric * 0.9
      LIMIT 10
    `, { replacements: { tid: tenantId } });

    if (belowMarket.length > 0) {
      findings.push({
        scan_module: 'rate_intelligence', severity: 'warning', category: 'below_market',
        title: `${belowMarket.length} lanes priced 10%+ below market benchmarks`,
        diagnostic: `Found ${belowMarket.length} lanes where your actual rate per mile is more than 10% below the benchmark. This suggests either outdated contracts, competitive pressure, or under-pricing.`,
        prescription: `1. Review and reprice each below-market lane. 2. Prepare data-backed rate increase proposals for customers. 3. For contract lanes, flag for next renewal negotiation. 4. Consider exiting lanes where you can't achieve margin parity.`,
        recommended_agent: 'RateAnalyzer', recommended_tools: ['rate_benchmarking', 'reprice_lanes', 'customer_rate_proposal'],
        estimated_monthly_savings: Math.round(belowMarket.length * 200), confidence: 'medium',
        data: { below_market_lanes: belowMarket.map(l => ({ lane: `${l.origin_state}-${l.destination_state}`, benchmark_rpm: l.benchmark_rpm, actual_rpm: parseFloat(l.actual_rpm).toFixed(2) })) }
      });
    }
  } catch (err) {
    findings.push({
      scan_module: 'rate_intelligence', severity: 'info', category: 'scan_error',
      title: 'Rate intelligence scan encountered an error',
      diagnostic: `Error: ${err.message}`,
      prescription: 'Ensure lg_loads, lg_quotes, and lg_rate_benchmarks tables exist with rate data.',
      recommended_agent: 'DataConnector', recommended_tools: ['verify_schema'],
      estimated_monthly_savings: null, confidence: 'low', data: { error: err.message }
    });
  }

  return findings;
}

async function scanFleetUtilization(tenantId) {
  const findings = [];

  try {
    // Idle trucks
    const [truckStatus] = await sequelize.query(`
      SELECT status, COUNT(*) as cnt FROM lg_trucks
      WHERE tenant_id = :tid GROUP BY status
    `, { replacements: { tid: tenantId } });

    const totalTrucks = truckStatus.reduce((s, r) => s + parseInt(r.cnt), 0);
    const idleTrucks = truckStatus.filter(r => ['idle','available','parked','inactive'].includes((r.status || '').toLowerCase())).reduce((s, r) => s + parseInt(r.cnt), 0);

    if (totalTrucks > 0) {
      const idlePct = Math.round((idleTrucks / totalTrucks) * 100);
      if (idlePct > 20) {
        findings.push({
          scan_module: 'fleet_utilization', severity: 'critical', category: 'idle_trucks',
          title: `${idlePct}% truck idle rate (${idleTrucks}/${totalTrucks} trucks)`,
          diagnostic: `${idleTrucks} of ${totalTrucks} trucks are idle. Each idle truck costs approximately $800-1200/month in insurance, parking, and depreciation. Industry target is <15% idle rate.`,
          prescription: `1. Review idle trucks for mechanical issues or driver shortages. 2. List available capacity on load boards. 3. Consider short-term lease-out for chronically idle units. 4. Right-size fleet — sell or return units with >30 days idle.`,
          recommended_agent: 'FleetOptimizer', recommended_tools: ['idle_truck_report', 'capacity_marketplace', 'fleet_rightsizing'],
          estimated_monthly_savings: Math.round(idleTrucks * 1000), confidence: 'high',
          data: { idle_trucks: idleTrucks, total_trucks: totalTrucks, idle_pct: idlePct, by_status: truckStatus }
        });
      }
    }

    // Equipment type distribution vs load demand
    const [equipDemand] = await sequelize.query(`
      SELECT equipment_type, COUNT(*) as load_count FROM lg_loads
      WHERE tenant_id = :tid AND equipment_type IS NOT NULL
      GROUP BY equipment_type ORDER BY load_count DESC
    `, { replacements: { tid: tenantId } });

    const [equipSupply] = await sequelize.query(`
      SELECT equipment_type, COUNT(*) as truck_count FROM lg_trucks
      WHERE tenant_id = :tid AND equipment_type IS NOT NULL AND status != 'inactive'
      GROUP BY equipment_type ORDER BY truck_count DESC
    `, { replacements: { tid: tenantId } });

    if (equipDemand.length > 0 && equipSupply.length > 0) {
      const demandMap = {};
      equipDemand.forEach(r => { demandMap[(r.equipment_type || '').toLowerCase()] = parseInt(r.load_count); });
      const supplyMap = {};
      equipSupply.forEach(r => { supplyMap[(r.equipment_type || '').toLowerCase()] = parseInt(r.truck_count); });

      const mismatches = [];
      for (const [etype, demand] of Object.entries(demandMap)) {
        const supply = supplyMap[etype] || 0;
        if (supply === 0 && demand > 5) {
          mismatches.push({ equipment: etype, demand, supply, gap: 'no_supply' });
        }
      }
      for (const [etype, supply] of Object.entries(supplyMap)) {
        const demand = demandMap[etype] || 0;
        if (demand === 0 && supply > 2) {
          mismatches.push({ equipment: etype, demand, supply, gap: 'no_demand' });
        }
      }

      if (mismatches.length > 0) {
        findings.push({
          scan_module: 'fleet_utilization', severity: 'warning', category: 'equipment_mismatch',
          title: `Equipment mismatch: ${mismatches.length} type(s) with supply/demand gaps`,
          diagnostic: `Found equipment types where your fleet composition doesn't match load demand. This leads to missed loads (no matching trucks) or idle assets (trucks with no matching loads).`,
          prescription: `1. Reallocate or trade equipment to match demand patterns. 2. Partner with carriers who have complementary equipment. 3. Adjust sales focus to lanes matching your equipment mix. 4. Consider lease-swaps for chronic mismatches.`,
          recommended_agent: 'FleetOptimizer', recommended_tools: ['equipment_analysis', 'carrier_matching', 'fleet_rebalancing'],
          estimated_monthly_savings: Math.round(mismatches.length * 800), confidence: 'medium',
          data: { mismatches, demand_distribution: equipDemand, supply_distribution: equipSupply }
        });
      }
    }

    // Dispatch efficiency — loads per dispatch
    const [dispatchData] = await sequelize.query(`
      SELECT COUNT(*) as total_dispatches,
             COUNT(DISTINCT truck_id) as unique_trucks,
             COUNT(DISTINCT driver_id) as unique_drivers
      FROM lg_dispatches WHERE tenant_id = :tid
    `, { replacements: { tid: tenantId } });

    const dd = dispatchData[0] || {};
    const totalDispatches = parseInt(dd.total_dispatches) || 0;
    const uniqueTrucks = parseInt(dd.unique_trucks) || 0;

    if (totalDispatches > 0 && totalTrucks > 0 && uniqueTrucks > 0) {
      const dispatchCoverage = Math.round((uniqueTrucks / totalTrucks) * 100);
      if (dispatchCoverage < 70) {
        findings.push({
          scan_module: 'fleet_utilization', severity: 'warning', category: 'dispatch_coverage',
          title: `Only ${dispatchCoverage}% of fleet has dispatch records`,
          diagnostic: `${uniqueTrucks} of ${totalTrucks} trucks appear in dispatch records. ${totalTrucks - uniqueTrucks} trucks have no dispatches, suggesting they're untracked, out of service, or under-utilized.`,
          prescription: `1. Audit trucks without dispatches — identify reason for inactivity. 2. Ensure all active trucks are captured in dispatch system. 3. Consider ELD integration for automatic dispatch tracking.`,
          recommended_agent: 'FleetOptimizer', recommended_tools: ['fleet_audit', 'eld_integration', 'dispatch_tracking'],
          estimated_monthly_savings: Math.round((totalTrucks - uniqueTrucks) * 600), confidence: 'medium',
          data: { total_trucks: totalTrucks, dispatched_trucks: uniqueTrucks, coverage_pct: dispatchCoverage, total_dispatches: totalDispatches }
        });
      }
    }
  } catch (err) {
    findings.push({
      scan_module: 'fleet_utilization', severity: 'info', category: 'scan_error',
      title: 'Fleet utilization scan encountered an error',
      diagnostic: `Error: ${err.message}`,
      prescription: 'Ensure lg_trucks and lg_dispatches tables exist.',
      recommended_agent: 'DataConnector', recommended_tools: ['verify_schema'],
      estimated_monthly_savings: null, confidence: 'low', data: { error: err.message }
    });
  }

  return findings;
}

async function scanFinancialHealth(tenantId) {
  const findings = [];

  try {
    // Average revenue per load
    const [revData] = await sequelize.query(`
      SELECT COUNT(*) as cnt,
             COALESCE(AVG(NULLIF(sell_rate::numeric, 0)), 0) as avg_revenue,
             COALESCE(MIN(NULLIF(sell_rate::numeric, 0)), 0) as min_revenue,
             COALESCE(MAX(NULLIF(sell_rate::numeric, 0)), 0) as max_revenue,
             COALESCE(SUM(NULLIF(sell_rate::numeric, 0)), 0) as total_revenue
      FROM lg_loads WHERE tenant_id = :tid AND sell_rate IS NOT NULL
    `, { replacements: { tid: tenantId } });

    const rv = revData[0] || {};
    const loadCount = parseInt(rv.cnt) || 0;
    const avgRevenue = parseFloat(rv.avg_revenue) || 0;
    const totalRevenue = parseFloat(rv.total_revenue) || 0;

    if (loadCount > 0) {
      // Revenue distribution (coefficient of variation)
      const [revStd] = await sequelize.query(`
        SELECT COALESCE(STDDEV(NULLIF(sell_rate::numeric, 0)), 0) as rev_stddev
        FROM lg_loads WHERE tenant_id = :tid AND sell_rate IS NOT NULL
      `, { replacements: { tid: tenantId } });

      const stddev = parseFloat(revStd[0]?.rev_stddev) || 0;
      const cv = avgRevenue > 0 ? (stddev / avgRevenue) : 0;

      if (cv > 0.8) {
        findings.push({
          scan_module: 'financial_health', severity: 'warning', category: 'revenue_volatility',
          title: `High revenue volatility: CV = ${cv.toFixed(2)} (target: <0.5)`,
          diagnostic: `Your load revenue has a coefficient of variation of ${cv.toFixed(2)}, indicating highly unpredictable revenue per load. This makes financial planning and cash flow management difficult.`,
          prescription: `1. Segment loads by service type and price each segment consistently. 2. Set minimum rate floors per lane/equipment combination. 3. Increase contract freight % to reduce volatility. 4. Review outlier loads — very high or very low — for pricing errors.`,
          recommended_agent: 'FinanceAnalyzer', recommended_tools: ['revenue_segmentation', 'rate_floor_builder', 'contract_analysis'],
          estimated_monthly_savings: Math.round(totalRevenue * 0.02), confidence: 'medium',
          data: { avg_revenue: avgRevenue.toFixed(0), stddev: stddev.toFixed(0), cv: cv.toFixed(2), total_revenue: totalRevenue.toFixed(0), load_count: loadCount }
        });
      }

      // Factoring dependency (if carrier_rate and carrier_pay patterns exist)
      const [carrierPay] = await sequelize.query(`
        SELECT COALESCE(SUM(NULLIF(buy_rate::numeric, 0)), 0) as total_carrier_cost
        FROM lg_loads WHERE tenant_id = :tid AND buy_rate IS NOT NULL
      `, { replacements: { tid: tenantId } });

      const totalCarrierCost = parseFloat(carrierPay[0]?.total_carrier_cost) || 0;
      if (totalCarrierCost > 0 && totalRevenue > 0) {
        const costRatio = totalCarrierCost / totalRevenue;
        if (costRatio > 0.88) {
          findings.push({
            scan_module: 'financial_health', severity: 'critical', category: 'cost_ratio',
            title: `Carrier cost ratio at ${(costRatio * 100).toFixed(1)}% — dangerously thin margins`,
            diagnostic: `Carrier costs consume ${(costRatio * 100).toFixed(1)}% of revenue, leaving only ${((1 - costRatio) * 100).toFixed(1)}% for operating expenses and profit. At this ratio, any operational issue (claims, re-work, billing errors) erases profitability.`,
            prescription: `1. Immediately audit bottom-quartile margin loads. 2. Renegotiate carrier rates on your top 20 lanes. 3. Implement real-time margin tracking before load confirmation. 4. Target 82-85% cost ratio for sustainable operations. 5. Consider a carrier rate cap system.`,
            recommended_agent: 'FinanceAnalyzer', recommended_tools: ['cost_analysis', 'margin_tracker', 'carrier_rate_audit'],
            estimated_monthly_savings: Math.round(totalRevenue * (costRatio - 0.85)), confidence: 'high',
            data: { total_revenue: totalRevenue.toFixed(0), total_carrier_cost: totalCarrierCost.toFixed(0), cost_ratio: (costRatio * 100).toFixed(1) }
          });
        }
      }

      // AR aging simulation
      const [arData] = await sequelize.query(`
        SELECT COUNT(*) as cnt,
               COALESCE(SUM(CASE WHEN status IN ('delivered','invoiced','completed') AND delivery_date IS NOT NULL
                 AND delivery_date::date < CURRENT_DATE - INTERVAL '30 days' THEN 1 ELSE 0 END), 0) as over_30,
               COALESCE(SUM(CASE WHEN status IN ('delivered','invoiced','completed') AND delivery_date IS NOT NULL
                 AND delivery_date::date < CURRENT_DATE - INTERVAL '60 days' THEN 1 ELSE 0 END), 0) as over_60,
               COALESCE(SUM(CASE WHEN status IN ('delivered','invoiced','completed') AND delivery_date IS NOT NULL
                 AND delivery_date::date < CURRENT_DATE - INTERVAL '90 days' THEN 1 ELSE 0 END), 0) as over_90
        FROM lg_loads WHERE tenant_id = :tid
      `, { replacements: { tid: tenantId } });

      const over30 = parseInt(arData[0]?.over_30) || 0;
      const over60 = parseInt(arData[0]?.over_60) || 0;
      const over90 = parseInt(arData[0]?.over_90) || 0;

      if (over60 > 5) {
        findings.push({
          scan_module: 'financial_health', severity: over90 > 3 ? 'critical' : 'warning', category: 'ar_aging',
          title: `AR aging concern: ${over30} loads 30+ days, ${over60} loads 60+ days, ${over90} loads 90+ days`,
          diagnostic: `Significant accounts receivable aging detected. ${over60} loads delivered 60+ days ago may still be unpaid, tying up working capital and increasing bad debt risk.`,
          prescription: `1. Implement automated invoice reminders at 15/30/45/60 days. 2. Escalate 60+ day accounts to collections process. 3. Consider factoring for chronic slow-pay customers. 4. Require prepayment or deposits from new/small customers. 5. Review credit terms for repeat offenders.`,
          recommended_agent: 'FinanceAnalyzer', recommended_tools: ['ar_aging_report', 'auto_collections', 'credit_review'],
          estimated_monthly_savings: Math.round(over60 * avgRevenue * 0.03), confidence: 'medium',
          data: { over_30: over30, over_60: over60, over_90: over90 }
        });
      }
    }
  } catch (err) {
    findings.push({
      scan_module: 'financial_health', severity: 'info', category: 'scan_error',
      title: 'Financial health scan encountered an error',
      diagnostic: `Error: ${err.message}`,
      prescription: 'Ensure lg_loads table has sell_rate and buy_rate columns with data.',
      recommended_agent: 'DataConnector', recommended_tools: ['verify_schema'],
      estimated_monthly_savings: null, confidence: 'low', data: { error: err.message }
    });
  }

  return findings;
}

async function scanComplianceRisk(tenantId) {
  const findings = [];

  try {
    // Carrier operating status check
    const [insuranceData] = await sequelize.query(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN operating_status IS NULL OR LOWER(operating_status) NOT IN ('active','authorized') THEN 1 ELSE 0 END) as lapsed,
             SUM(CASE WHEN LOWER(operating_status) IN ('active','authorized') THEN 1 ELSE 0 END) as active
      FROM lg_carriers WHERE tenant_id = :tid
    `, { replacements: { tid: tenantId } });

    const totalCarriers = parseInt(insuranceData[0]?.total) || 0;
    const lapsedInsurance = parseInt(insuranceData[0]?.lapsed) || 0;

    if (lapsedInsurance > 0) {
      const lapsedPct = Math.round((lapsedInsurance / totalCarriers) * 100);
      findings.push({
        scan_module: 'compliance_risk', severity: 'critical', category: 'insurance',
        title: `${lapsedInsurance} carriers (${lapsedPct}%) with lapsed/missing insurance`,
        diagnostic: `${lapsedInsurance} of ${totalCarriers} carriers have lapsed, expired, or missing insurance status. Using uninsured carriers exposes you to catastrophic liability — a single incident could result in multi-million dollar claims with no coverage.`,
        prescription: `1. IMMEDIATELY stop dispatching to carriers with lapsed insurance. 2. Send automated insurance certificate requests to all lapsed carriers. 3. Implement real-time FMCSA monitoring for insurance status changes. 4. Require Certificates of Insurance (COI) before first load. 5. Set up 30/15/7 day expiry alerts.`,
        recommended_agent: 'ComplianceMonitor', recommended_tools: ['insurance_audit', 'fmcsa_monitor', 'coi_request', 'carrier_block'],
        estimated_monthly_savings: null, confidence: 'high',
        data: { total_carriers: totalCarriers, lapsed: lapsedInsurance, lapsed_pct: lapsedPct }
      });
    }

    // Reliability score distribution
    const [safetyData] = await sequelize.query(`
      SELECT
        CASE WHEN reliability_score >= 80 THEN 'satisfactory'
             WHEN reliability_score >= 60 THEN 'conditional'
             WHEN reliability_score IS NOT NULL THEN 'unsatisfactory'
             ELSE 'unrated' END as safety_rating,
        COUNT(*) as cnt
      FROM lg_carriers WHERE tenant_id = :tid
      GROUP BY 1 ORDER BY cnt DESC
    `, { replacements: { tid: tenantId } });

    const unsafeCarriers = safetyData.filter(r => ['conditional','unsatisfactory','unrated'].includes(r.safety_rating));
    const unsafeCount = unsafeCarriers.reduce((s, r) => s + parseInt(r.cnt), 0);

    if (unsafeCount > 0) {
      findings.push({
        scan_module: 'compliance_risk', severity: 'warning', category: 'safety_rating',
        title: `${unsafeCount} carriers with low reliability scores`,
        diagnostic: `Found ${unsafeCount} carriers with reliability scores below 80 (conditional or unsatisfactory). Low-reliability carriers have higher incident rates and service failures.`,
        prescription: `1. Review and potentially suspend low-scoring carriers. 2. Require performance improvement plans. 3. Set up automated alerts for score changes. 4. Prioritize high-reliability carriers in dispatch. 5. Add reliability score as a weighted factor in carrier assignment.`,
        recommended_agent: 'ComplianceMonitor', recommended_tools: ['safety_audit', 'carrier_scoring', 'performance_tracking'],
        estimated_monthly_savings: null, confidence: 'high',
        data: { reliability_distribution: safetyData, low_reliability_count: unsafeCount }
      });
    }

    // Compliance record checks
    const [compData] = await sequelize.query(`
      SELECT compliance_type as type, COUNT(*) as cnt,
             SUM(CASE WHEN expiry_date IS NOT NULL AND expiry_date::date < CURRENT_DATE THEN 1 ELSE 0 END) as expired,
             SUM(CASE WHEN expiry_date IS NOT NULL AND expiry_date::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days' THEN 1 ELSE 0 END) as expiring_30
      FROM lg_compliance WHERE tenant_id = :tid
      GROUP BY compliance_type
    `, { replacements: { tid: tenantId } });

    const totalExpired = compData.reduce((s, r) => s + parseInt(r.expired || 0), 0);
    const totalExpiring = compData.reduce((s, r) => s + parseInt(r.expiring_30 || 0), 0);

    if (totalExpired > 0) {
      findings.push({
        scan_module: 'compliance_risk', severity: 'critical', category: 'expired_compliance',
        title: `${totalExpired} expired compliance items across ${compData.length} categories`,
        diagnostic: `Found ${totalExpired} expired compliance records. Expired permits, licenses, or certifications can result in fines, load rejections, and legal liability.`,
        prescription: `1. Generate an urgent renewal list sorted by risk severity. 2. Contact carriers/drivers with expired items immediately. 3. Block dispatch for carriers with critical expired items. 4. Implement automated renewal reminders at 60/30/15/7 day intervals.`,
        recommended_agent: 'ComplianceMonitor', recommended_tools: ['compliance_audit', 'renewal_tracker', 'auto_reminders', 'dispatch_block'],
        estimated_monthly_savings: Math.round(totalExpired * 500), confidence: 'high',
        data: { expired: totalExpired, expiring_30: totalExpiring, by_type: compData }
      });
    } else if (totalExpiring > 0) {
      findings.push({
        scan_module: 'compliance_risk', severity: 'warning', category: 'expiring_compliance',
        title: `${totalExpiring} compliance items expiring within 30 days`,
        diagnostic: `${totalExpiring} compliance records will expire within 30 days. Proactive renewal prevents service disruptions and compliance gaps.`,
        prescription: `1. Send renewal reminders to all affected parties. 2. Track renewal progress in compliance dashboard. 3. Escalate items within 7 days of expiry.`,
        recommended_agent: 'ComplianceMonitor', recommended_tools: ['renewal_tracker', 'auto_reminders'],
        estimated_monthly_savings: Math.round(totalExpiring * 200), confidence: 'medium',
        data: { expiring_30: totalExpiring, by_type: compData }
      });
    }
  } catch (err) {
    findings.push({
      scan_module: 'compliance_risk', severity: 'info', category: 'scan_error',
      title: 'Compliance risk scan encountered an error',
      diagnostic: `Error: ${err.message}`,
      prescription: 'Ensure lg_compliance and lg_carriers tables exist.',
      recommended_agent: 'DataConnector', recommended_tools: ['verify_schema'],
      estimated_monthly_savings: null, confidence: 'low', data: { error: err.message }
    });
  }

  return findings;
}

async function scanDriverRetention(tenantId) {
  const findings = [];

  try {
    const [driverData] = await sequelize.query(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN status IS NULL OR LOWER(status) IN ('off_duty','off duty','sleeper','sleeper_berth','resting','available') THEN 1 ELSE 0 END) as off_duty,
             SUM(CASE WHEN LOWER(status) IN ('driving','on_duty','on duty','on_duty_driving','dispatched') THEN 1 ELSE 0 END) as on_duty,
             0 as expired_medical,
             0 as expiring_medical
      FROM lg_drivers WHERE tenant_id = :tid
    `, { replacements: { tid: tenantId } });

    const dd = driverData[0] || {};
    const totalDrivers = parseInt(dd.total) || 0;

    if (totalDrivers === 0) {
      findings.push({
        scan_module: 'driver_retention', severity: 'info', category: 'data_quality',
        title: 'No driver data found',
        diagnostic: 'No drivers found for this tenant. Import driver data for retention analysis.',
        prescription: 'Upload driver roster via OBD Scanner or connect your ELD/fleet management system.',
        recommended_agent: 'DataConnector', recommended_tools: ['upload_file', 'eld_integration'],
        estimated_monthly_savings: null, confidence: 'high', data: {}
      });
      return findings;
    }

    // Medical card expiry
    const expiredMedical = parseInt(dd.expired_medical) || 0;
    const expiringMedical = parseInt(dd.expiring_medical) || 0;

    if (expiredMedical > 0) {
      findings.push({
        scan_module: 'driver_retention', severity: 'critical', category: 'medical_card',
        title: `${expiredMedical} drivers with expired medical cards`,
        diagnostic: `${expiredMedical} drivers have expired DOT medical certificates. These drivers CANNOT legally operate a CMV. Dispatching them violates FMCSA regulations and exposes the company to fines and liability.`,
        prescription: `1. IMMEDIATELY remove expired-medical drivers from dispatch. 2. Schedule medical exams within 48 hours. 3. Set up 90/60/30 day medical expiry alerts. 4. Maintain a preferred clinic network for fast renewals.`,
        recommended_agent: 'DriverManager', recommended_tools: ['medical_card_audit', 'auto_alerts', 'dispatch_block'],
        estimated_monthly_savings: null, confidence: 'high',
        data: { expired_medical: expiredMedical, expiring_60: expiringMedical, total_drivers: totalDrivers }
      });
    }

    if (expiringMedical > 0) {
      findings.push({
        scan_module: 'driver_retention', severity: 'warning', category: 'medical_card',
        title: `${expiringMedical} driver medical cards expiring within 60 days`,
        diagnostic: `${expiringMedical} drivers have medical cards expiring soon. Proactive scheduling prevents downtime and compliance gaps.`,
        prescription: `1. Send renewal reminders to affected drivers. 2. Pre-schedule medical exams. 3. Track renewal status in driver dashboard.`,
        recommended_agent: 'DriverManager', recommended_tools: ['medical_card_tracker', 'auto_reminders'],
        estimated_monthly_savings: Math.round(expiringMedical * 300), confidence: 'medium',
        data: { expiring_60: expiringMedical, total_drivers: totalDrivers }
      });
    }

    // Endorsement coverage analysis
    const [endorsements] = await sequelize.query(`
      SELECT endorsements::text as endorsements, COUNT(*) as cnt FROM lg_drivers
      WHERE tenant_id = :tid GROUP BY endorsements
    `, { replacements: { tid: tenantId } });

    const hazmatDrivers = endorsements.filter(r => { const e = String(r.endorsements || '').toLowerCase(); return e.includes('h') && e !== '{}'; }).reduce((s, r) => s + parseInt(r.cnt), 0);
    const tankerDrivers = endorsements.filter(r => { const e = String(r.endorsements || '').toLowerCase(); return e.includes('n'); }).reduce((s, r) => s + parseInt(r.cnt), 0);

    if (totalDrivers > 5 && hazmatDrivers === 0) {
      findings.push({
        scan_module: 'driver_retention', severity: 'advisory', category: 'endorsements',
        title: 'No HazMat-endorsed drivers in roster',
        diagnostic: `None of your ${totalDrivers} drivers have HazMat endorsements. This limits your ability to serve chemical, fuel, and hazardous materials shippers — a high-margin segment.`,
        prescription: `1. Identify interested drivers and sponsor HazMat endorsement training. 2. Offer pay premiums for endorsed drivers. 3. Target 15-20% of fleet with HazMat capability. 4. Partner with training providers for group rates.`,
        recommended_agent: 'DriverManager', recommended_tools: ['endorsement_analysis', 'training_planner'],
        estimated_monthly_savings: Math.round(totalDrivers * 50), confidence: 'low',
        data: { hazmat_drivers: hazmatDrivers, tanker_drivers: tankerDrivers, total_drivers: totalDrivers, endorsement_distribution: endorsements }
      });
    }

    // HOS utilization
    const onDuty = parseInt(dd.on_duty) || 0;
    const offDuty = parseInt(dd.off_duty) || 0;
    if (totalDrivers > 5) {
      const utilizationPct = Math.round((onDuty / totalDrivers) * 100);
      if (utilizationPct < 50) {
        findings.push({
          scan_module: 'driver_retention', severity: 'warning', category: 'hos_utilization',
          title: `Low driver utilization: ${utilizationPct}% on-duty (${onDuty}/${totalDrivers})`,
          diagnostic: `Only ${utilizationPct}% of drivers are currently on-duty or driving. While rest periods are normal, sustained low utilization may indicate scheduling inefficiency, driver dissatisfaction, or excess headcount.`,
          prescription: `1. Review driver schedules for optimization opportunities. 2. Implement relay driving on long-haul routes. 3. Survey off-duty drivers for satisfaction issues. 4. Consider team driving for time-sensitive lanes.`,
          recommended_agent: 'DriverManager', recommended_tools: ['schedule_optimizer', 'driver_survey', 'relay_planning'],
          estimated_monthly_savings: Math.round((totalDrivers - onDuty) * 200), confidence: 'low',
          data: { on_duty: onDuty, off_duty: offDuty, total_drivers: totalDrivers, utilization_pct: utilizationPct }
        });
      }
    }
  } catch (err) {
    findings.push({
      scan_module: 'driver_retention', severity: 'info', category: 'scan_error',
      title: 'Driver retention scan encountered an error',
      diagnostic: `Error: ${err.message}`,
      prescription: 'Ensure lg_drivers table exists with driver data.',
      recommended_agent: 'DataConnector', recommended_tools: ['verify_schema'],
      estimated_monthly_savings: null, confidence: 'low', data: { error: err.message }
    });
  }

  return findings;
}

async function scanCustomerHealth(tenantId) {
  const findings = [];

  try {
    // Shipper concentration
    const [shipperRevenue] = await sequelize.query(`
      SELECT shipper_name, COUNT(*) as load_count,
             COALESCE(SUM(NULLIF(sell_rate::numeric, 0)), 0) as total_revenue
      FROM lg_loads WHERE tenant_id = :tid AND shipper_name IS NOT NULL
      GROUP BY shipper_name ORDER BY total_revenue DESC
    `, { replacements: { tid: tenantId } });

    if (shipperRevenue.length > 0) {
      const totalRevenue = shipperRevenue.reduce((s, r) => s + parseFloat(r.total_revenue), 0);
      const totalLoads = shipperRevenue.reduce((s, r) => s + parseInt(r.load_count), 0);

      if (totalRevenue > 0) {
        // Top 3 concentration
        const top3 = shipperRevenue.slice(0, 3);
        const top3Revenue = top3.reduce((s, r) => s + parseFloat(r.total_revenue), 0);
        const top3Pct = Math.round((top3Revenue / totalRevenue) * 100);

        if (top3Pct > 60) {
          findings.push({
            scan_module: 'customer_health', severity: 'critical', category: 'concentration',
            title: `Top 3 shippers = ${top3Pct}% of revenue — dangerous concentration`,
            diagnostic: `Your top 3 customers account for ${top3Pct}% of total revenue ($${top3Revenue.toFixed(0)} of $${totalRevenue.toFixed(0)}). Losing any one of them would be devastating. Industry best practice is <50% for top 3 combined.`,
            prescription: `1. Aggressively prospect new shippers in your strongest lanes. 2. Build redundancy — for each top customer, develop 2-3 alternatives. 3. Diversify into adjacent verticals (agriculture, manufacturing, retail). 4. Lock in long-term contracts with top 3 while building alternatives. 5. Set a policy: no single customer >25% of revenue.`,
            recommended_agent: 'CustomerAnalyzer', recommended_tools: ['shipper_prospecting', 'revenue_diversification', 'contract_builder'],
            estimated_monthly_savings: null, confidence: 'high',
            data: { top_3: top3.map(s => ({ name: s.shipper_name, revenue: parseFloat(s.total_revenue).toFixed(0), loads: parseInt(s.load_count) })), top_3_pct: top3Pct, total_revenue: totalRevenue.toFixed(0), total_shippers: shipperRevenue.length }
          });
        } else if (top3Pct > 45) {
          findings.push({
            scan_module: 'customer_health', severity: 'warning', category: 'concentration',
            title: `Top 3 shippers = ${top3Pct}% of revenue — moderate concentration`,
            diagnostic: `Your top 3 customers represent ${top3Pct}% of revenue. This is within the caution zone (45-60%). Continue diversification efforts to reduce below 45%.`,
            prescription: `1. Continue shipper diversification strategy. 2. Focus growth on mid-tier customers (#4-#10). 3. Develop new lane offerings to attract diverse shippers.`,
            recommended_agent: 'CustomerAnalyzer', recommended_tools: ['shipper_prospecting', 'growth_analysis'],
            estimated_monthly_savings: null, confidence: 'medium',
            data: { top_3: top3.map(s => ({ name: s.shipper_name, revenue: parseFloat(s.total_revenue).toFixed(0), loads: parseInt(s.load_count) })), top_3_pct: top3Pct }
          });
        }

        // Single customer >30%
        const topShipper = shipperRevenue[0];
        const topShipperPct = Math.round((parseFloat(topShipper.total_revenue) / totalRevenue) * 100);
        if (topShipperPct > 30) {
          findings.push({
            scan_module: 'customer_health', severity: 'critical', category: 'single_customer_risk',
            title: `${topShipper.shipper_name} = ${topShipperPct}% of revenue — single point of failure`,
            diagnostic: `One customer (${topShipper.shipper_name}) generates ${topShipperPct}% of your revenue. If they switch brokers, go bankrupt, or cut volume, your business faces an existential threat.`,
            prescription: `1. Develop a contingency plan for sudden loss of this customer. 2. Set a 12-month goal to reduce dependency below 20%. 3. Strengthen the relationship — become indispensable through service excellence. 4. Simultaneously prospect competitors of this customer to diversify.`,
            recommended_agent: 'CustomerAnalyzer', recommended_tools: ['risk_assessment', 'contingency_planning', 'shipper_prospecting'],
            estimated_monthly_savings: null, confidence: 'high',
            data: { customer: topShipper.shipper_name, revenue: parseFloat(topShipper.total_revenue).toFixed(0), pct: topShipperPct, loads: parseInt(topShipper.load_count) }
          });
        }
      }

      // Volume trends (compare recent vs older loads)
      const [trendData] = await sequelize.query(`
        SELECT
          SUM(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 ELSE 0 END) as last_30,
          SUM(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '60 days' AND created_at < CURRENT_DATE - INTERVAL '30 days' THEN 1 ELSE 0 END) as prev_30,
          SUM(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '90 days' AND created_at < CURRENT_DATE - INTERVAL '60 days' THEN 1 ELSE 0 END) as oldest_30
        FROM lg_loads WHERE tenant_id = :tid
      `, { replacements: { tid: tenantId } });

      const last30 = parseInt(trendData[0]?.last_30) || 0;
      const prev30 = parseInt(trendData[0]?.prev_30) || 0;

      if (prev30 > 10 && last30 > 0) {
        const trend = Math.round(((last30 - prev30) / prev30) * 100);
        if (trend < -20) {
          findings.push({
            scan_module: 'customer_health', severity: 'warning', category: 'volume_trend',
            title: `Volume declining: ${trend}% month-over-month (${last30} vs ${prev30} loads)`,
            diagnostic: `Load volume dropped ${Math.abs(trend)}% in the last 30 days compared to the prior period (${last30} vs ${prev30} loads). Sustained declines indicate customer attrition, market softening, or competitive displacement.`,
            prescription: `1. Contact top 10 customers to understand volume changes. 2. Check if competitors are under-cutting your rates. 3. Review service metrics (on-time %, claims) for quality issues. 4. Increase outbound sales activity and lead generation.`,
            recommended_agent: 'CustomerAnalyzer', recommended_tools: ['churn_analysis', 'competitor_intel', 'service_metrics'],
            estimated_monthly_savings: Math.round(Math.abs(last30 - prev30) * 300), confidence: 'medium',
            data: { last_30_loads: last30, prev_30_loads: prev30, trend_pct: trend }
          });
        }
      }
    }

    // On-time delivery percentage
    const [otData] = await sequelize.query(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN status IN ('delivered','completed') THEN 1 ELSE 0 END) as on_time
      FROM lg_loads WHERE tenant_id = :tid AND status IN ('delivered','completed','invoiced')
    `, { replacements: { tid: tenantId } });

    const deliveredTotal = parseInt(otData[0]?.total) || 0;
    const onTime = parseInt(otData[0]?.on_time) || 0;

    if (deliveredTotal > 20) {
      const otPct = Math.round((onTime / deliveredTotal) * 100);
      if (otPct < 90) {
        findings.push({
          scan_module: 'customer_health', severity: otPct < 80 ? 'critical' : 'warning', category: 'on_time',
          title: `On-time delivery at ${otPct}% (target: 95%+)`,
          diagnostic: `Your on-time delivery rate is ${otPct}% across ${deliveredTotal} completed loads. The industry expectation is 95%+. Poor on-time performance is the #1 reason shippers switch brokers.`,
          prescription: `1. Analyze late deliveries by lane, carrier, and day of week. 2. Build buffer time into transit estimates. 3. Implement proactive tracking alerts at key milestones. 4. Create a carrier scorecard that penalizes chronic late delivery. 5. Over-communicate with customers when delays are likely.`,
          recommended_agent: 'CustomerAnalyzer', recommended_tools: ['on_time_analysis', 'carrier_scorecard', 'tracking_alerts'],
          estimated_monthly_savings: Math.round(deliveredTotal * (0.95 - otPct / 100) * 200), confidence: 'high',
          data: { on_time: onTime, total_delivered: deliveredTotal, on_time_pct: otPct, target: '95%' }
        });
      }
    }
  } catch (err) {
    findings.push({
      scan_module: 'customer_health', severity: 'info', category: 'scan_error',
      title: 'Customer health scan encountered an error',
      diagnostic: `Error: ${err.message}`,
      prescription: 'Ensure lg_loads and lg_shippers tables exist with customer data.',
      recommended_agent: 'DataConnector', recommended_tools: ['verify_schema'],
      estimated_monthly_savings: null, confidence: 'low', data: { error: err.message }
    });
  }

  return findings;
}

// Map module names to functions
const SCAN_MODULES = {
  load_operations: scanLoadOperations,
  rate_intelligence: scanRateIntelligence,
  fleet_utilization: scanFleetUtilization,
  financial_health: scanFinancialHealth,
  compliance_risk: scanComplianceRisk,
  driver_retention: scanDriverRetention,
  customer_health: scanCustomerHealth
};

const ALL_MODULES = Object.keys(SCAN_MODULES);

// ─────────────────────────────────────────────────────────────────────────────
// INGESTION ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

// POST /upload — File upload with format detection and preview
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const tenantId = req.body.tenant_id || 'default';
    const profileName = req.body.profile || null;
    const fileName = req.file.originalname;
    const format = detectFormat(req.file.buffer, fileName);
    const { headers, rows } = parseFile(req.file.buffer, format);

    if (headers.length === 0) return res.status(400).json({ error: 'Could not parse any data from file' });

    // Detect entity type
    const entityType = req.body.entity_type || detectEntityType(headers);

    // Fuzzy match fields
    let mappingSuggestions;
    if (profileName && INGESTION_PROFILES[profileName]) {
      const profile = INGESTION_PROFILES[profileName];
      const profileMappings = profile.mappings[entityType] || {};
      mappingSuggestions = headers.map(h => {
        if (profileMappings[h]) {
          return { header: h, canonical_field: profileMappings[h], confidence: 100, method: 'profile' };
        }
        // Fall back to fuzzy match
        const fuzzy = fuzzyMatchFields([h], entityType);
        return fuzzy[0];
      });
    } else {
      mappingSuggestions = fuzzyMatchFields(headers, entityType);
    }

    // Create batch record — store raw rows as JSONB so map-fields can insert them
    const batchId = genBatchId();
    await sequelize.query(`
      INSERT INTO lg_obd_ingestion_batches (batch_id, tenant_id, source_type, file_name, file_format, profile_used, total_rows, entity_type, field_mappings, status)
      VALUES (:batchId, :tenantId, 'file_upload', :fileName, :format, :profile, :totalRows, :entityType, :rawRows, 'mapping')
    `, { replacements: { batchId, tenantId, fileName, format, profile: profileName, totalRows: rows.length, entityType, rawRows: JSON.stringify({ rows, headers }) } });

    res.json({
      success: true,
      data: {
        batch_id: batchId,
        file_name: fileName,
        format,
        entity_type: entityType,
        total_rows: rows.length,
        headers,
        field_mappings: mappingSuggestions,
        preview: rows.slice(0, 10),
        profile_used: profileName || null,
        unmapped_fields: mappingSuggestions.filter(m => !m.canonical_field || m.confidence < 50).map(m => m.header),
        high_confidence_mappings: mappingSuggestions.filter(m => m.confidence >= 80).length,
        total_fields: headers.length
      }
    });
  } catch (err) {
    console.error('[obd/upload] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /map-fields — Confirm mappings and ingest data via CW Carriers ingestion pipeline
router.post('/map-fields', async (req, res) => {
  try {
    const { batch_id, tenant_id, field_mappings, entity_type } = req.body;
    if (!batch_id || !field_mappings) return res.status(400).json({ error: 'batch_id and field_mappings required' });

    const tid = tenant_id || 'demo';
    const etype = entity_type || 'loads';

    // Get batch info (contains stored rows from upload)
    const [batch] = await sequelize.query(`SELECT * FROM lg_obd_ingestion_batches WHERE batch_id = :batchId`, { replacements: { batchId: batch_id } });
    if (!batch || batch.length === 0) return res.status(404).json({ error: 'Batch not found' });

    // Update batch status
    await sequelize.query(`UPDATE lg_obd_ingestion_batches SET status = 'ingesting' WHERE batch_id = :batchId`,
      { replacements: { batchId: batch_id } });

    // Read stored rows from batch record
    const batchRecord = batch[0];
    const storedData = typeof batchRecord.field_mappings === 'string' ? JSON.parse(batchRecord.field_mappings) : batchRecord.field_mappings;
    const rows = storedData?.rows || req.body.rows || [];
    const headers = storedData?.headers || [];

    if (rows.length === 0) {
      return res.status(400).json({ error: 'No rows found in batch. Please re-upload the file.' });
    }

    // Build column mapping object: { "Original Header": "canonical_field" }
    let mappingObj = {};
    if (Array.isArray(field_mappings)) {
      field_mappings.forEach(m => {
        if (m.canonical_field && m.header) mappingObj[m.header] = m.canonical_field;
        if (m.target && m.source) mappingObj[m.source] = m.target;
      });
    } else {
      mappingObj = field_mappings;
    }

    // Reconstruct CSV from rows using mapped column names for the CW ingestion pipeline
    const canonicalHeaders = Object.values(mappingObj).filter(v => v && v !== 'Skip this column');
    const csvLines = [canonicalHeaders.join(',')];
    for (const row of rows) {
      const vals = [];
      for (const [origHeader, canonicalField] of Object.entries(mappingObj)) {
        if (canonicalField && canonicalField !== 'Skip this column') {
          let val = row[origHeader] !== undefined ? String(row[origHeader]) : '';
          // Quote if contains comma
          if (val.includes(',')) val = '"' + val + '"';
          vals.push(val);
        }
      }
      csvLines.push(vals.join(','));
    }
    const csvContent = csvLines.join('\n');

    let result;
    if (cwIngestion) {
      // Use the CW Carriers ingestion service — same tables, full ecosystem sync
      console.log(`[OBD] Delegating ${rows.length} ${etype} rows to CW ingestion pipeline (tenant: ${tid})`);
      result = await cwIngestion.process_upload({
        file_content: csvContent,
        file_name: batchRecord.file_name || 'obd-upload.csv',
        file_type: 'csv',
        data_type: etype,
        tenant_id: tid,
        user_id: 'obd_scanner'
      });
      console.log(`[OBD] CW ingestion result: ${result.imported} imported, ${result.skipped} skipped, ${result.errors} errors`);
    } else {
      // Fallback: direct insert if CW ingestion not available
      console.log(`[OBD] CW ingestion not available, using direct insert for ${rows.length} rows`);
      result = { imported: 0, skipped: 0, errors: 0 };
      for (let i = 0; i < rows.length; i++) {
        try {
          const row = rows[i];
          const mapped = {};
          for (const [origHeader, canonicalField] of Object.entries(mappingObj)) {
            if (canonicalField && canonicalField !== 'Skip this column') {
              mapped[canonicalField] = row[origHeader] !== undefined ? row[origHeader] : null;
            }
          }

          if (etype === 'loads') {
            const buyRate = parseFloat(mapped.carrier_rate || mapped.buy_rate) || null;
            const sellRate = parseFloat(mapped.customer_rate || mapped.sell_rate) || null;
            const miles = parseFloat(mapped.miles) || null;
            const margin = (buyRate && sellRate) ? sellRate - buyRate : null;
            const marginPct = (sellRate && margin !== null && sellRate > 0) ? ((margin / sellRate) * 100).toFixed(2) : null;
            const rpm = (sellRate && miles && miles > 0) ? (sellRate / miles).toFixed(2) : null;
            const loadRef = mapped.load_number || mapped.load_id || `OBD-${batch_id}-${i}`;
            const shipperName = mapped.shipper_name || mapped.customer || null;
            await sequelize.query(`INSERT INTO lg_loads (tenant_id, load_ref, shipper_name, origin_city, origin_state, destination_city, destination_state, pickup_date, delivery_date, equipment_type, weight_lbs, miles, buy_rate, sell_rate, margin, margin_pct, rate_per_mile, status, commodity)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) ON CONFLICT DO NOTHING`,
              { bind: [tid, loadRef, shipperName, mapped.origin_city || null, mapped.origin_state || null, mapped.destination_city || null, mapped.destination_state || null, mapped.pickup_date || null, mapped.delivery_date || null, mapped.equipment_type || 'dry_van', parseFloat(mapped.weight) || null, miles, buyRate, sellRate, margin, marginPct, rpm, mapped.status || 'delivered', mapped.commodity || null] });
            // Bridge to cw_loads for CW Carriers ecosystem
            try {
              await sequelize.query(`INSERT INTO cw_loads (load_ref, customer_name, origin_city, origin_state, dest_city, dest_state, pickup_date, delivery_date, equipment, weight, miles, sell_rate, buy_rate, margin, status)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT DO NOTHING`,
                { bind: [loadRef, shipperName, mapped.origin_city || null, mapped.origin_state || null, mapped.destination_city || null, mapped.destination_state || null, mapped.pickup_date || null, mapped.delivery_date || null, mapped.equipment_type || null, parseFloat(mapped.weight) || null, miles, sellRate, buyRate, margin, mapped.status || 'delivered'] });
            } catch(cwErr) {}
          } else if (etype === 'carriers') {
            await sequelize.query(`INSERT INTO lg_carriers (tenant_id, carrier_name, mc_number, dot_number, operating_status, reliability_score, equipment_types, home_state, phone, email, contact_name)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING`,
              { bind: [tid, mapped.carrier_name || null, mapped.mc_number || null, mapped.dot_number || null, mapped.operating_status || mapped.authority_status || 'active', parseInt(mapped.reliability_score) || 80, mapped.equipment_types || null, mapped.home_state || null, mapped.phone || null, mapped.email || null, mapped.contact_name || null] });
          } else if (etype === 'customers') {
            // Insert into lg_customers AND cw_contacts for full ecosystem sync
            await sequelize.query(`INSERT INTO lg_customers (tenant_id, customer_name, contact_name, phone, email, payment_terms)
              VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
              { bind: [tid, mapped.customer_name || mapped.company || null, mapped.contact_name || null, mapped.phone || null, mapped.email || null, mapped.payment_terms || null] });
            // Bridge to CW contacts
            try {
              const name = mapped.contact_name || '';
              const parts = name.split(' ');
              await sequelize.query(`INSERT INTO cw_contacts (first_name, last_name, email, phone, company, contact_type)
                VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
                { bind: [parts[0] || '', parts.slice(1).join(' ') || '', mapped.email || null, mapped.phone || null, mapped.customer_name || mapped.company || null, 'customer'] });
            } catch(bridgeErr) {}
          } else if (etype === 'compliance') {
            await sequelize.query(`INSERT INTO lg_compliance (tenant_id, entity_type, entity_id, compliance_type, status, effective_date, expiry_date)
              VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
              { bind: [tid, 'carrier', parseInt(mapped.entity_id) || 0, mapped.compliance_type || 'insurance', mapped.status || 'current', mapped.effective_date || null, mapped.expiry_date || null] });
          } else if (etype === 'tracking') {
            try {
              await sequelize.query(`CREATE TABLE IF NOT EXISTS lg_tracking_events (id SERIAL PRIMARY KEY, tenant_id VARCHAR(100), load_ref VARCHAR(100), carrier_name VARCHAR(200), truck_number VARCHAR(50), driver_name VARCHAR(100), status VARCHAR(50), latitude DECIMAL, longitude DECIMAL, city VARCHAR(100), state VARCHAR(10), timestamp TIMESTAMP, eta TIMESTAMP, miles_remaining INTEGER, speed INTEGER, temperature VARCHAR(20), event_type VARCHAR(50), notes TEXT, created_at TIMESTAMP DEFAULT NOW())`);
              await sequelize.query(`INSERT INTO lg_tracking_events (tenant_id, load_ref, carrier_name, truck_number, driver_name, status, latitude, longitude, city, state, timestamp, eta, miles_remaining, speed, temperature, event_type, notes)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) ON CONFLICT DO NOTHING`,
                { bind: [tid, mapped.load_ref || null, mapped.carrier_name || null, mapped.truck_number || null, mapped.driver_name || null, mapped.status || null, parseFloat(mapped.latitude) || null, parseFloat(mapped.longitude) || null, mapped.city || null, mapped.state || null, mapped.timestamp || null, mapped.eta || null, parseInt(mapped.miles_remaining) || null, parseInt(mapped.speed) || null, mapped.temperature || null, mapped.event_type || null, mapped.notes || null] });
            } catch(trackErr) {}
          } else if (etype === 'rates') {
            await sequelize.query(`INSERT INTO lg_rate_benchmarks (tenant_id, origin_state, destination_state, equipment_type, rate_per_mile_avg, rate_per_mile_p25, rate_per_mile_p75, avg_rate, sample_size, confidence, rate_date, benchmark_source)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT DO NOTHING`,
              { bind: [tid, mapped.origin_state || null, mapped.destination_state || null, mapped.equipment_type || null, parseFloat(mapped.rate_per_mile_avg) || null, parseFloat(mapped.rate_per_mile_p25) || null, parseFloat(mapped.rate_per_mile_p75) || null, parseFloat(mapped.avg_rate) || null, parseInt(mapped.sample_size) || null, mapped.confidence || 'medium', mapped.rate_date || null, mapped.benchmark_source || 'DAT'] });
          }
          result.imported++;
        } catch (e) {
          result.errors++;
        }
      }
    }

    const mappedCount = result.imported || 0;
    const failedCount = result.errors || 0;

    // Update batch
    await sequelize.query(`
      UPDATE lg_obd_ingestion_batches SET status = :status, mapped_rows = :mapped, failed_rows = :failed, completed_at = NOW()
      WHERE batch_id = :batchId
    `, { replacements: { batchId: batch_id, status: failedCount === rows.length ? 'failed' : 'complete', mapped: mappedCount, failed: failedCount } });

    res.json({
      success: true,
      data: {
        batch_id,
        entity_type: etype,
        table: tableName,
        total_rows: rows.length,
        mapped_rows: mappedCount,
        failed_rows: failedCount,
        errors: errors.slice(0, 10),
        status: failedCount === rows.length ? 'failed' : 'complete'
      }
    });
  } catch (err) {
    console.error('[obd/map-fields] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /ingestion-profiles — List known TMS profiles
router.get('/ingestion-profiles', (req, res) => {
  const profiles = Object.entries(INGESTION_PROFILES).map(([key, profile]) => ({
    id: key,
    name: profile.name,
    description: profile.description,
    entity_types: profile.entity_types,
    field_count: Object.values(profile.mappings).reduce((s, m) => s + Object.keys(m).length, 0)
  }));
  res.json({ success: true, data: profiles });
});

// GET /ingestion-status/:batchId — Check ingestion batch status
router.get('/ingestion-status/:batchId', async (req, res) => {
  try {
    const [rows] = await sequelize.query(`SELECT * FROM lg_obd_ingestion_batches WHERE batch_id = :batchId`, { replacements: { batchId: req.params.batchId } });
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Batch not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SCAN ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

// POST /scan — Run OBD diagnostic scan
router.post('/scan', async (req, res) => {
  try {
    const { tenant_id, modules } = req.body;
    if (!tenant_id) return res.status(400).json({ error: 'tenant_id required' });

    const modulesToRun = modules && modules.length > 0
      ? modules.filter(m => ALL_MODULES.includes(m))
      : ALL_MODULES;

    if (modulesToRun.length === 0) return res.status(400).json({ error: `Invalid modules. Valid: ${ALL_MODULES.join(', ')}` });

    const scanId = genScanId();
    const startTime = Date.now();
    const allFindings = [];

    // Run each module
    for (const moduleName of modulesToRun) {
      try {
        const moduleFindings = await SCAN_MODULES[moduleName](tenant_id);
        for (const finding of moduleFindings) {
          finding.scan_id = scanId;
          finding.tenant_id = tenant_id;
          allFindings.push(finding);
        }
      } catch (moduleErr) {
        allFindings.push({
          scan_module: moduleName, severity: 'info', category: 'module_error',
          title: `Module ${moduleName} failed`, diagnostic: moduleErr.message,
          prescription: 'Review module configuration and data availability.',
          recommended_agent: null, recommended_tools: [], estimated_monthly_savings: null,
          confidence: 'low', data: { error: moduleErr.message },
          scan_id: scanId, tenant_id: tenant_id
        });
      }
    }

    const durationMs = Date.now() - startTime;

    // Insert findings
    for (const f of allFindings) {
      await sequelize.query(`
        INSERT INTO lg_obd_findings (tenant_id, scan_id, scan_module, severity, category, title, diagnostic, prescription, recommended_agent, recommended_tools, estimated_monthly_savings, confidence, data, status)
        VALUES (:tenant_id, :scan_id, :scan_module, :severity, :category, :title, :diagnostic, :prescription, :recommended_agent, :recommended_tools, :estimated_monthly_savings, :confidence, :data, 'open')
      `, {
        replacements: {
          tenant_id: f.tenant_id, scan_id: f.scan_id, scan_module: f.scan_module,
          severity: f.severity, category: f.category || '', title: f.title,
          diagnostic: f.diagnostic, prescription: f.prescription || '',
          recommended_agent: f.recommended_agent || '',
          recommended_tools: JSON.stringify(f.recommended_tools || []),
          estimated_monthly_savings: f.estimated_monthly_savings || null,
          confidence: f.confidence || 'medium',
          data: JSON.stringify(f.data || {})
        }
      });
    }

    // Count severities
    const criticalCount = allFindings.filter(f => f.severity === 'critical').length;
    const warningCount = allFindings.filter(f => f.severity === 'warning').length;
    const advisoryCount = allFindings.filter(f => f.severity === 'advisory').length;
    const infoCount = allFindings.filter(f => f.severity === 'info').length;

    // Calculate overall score (100 = perfect, deduct for findings)
    let score = 100;
    score -= criticalCount * 15;
    score -= warningCount * 8;
    score -= advisoryCount * 3;
    score -= infoCount * 1;
    score = Math.max(0, Math.min(100, score));

    // Insert scan record
    await sequelize.query(`
      INSERT INTO lg_obd_scans (scan_id, tenant_id, modules_run, findings_count, critical_count, warning_count, advisory_count, info_count, overall_score, duration_ms)
      VALUES (:scanId, :tenantId, :modules, :findings, :critical, :warning, :advisory, :info, :score, :duration)
    `, {
      replacements: {
        scanId, tenantId: tenant_id, modules: JSON.stringify(modulesToRun),
        findings: allFindings.length, critical: criticalCount, warning: warningCount,
        advisory: advisoryCount, info: infoCount, score, duration: durationMs
      }
    });

    res.json({
      success: true,
      data: {
        scan_id: scanId,
        tenant_id,
        modules_run: modulesToRun,
        duration_ms: durationMs,
        overall_score: score,
        summary: {
          total_findings: allFindings.length,
          critical: criticalCount,
          warning: warningCount,
          advisory: advisoryCount,
          info: infoCount
        },
        total_estimated_monthly_savings: allFindings.reduce((s, f) => s + (f.estimated_monthly_savings || 0), 0),
        findings: allFindings
      }
    });
  } catch (err) {
    console.error('[obd/scan] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /findings — List findings for a tenant
router.get('/findings', async (req, res) => {
  try {
    const { tenant_id, severity, module, status, scan_id, limit, offset } = req.query;
    if (!tenant_id) return res.status(400).json({ error: 'tenant_id required' });

    let where = 'WHERE tenant_id = :tenant_id';
    const replacements = { tenant_id };

    if (severity) { where += ' AND severity = :severity'; replacements.severity = severity; }
    if (module) { where += ' AND scan_module = :module'; replacements.module = module; }
    if (status) { where += ' AND status = :status'; replacements.status = status; }
    if (scan_id) { where += ' AND scan_id = :scan_id'; replacements.scan_id = scan_id; }

    const lim = parseInt(limit) || 100;
    const off = parseInt(offset) || 0;

    const [rows] = await sequelize.query(`SELECT * FROM lg_obd_findings ${where} ORDER BY created_at DESC LIMIT ${lim} OFFSET ${off}`, { replacements });
    const [countResult] = await sequelize.query(`SELECT COUNT(*) as cnt FROM lg_obd_findings ${where}`, { replacements });

    res.json({ success: true, data: rows, total: parseInt(countResult[0]?.cnt) || 0, limit: lim, offset: off });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /findings/:id — Get finding detail
router.get('/findings/:id', async (req, res) => {
  try {
    const [rows] = await sequelize.query(`SELECT * FROM lg_obd_findings WHERE id = :id`, { replacements: { id: req.params.id } });
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Finding not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /findings/:id — Update finding status
router.put('/findings/:id', async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['open', 'acknowledged', 'in_progress', 'resolved'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
    }

    const resolvedAt = status === 'resolved' ? ', resolved_at = NOW()' : '';
    await sequelize.query(`UPDATE lg_obd_findings SET status = :status ${resolvedAt} WHERE id = :id`, { replacements: { status, id: req.params.id } });

    const [rows] = await sequelize.query(`SELECT * FROM lg_obd_findings WHERE id = :id`, { replacements: { id: req.params.id } });
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Finding not found' });

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /scan-history — List past scans
router.get('/scan-history', async (req, res) => {
  try {
    const { tenant_id, limit, offset } = req.query;
    if (!tenant_id) return res.status(400).json({ error: 'tenant_id required' });

    const lim = parseInt(limit) || 50;
    const off = parseInt(offset) || 0;

    const [rows] = await sequelize.query(`SELECT * FROM lg_obd_scans WHERE tenant_id = :tid ORDER BY created_at DESC LIMIT ${lim} OFFSET ${off}`, { replacements: { tid: tenant_id } });
    const [countResult] = await sequelize.query(`SELECT COUNT(*) as cnt FROM lg_obd_scans WHERE tenant_id = :tid`, { replacements: { tid: tenant_id } });

    res.json({ success: true, data: rows, total: parseInt(countResult[0]?.cnt) || 0, limit: lim, offset: off });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /dashboard — Summary dashboard data
router.get('/dashboard', async (req, res) => {
  try {
    const { tenant_id } = req.query;
    if (!tenant_id) return res.status(400).json({ error: 'tenant_id required' });

    // Findings by severity
    const [bySeverity] = await sequelize.query(`
      SELECT severity, COUNT(*) as cnt FROM lg_obd_findings
      WHERE tenant_id = :tid AND status != 'resolved'
      GROUP BY severity
    `, { replacements: { tid: tenant_id } });

    // Findings by module
    const [byModule] = await sequelize.query(`
      SELECT scan_module, COUNT(*) as cnt,
             SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) as critical,
             SUM(CASE WHEN severity = 'warning' THEN 1 ELSE 0 END) as warnings,
             SUM(CASE WHEN severity = 'advisory' THEN 1 ELSE 0 END) as advisories
      FROM lg_obd_findings WHERE tenant_id = :tid AND status != 'resolved'
      GROUP BY scan_module
    `, { replacements: { tid: tenant_id } });

    // Module scores (derived from findings)
    const moduleScores = {};
    for (const mod of ALL_MODULES) {
      const modFindings = byModule.find(m => m.scan_module === mod);
      let score = 100;
      if (modFindings) {
        score -= parseInt(modFindings.critical || 0) * 15;
        score -= parseInt(modFindings.warnings || 0) * 8;
        score -= parseInt(modFindings.advisories || 0) * 3;
      }
      moduleScores[mod] = Math.max(0, Math.min(100, score));
    }

    // Latest scan
    const [latestScan] = await sequelize.query(`
      SELECT * FROM lg_obd_scans WHERE tenant_id = :tid ORDER BY created_at DESC LIMIT 1
    `, { replacements: { tid: tenant_id } });

    // Total estimated savings
    const [savings] = await sequelize.query(`
      SELECT COALESCE(SUM(estimated_monthly_savings), 0) as total_savings
      FROM lg_obd_findings WHERE tenant_id = :tid AND status != 'resolved'
    `, { replacements: { tid: tenant_id } });

    // Trend (findings over last 7 scans)
    const [trend] = await sequelize.query(`
      SELECT scan_id, overall_score, findings_count, critical_count, created_at
      FROM lg_obd_scans WHERE tenant_id = :tid ORDER BY created_at DESC LIMIT 7
    `, { replacements: { tid: tenant_id } });

    // Open findings count
    const [openFindings] = await sequelize.query(`
      SELECT COUNT(*) as cnt FROM lg_obd_findings WHERE tenant_id = :tid AND status = 'open'
    `, { replacements: { tid: tenant_id } });

    res.json({
      success: true,
      data: {
        findings_by_severity: bySeverity,
        findings_by_module: byModule,
        module_scores: moduleScores,
        overall_score: latestScan[0]?.overall_score || null,
        latest_scan: latestScan[0] || null,
        total_estimated_monthly_savings: parseFloat(savings[0]?.total_savings) || 0,
        open_findings: parseInt(openFindings[0]?.cnt) || 0,
        trend: trend.reverse()
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /clear — Wipe all OBD data for a tenant (for demo resets)
router.delete('/clear', async (req, res) => {
  try {
    const { tenant_id } = req.query;
    if (!tenant_id) return res.status(400).json({ error: 'tenant_id required' });
    await sequelize.query(`DELETE FROM lg_obd_findings WHERE tenant_id = :tid`, { replacements: { tid: tenant_id } });
    await sequelize.query(`DELETE FROM lg_obd_scans WHERE tenant_id = :tid`, { replacements: { tid: tenant_id } });
    await sequelize.query(`DELETE FROM lg_obd_ingestion_batches WHERE tenant_id = :tid`, { replacements: { tid: tenant_id } });
    res.json({ success: true, message: `All OBD data cleared for tenant ${tenant_id}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
