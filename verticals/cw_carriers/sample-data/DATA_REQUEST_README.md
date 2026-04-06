# CW Carriers -- Data Request for Autopilot Setup

## What We Need

To configure the Autopilot pipeline with your real operations data, we need 4 CSV exports from your TMS or spreadsheets. Sample files are included showing the exact format.

---

### FILE 1: Loads (1_loads.csv)
Your active and recent load history. The more loads, the better the rate intelligence.

**Required columns:**
- `load_ref` -- Your internal load/order number
- `origin_city`, `origin_state` -- Pickup location
- `destination_city`, `destination_state` -- Delivery location
- `pickup_date` -- Scheduled pickup (YYYY-MM-DD)
- `equipment_type` -- dry_van, reefer, flatbed, etc.
- `sell_rate` -- What the shipper pays you (total, not per mile)
- `buy_rate` -- What you pay the carrier (total, not per mile)
- `status` -- open, covered, in_transit, delivered, cancelled

**Nice to have:**
- `shipper_name`, `delivery_date`, `weight_lbs`, `pieces`, `commodity`
- `miles`, `origin_zip`, `destination_zip`, `special_instructions`

**How much:** Last 6-12 months of loads. More data = better rate predictions.

---

### FILE 2: Carriers (2_carriers.csv)
Your carrier network -- everyone you've used or vetted.

**Required columns:**
- `carrier_name` -- Legal carrier name
- `mc_number` -- MC authority number
- `dot_number` -- DOT number
- `phone` -- Primary contact phone
- `email` -- Primary contact email
- `home_state` -- Carrier's home base state
- `equipment_types` -- What they haul (comma-separated: dry_van, reefer, flatbed)

**Nice to have:**
- `contact_name`, `safety_rating`, `insurance_expiry`
- `total_trucks`, `reliability_score`, `avg_rate_per_mile`

---

### FILE 3: Customers / Shippers (3_customers_shippers.csv)
Your shipper accounts.

**Required columns:**
- `company_name` -- Shipper name
- `contact_name`, `email`, `phone`
- `address_city`, `address_state`

**Nice to have:**
- `payment_terms` (Net 30, Net 45, etc.)
- `credit_limit`, `avg_loads_per_month`
- `primary_equipment`, `primary_lanes`

---

### FILE 4: Rate History / Benchmarks (4_rate_history.csv)
Lane rate benchmarks from your experience or TMS reports.

**Required columns:**
- `origin_state`, `destination_state`
- `equipment_type`
- `avg_rate_per_mile`

**Nice to have:**
- `min_rate_per_mile`, `max_rate_per_mile`
- `sample_count`, `period_start`, `period_end`

---

## Export Tips

- **From McLeod/TMW/MercuryGate:** Export load history report as CSV
- **From TMS reports:** Any load listing with origin/destination/rates works
- **From spreadsheets:** Save as CSV (UTF-8)
- **Date format:** YYYY-MM-DD preferred (2026-04-10), but we can handle MM/DD/YYYY
- **Rate format:** Total dollars (not per-mile) -- we calculate RPM automatically
- **Phone format:** Any format works (+1-xxx-xxx-xxxx or plain digits)

## What Happens Next

1. You send us the 4 files
2. We import via the Data Ingestion tool (column mapping, preview, validation)
3. Autopilot starts using your real lanes, carriers, and rate history
4. Rate Intelligence gets smarter with every load that runs through the system

## Questions?

Contact: Manuel Stagg -- mstagg@digit2ai.com
