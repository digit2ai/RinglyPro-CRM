/**
 * LOGISTICS Demo Data Generator
 * Generates 4 realistic CSV files for a mid-size e-commerce / retail warehouse demo.
 * Run: node logistics/demo-data/generate-demo-csvs.js
 */

const fs = require('fs')
const path = require('path')

const OUT = path.join(__dirname)

// ── Helpers ──────────────────────────────────────────────────
const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
const pad = (n) => String(n).padStart(2, '0')
const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const timeStr = () => `${pad(rnd(6, 21))}:${pad(rnd(0, 59))}:${pad(rnd(0, 59))}`

// ── Product catalog (realistic warehouse items) ─────────────
const CATEGORIES = [
  { name: 'Electronics', skuPrefix: 'EL', items: ['Wireless Mouse', 'USB-C Hub', 'Bluetooth Speaker', 'Power Bank 10000mAh', 'HDMI Cable 2m', 'Webcam HD', 'Keyboard Mechanical', 'Monitor Stand', 'Phone Case Universal', 'Screen Protector Pack', 'Earbuds TWS', 'Charging Pad Qi', 'USB Flash Drive 64GB', 'Extension Cord 3m', 'LED Desk Lamp', 'Smart Plug WiFi', 'Cable Organizer Set', 'Laptop Sleeve 15in', 'Wireless Charger Car', 'HDMI Splitter 4-way'] },
  { name: 'Home & Kitchen', skuPrefix: 'HK', items: ['Coffee Mug Ceramic', 'Cutting Board Bamboo', 'Kitchen Timer Digital', 'Spice Rack 12-jar', 'Tea Towel Set 3pk', 'Measuring Cup Set', 'Soap Dispenser Steel', 'Storage Container 1L', 'Storage Container 3L', 'Storage Container 5L', 'Lunch Box Stainless', 'Water Bottle 750ml', 'Oven Mitt Silicone', 'Trivet Set Bamboo', 'Ice Cube Tray Silicone', 'Whisk Stainless', 'Peeler Y-shape', 'Colander Foldable', 'Herb Scissors 5-blade', 'Garlic Press Pro'] },
  { name: 'Office Supplies', skuPrefix: 'OF', items: ['Notebook A5 Ruled', 'Pen Set Ballpoint 10pk', 'Sticky Notes 76x76 12pk', 'Binder Clips Assorted', 'File Folders A4 25pk', 'Stapler Desktop', 'Tape Dispenser', 'Scissors 21cm', 'Whiteboard Marker 4pk', 'Desk Organizer Mesh', 'Paper Clips 100pk', 'Rubber Bands Assorted', 'Correction Tape 6pk', 'Highlighter Set 6pk', 'Envelope C5 50pk', 'Label Maker Tape 12mm', 'Index Tabs Adhesive', 'Pencil Sharpener Electric', 'Glue Stick 40g 3pk', 'Calculator Desktop Solar'] },
  { name: 'Health & Beauty', skuPrefix: 'HB', items: ['Hand Cream 100ml', 'Lip Balm SPF15 3pk', 'Shampoo Natural 300ml', 'Conditioner Repair 300ml', 'Body Lotion 250ml', 'Face Mask Sheet 5pk', 'Cotton Pads 100pk', 'Nail File Set', 'Hair Ties 30pk', 'Toothbrush Bamboo 4pk', 'Hand Sanitizer 250ml', 'Shower Gel Citrus 400ml', 'Deodorant Roll-on 50ml', 'Comb Detangling', 'Mirror Compact LED'] },
  { name: 'Sports & Outdoor', skuPrefix: 'SP', items: ['Yoga Mat 6mm', 'Resistance Band Set 5', 'Jump Rope Speed', 'Water Bottle Sports 1L', 'Towel Microfiber', 'Grip Tape Roll', 'Wrist Wraps Pair', 'Headband Athletic 3pk', 'Knee Sleeve Support', 'Tennis Balls 3pk', 'Bike Light Set LED', 'Camping Mug Enamel', 'Compass Orienteering', 'Whistle Emergency', 'First Aid Kit Mini'] },
  { name: 'Clothing Accessories', skuPrefix: 'CA', items: ['Belt Leather 110cm', 'Socks Cotton 5pk', 'Scarf Wool Blend', 'Beanie Winter Knit', 'Gloves Touchscreen', 'Wallet RFID Slim', 'Sunglasses UV400', 'Watch Strap 22mm', 'Tie Clip Silver', 'Cufflinks Set Classic', 'Shoe Insole Gel', 'Bag Tote Canvas', 'Backpack Daypack 20L', 'Umbrella Compact Auto', 'Keychain Carabiner 3pk'] },
  { name: 'Toys & Games', skuPrefix: 'TG', items: ['Puzzle 500pc Landscape', 'Card Game Classic', 'Building Blocks 120pc', 'Plush Bear 30cm', 'Board Game Strategy', 'Dice Set RPG 7pc', 'Coloring Book Adult', 'Crayon Set 24-color', 'Fidget Spinner Metal', 'Yo-Yo Professional'] },
  { name: 'Pet Supplies', skuPrefix: 'PS', items: ['Dog Treat Chicken 200g', 'Cat Toy Mouse 3pk', 'Pet Bowl Stainless M', 'Leash Retractable 5m', 'Collar Adjustable M', 'Litter Scoop Metal', 'Bird Seed Mix 1kg', 'Fish Food Flakes 100g', 'Pet Brush Deshedding', 'Poop Bags 120pk'] },
  { name: 'Automotive', skuPrefix: 'AU', items: ['Air Freshener Vent 3pk', 'Phone Mount Magnetic', 'Dash Cam 1080p', 'Jump Starter Portable', 'Tire Pressure Gauge', 'Microfiber Cloth 6pk', 'Ice Scraper Telescopic', 'Seat Cover Universal', 'Trunk Organizer Foldable', 'LED Bulb H7 Pair'] },
  { name: 'Books & Media', skuPrefix: 'BM', items: ['Bestseller Fiction 2024', 'Cookbook Mediterranean', 'Self-Help Mindset', 'Journal Gratitude', 'Planner Weekly A5', 'Map Folding Europe', 'Language Cards 500', 'Sketchbook A4 100pg', 'Calendar Wall 2025', 'Bookmark Magnetic 6pk'] }
]

// Build full SKU catalog
const skus = []
let skuNum = 1000
CATEGORIES.forEach(cat => {
  cat.items.forEach(item => {
    skuNum++
    const sku = `${cat.skuPrefix}-${skuNum}`
    // Realistic dims — small items are bin-capable, large items are not
    const isSmall = Math.random() < 0.78 // ~78% bin-capable
    const length = isSmall ? rnd(50, 580) : rnd(620, 1200)
    const width = isSmall ? rnd(30, 380) : rnd(420, 800)
    const height = isSmall ? rnd(20, 430) : rnd(460, 900)
    const weight = isSmall ? +(Math.random() * 4 + 0.05).toFixed(2) : +(Math.random() * 25 + 5).toFixed(2)
    skus.push({
      sku,
      description: `${item} - ${cat.name}`,
      category: cat.name,
      length_mm: length,
      width_mm: width,
      height_mm: height,
      weight_kg: weight,
      unit_of_measure: pick(['EA', 'EA', 'EA', 'PK', 'SET']),
      pieces_per_picking_unit: pick([1, 1, 1, 1, 3, 5, 6, 10, 12]),
      pieces_per_pallet: rnd(48, 960),
      batch_tracked: Math.random() < 0.15 ? 'yes' : 'no',
      dangerous_goods: Math.random() < 0.03 ? 'yes' : 'no',
      temperature_range: Math.random() < 0.05 ? 'cool' : 'ambient'
    })
  })
})

console.log(`Generated ${skus.length} SKUs`)

// ── 1) Item Master CSV ──────────────────────────────────────
const itemMasterHeader = 'sku,description,category,length_mm,width_mm,height_mm,weight_kg,unit_of_measure,pieces_per_picking_unit,pieces_per_pallet,batch_tracked,dangerous_goods,temperature_range'
const csvEscape = (v) => {
  const s = String(v)
  return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s
}
const itemMasterRows = skus.map(s =>
  `${s.sku},${csvEscape(s.description)},${s.category},${s.length_mm},${s.width_mm},${s.height_mm},${s.weight_kg},${s.unit_of_measure},${s.pieces_per_picking_unit},${s.pieces_per_pallet},${s.batch_tracked},${s.dangerous_goods},${s.temperature_range}`
)
fs.writeFileSync(path.join(OUT, 'item-master.csv'), [itemMasterHeader, ...itemMasterRows].join('\n'))
console.log(`✅ item-master.csv (${skus.length} rows)`)

// ── 2) Inventory CSV ────────────────────────────────────────
const LOCATIONS = ['A-01', 'A-02', 'A-03', 'A-04', 'B-01', 'B-02', 'B-03', 'B-04', 'C-01', 'C-02', 'C-03', 'D-01', 'D-02', 'E-01', 'F-01', 'F-02', 'BULK-01', 'BULK-02', 'PICK-01', 'PICK-02', 'PICK-03', 'PICK-04', 'RECV-01']
const SPACES = []
LOCATIONS.forEach(loc => {
  const slots = rnd(5, 20)
  for (let i = 1; i <= slots; i++) SPACES.push({ location: loc, space: `${loc}-${pad(i)}` })
})

const invHeader = 'sku,location,storage_space,stock,unit_of_measure,snapshot_date'
const invRows = []
const activeSkus = skus.filter(() => Math.random() < 0.92) // ~92% have stock
activeSkus.forEach(s => {
  const numLocations = Math.random() < 0.3 ? rnd(2, 3) : 1 // 30% in multiple locations
  const usedSpaces = new Set()
  for (let i = 0; i < numLocations; i++) {
    let sp
    do { sp = pick(SPACES) } while (usedSpaces.has(sp.space))
    usedSpaces.add(sp.space)
    invRows.push(`${s.sku},${sp.location},${sp.space},${rnd(1, 500)},${s.unit_of_measure},2025-06-15`)
  }
})
fs.writeFileSync(path.join(OUT, 'inventory.csv'), [invHeader, ...invRows].join('\n'))
console.log(`✅ inventory.csv (${invRows.length} rows)`)

// ── 3) Goods-In CSV ─────────────────────────────────────────
const SUPPLIERS = ['Shenzhen Tech Co.', 'EuroDistrib GmbH', 'Nordic Supply AB', 'Pacific Trade Ltd', 'MediterraneanGoods SL', 'Atlas Wholesale Inc', 'Rhine Valley Logistik', 'Baltic Imports Oy', 'Alpine Components AG', 'Iberia Distribuciones']
const giHeader = 'receipt_id,sku,quantity,unit_of_measure,receipt_date,receipt_time,supplier'
const giRows = []
let receiptNum = 70000

// Generate 6 months of inbound (Jan–Jun 2025)
for (let month = 0; month < 6; month++) {
  const daysInMonth = new Date(2025, month + 1, 0).getDate()
  const receiptsThisMonth = rnd(40, 70) // 40-70 deliveries/month
  for (let r = 0; r < receiptsThisMonth; r++) {
    receiptNum++
    const rid = `GR-${receiptNum}`
    const day = rnd(1, daysInMonth)
    const date = `2025-${pad(month + 1)}-${pad(day)}`
    const time = timeStr()
    const supplier = pick(SUPPLIERS)
    const linesPerReceipt = rnd(1, 12)
    for (let l = 0; l < linesPerReceipt; l++) {
      const s = pick(skus)
      giRows.push(`${rid},${s.sku},${rnd(10, 500)},${s.unit_of_measure},${date},${time},${supplier}`)
    }
  }
}
fs.writeFileSync(path.join(OUT, 'goods-in.csv'), [giHeader, ...giRows].join('\n'))
console.log(`✅ goods-in.csv (${giRows.length} rows)`)

// ── 4) Goods-Out CSV ────────────────────────────────────────
const SHIPPING = ['CEP', 'CEP', 'CEP', 'Freight', 'Freight', 'Express']
const goHeader = 'order_id,orderline_id,sku,quantity,picking_unit,unit_of_measure,order_date,picking_date,picking_time,ship_date,ship_time,customer_id,shipping_method'
const goRows = []
let orderNum = 200000

// ABC distribution: 20% of SKUs get 80% of volume
const sortedSkus = [...skus]
// Assign popularity weight
sortedSkus.forEach(s => {
  s._popularity = Math.random()
})
sortedSkus.sort((a, b) => b._popularity - a._popularity)
// Top 20% get high weight, rest get low weight
const popularSkus = sortedSkus.slice(0, Math.floor(sortedSkus.length * 0.2))
const tailSkus = sortedSkus.slice(Math.floor(sortedSkus.length * 0.2))

function pickWeightedSku() {
  // 80% chance pick from top 20%, 20% chance from tail
  return Math.random() < 0.80 ? pick(popularSkus) : pick(tailSkus)
}

// Generate 6 months of outbound orders (Jan–Jun 2025)
for (let month = 0; month < 6; month++) {
  const daysInMonth = new Date(2025, month + 1, 0).getDate()

  for (let day = 1; day <= daysInMonth; day++) {
    const dow = new Date(2025, month, day).getDay() // 0=Sun
    // Weekday gets more orders than weekend
    let ordersToday
    if (dow === 0) ordersToday = rnd(2, 8)        // Sunday: minimal
    else if (dow === 6) ordersToday = rnd(5, 15)   // Saturday: light
    else ordersToday = rnd(15, 45)                  // Weekday: busy

    // Seasonal bump in March (spring) and June (summer prep)
    if (month === 2 || month === 5) ordersToday = Math.ceil(ordersToday * 1.25)

    for (let o = 0; o < ordersToday; o++) {
      orderNum++
      const oid = `SO-${orderNum}`
      const orderDate = `2025-${pad(month + 1)}-${pad(day)}`

      // Lines per order — realistic distribution:
      // ~35% single-line, ~25% 2-line, ~15% 3-line, ~10% 4-5, ~15% 6+
      let linesPerOrder
      const r = Math.random()
      if (r < 0.35) linesPerOrder = 1
      else if (r < 0.60) linesPerOrder = 2
      else if (r < 0.75) linesPerOrder = 3
      else if (r < 0.85) linesPerOrder = rnd(4, 5)
      else if (r < 0.95) linesPerOrder = rnd(6, 10)
      else linesPerOrder = rnd(11, 25) // bulk orders

      // Pick/ship same day or next day
      const pickDay = Math.min(day + (Math.random() < 0.7 ? 0 : 1), daysInMonth)
      const shipDay = Math.min(pickDay + (Math.random() < 0.6 ? 0 : 1), daysInMonth)
      const pickDate = `2025-${pad(month + 1)}-${pad(pickDay)}`
      const shipDate = `2025-${pad(month + 1)}-${pad(shipDay)}`
      const pickTime = timeStr()
      const shipTime = timeStr()
      const custId = `C-${rnd(10000, 19999)}`
      const shipMethod = pick(SHIPPING)

      const usedSkus = new Set()
      for (let l = 1; l <= linesPerOrder; l++) {
        let s
        let attempts = 0
        do {
          s = pickWeightedSku()
          attempts++
        } while (usedSkus.has(s.sku) && attempts < 20)
        usedSkus.add(s.sku)

        const qty = Math.random() < 0.85 ? rnd(1, 5) : rnd(6, 50) // most orders small qty
        const pickUnit = qty > 10 ? pick(['piece', 'box']) : 'piece'
        goRows.push(`${oid},${oid}-${pad(l)},${s.sku},${qty},${pickUnit},${s.unit_of_measure},${orderDate},${pickDate},${pickTime},${shipDate},${shipTime},${custId},${shipMethod}`)
      }
    }
  }
}

fs.writeFileSync(path.join(OUT, 'goods-out.csv'), [goHeader, ...goRows].join('\n'))
console.log(`✅ goods-out.csv (${goRows.length} rows)`)

console.log('\n📁 Files saved to:', OUT)
console.log('Ready to upload at https://aiagent.ringlypro.com/logistics/')
