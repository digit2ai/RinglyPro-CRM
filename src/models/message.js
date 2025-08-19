// Add this function to your dashboard.ejs <script> section
// Replace the existing loadTodaysMessages() function with this:

async function loadTodaysMessages() {
    try {
        console.log('📱 Loading today\'s SMS messages from database...');
        const response = await fetch('/api/messages/today');
        const result = await response.json();
        
        if (result.success && result.data) {
            todaysMessages = result.data.messages || [];
            
            console.log(`✅ Loaded ${todaysMessages.length} SMS messages from PostgreSQL database`);
            
            updateMessagesCount();
            updateAllMessagesDisplay();
            
            // Show success toast if messages were found
            if (todaysMessages.length > 0) {
                showToast(
                    `📱 ${todaysMessages.length} SMS messages loaded from database`, 
                    'success', 
                    '<i class="fas fa-database"></i>'
                );
            }
        } else {
            console.log('⚠️ No messages data received, using empty array');
            todaysMessages = [];
            updateMessagesCount();
            updateAllMessagesDisplay();
        }
    } catch (error) {
        console.error('❌ Error loading today\'s messages:', error);
        // Fallback to empty array
        todaysMessages = [];
        updateMessagesCount();
        updateAllMessagesDisplay();
        
        showToast(
            'Failed to load SMS history from database', 
            'warning', 
            '<i class="fas fa-exclamation-triangle"></i>'
        );
    }
}

// Test database message storage after sending SMS
// Add this to your existing SMS form submission
async function testSMSStorage(messageId, twilioSid) {
    // Wait a moment for database to save
    setTimeout(async () => {
        try {
            // Reload messages to see if new one appears
            await loadTodaysMessages();
            
            // Check if our message appears in the list
            const ourMessage = todaysMessages.find(msg => msg.twilioSid === twilioSid);
            if (ourMessage) {
                showToast(
                    `✅ SMS saved to database (ID: ${ourMessage.id})`, 
                    'success', 
                    '<i class="fas fa-database"></i>'
                );
            }
        } catch (error) {
            console.log('Could not verify message storage:', error);
        }
    }, 2000); // Wait 2 seconds for database save
}
