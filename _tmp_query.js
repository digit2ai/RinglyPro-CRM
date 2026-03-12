const { Sequelize } = require("sequelize");
// Try external hostname (Render external access)
const db = "postgresql://ringlypro_admin:g0KoTof0UPhqdKHKXVnOeF1uspIG8Rbu@dpg-d2job763jp1c73fc8kt0-a.oregon-postgres.render.com/ringlypro_crm_production?sslmode=require";
const s = new Sequelize(db, { dialect:"postgres", dialectOptions:{ssl:{require:true,rejectUnauthorized:false}}, logging:false, pool:{max:1,idle:3000,acquire:15000} });
s.query("SELECT id, email, password_hash, business_name, phone FROM users WHERE client_id = 15 LIMIT 5")
  .then(([r]) => { console.log(JSON.stringify(r, null, 2)); return s.close(); })
  .then(() => process.exit(0))
  .catch(e => { console.error("ERR:", e.message); s.close().then(() => process.exit(1)); });
setTimeout(() => { console.log("TIMEOUT"); process.exit(1); }, 15000);
