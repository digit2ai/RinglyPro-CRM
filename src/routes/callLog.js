const express = require('express');
const router = express.Router();

// Simple call logging
router.post('/call-log', (req, res) => {
    const { phone, speech, call_sid, timestamp } = req.body;
    
    console.log(`Rachel call: ${phone} said "${speech}"`);
    
    // Optional: Save to database if you want
    // db.query('INSERT INTO call_logs (phone, speech, call_sid, timestamp) VALUES (?, ?, ?, ?)', 
    //          [phone, speech, call_sid, timestamp]);
    
    res.json({ success: true });
});

module.exports = router;