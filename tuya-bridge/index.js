const TuyAPI = require('tuyapi');
const axios = require('axios');
const fs = require('fs');

// Helper function for timestamps
function ts() {
    const now = new Date();
    return `[${now.toTimeString().split(' ')[0]}]`;
}

console.log(`${ts()} --- Tuya Doorbell Bridge (Production) ---`);

// --- 1. Load Configuration ---
let config = {};
try {
    // Home Assistant stores options in /data/options.json
    const optionsRaw = fs.readFileSync('/data/options.json', 'utf8');
    config = JSON.parse(optionsRaw);
} catch (e) {
    // Fallback for local testing
    config = process.env;
}

const DEVICE_ID = config.tuya_device_id ? config.tuya_device_id.trim() : process.env.TUYA_DEVICE_ID;
const LOCAL_KEY = config.tuya_local_key ? config.tuya_local_key.trim() : process.env.TUYA_LOCAL_KEY;
const DEVICE_IP = config.tuya_device_ip ? config.tuya_device_ip.trim() : undefined;
const WEBHOOK_URL = config.webhook_url ? config.webhook_url.trim() : process.env.WEBHOOK_URL;

// --- 2. Initialize Tuya Device ---
// Version 3.3 is explicitly set as it works best for most battery doorbells
const device = new TuyAPI({
    id: DEVICE_ID,
    key: LOCAL_KEY,
    ip: DEVICE_IP,
    version: '3.3', 
    issueGetOnConnect: false
});

// DPS IDs that trigger the ring event.
// 154 = Image URL (Snapshot), 136/185 = Doorbell status
const TRIGGER_IDS = ['154', '185', '136']; 
let isConnected = false;

// --- 3. Connection Loop (Silent Mode) ---
async function connectionLoop() {
    if (isConnected) return;

    try {
        await device.connect(); 
    } catch (err) {
        // List of errors to ignore (common for sleeping battery devices)
        const quietErrors = ['timeout', 'timed out', 'ECONNREFUSED', 'EHOSTUNREACH', 'socket hang up'];
        
        // Log error only if it's NOT in the quiet list
        const isQuiet = quietErrors.some(q => err.message && err.message.includes(q));
        
        if (!isQuiet) {
            console.error(`${ts()} Connection Error: ${err.message}`);
        }
        
        // Retry connection after 1 second
        setTimeout(connectionLoop, 1000); 
    }
}

// --- 4. Event Listeners ---

device.on('connected', () => {
    console.log(`${ts()} >>> CONNECTED. Waiting for data...`);
    isConnected = true;
    // We do not call refresh() here as the device usually sends data automatically upon connection
});

device.on('disconnected', () => {
    // Optional: console.log(`${ts()} <<< Disconnected.`);
    isConnected = false;
    setTimeout(connectionLoop, 1000);
});

device.on('error', (err) => {
    // Log only critical socket errors, ignore timeout noise
    if (!err.message.includes('timeout') && !err.message.includes('ECONNREFUSED')) {
        console.error(`${ts()} Socket Error: ${err.message}`);
    }
    isConnected = false;
});

// Common handler for both 'data' and 'dp-refresh' events
function handleData(data) {
    if (!data || !data.dps) return;

    // Check if the received data contains any of our trigger IDs
    const triggerId = TRIGGER_IDS.find(id => data.dps.hasOwnProperty(id));

    if (triggerId) {
        console.log(`${ts()} !!! RING DETECTED (DPS ${triggerId}) !!!`);
        
        let payload = {
            event: 'ring',
            battery: data.dps['145'] || 'unknown' // Include battery level if available
        };

        // Special handling for DPS 154 (Base64 encoded Image URL)
        if (triggerId === '154' && typeof data.dps['154'] === 'string') {
            try {
                // Decode Base64 to String
                const imageUrl = Buffer.from(data.dps['154'], 'base64').toString('utf8');
                console.log(`${ts()} + Image URL decoded successfully!`);
                payload.image = imageUrl;
            } catch (e) {
                console.error(`${ts()} Error decoding image: ${e.message}`);
            }
        }

        // Send Webhook to Home Assistant
        axios.post(WEBHOOK_URL, payload)
            .then(() => console.log(`${ts()} -> Webhook sent successfully.`))
            .catch(err => console.error(`${ts()} -> Webhook failed: ${err.message}`));
    }
}

// Listen to both event types
device.on('data', handleData);
device.on('dp-refresh', handleData);

// Start the service
console.log(`${ts()} Starting service on IP: ${DEVICE_IP}`);
connectionLoop();