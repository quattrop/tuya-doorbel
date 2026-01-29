const TuyAPI = require('tuyapi');
const axios = require('axios');
const fs = require('fs');

// Helper function for timestamps
function ts() {
    const now = new Date();
    return `[${now.toTimeString().split(' ')[0]}]`;
}

// --- 1. Load Configuration ---
let config = {};
try {
    const optionsRaw = fs.readFileSync('/data/options.json', 'utf8');
    config = JSON.parse(optionsRaw);
} catch (e) {
    config = process.env;
}

// Read the Debug Flag (defaults to false if missing)
const DEBUG_MODE = config.debug_logging === true;

console.log(`${ts()} --- Tuya Doorbell Bridge (v1.0.8) ---`);
if (DEBUG_MODE) {
    console.log(`${ts()} [INFO] Debug logging is ENABLED. Expect verbose logs.`);
}

const DEVICE_ID = config.tuya_device_id ? config.tuya_device_id.trim() : process.env.TUYA_DEVICE_ID;
const LOCAL_KEY = config.tuya_local_key ? config.tuya_local_key.trim() : process.env.TUYA_LOCAL_KEY;
const DEVICE_IP = config.tuya_device_ip ? config.tuya_device_ip.trim() : undefined;
const WEBHOOK_URL = config.webhook_url ? config.webhook_url.trim() : process.env.WEBHOOK_URL;

// --- 2. Initialize Tuya Device ---
const device = new TuyAPI({
    id: DEVICE_ID,
    key: LOCAL_KEY,
    ip: DEVICE_IP,
    version: '3.3', 
    issueGetOnConnect: false
});

const TRIGGER_IDS = ['154', '185', '136']; 
let isConnected = false;

// --- Helper: Centralized Error Filtering ---
function shouldLog(err) {
    // 1. If Debug Mode is ON, log everything!
    if (DEBUG_MODE) return true;

    // 2. Otherwise, filter out common "sleep" errors
    if (!err) return false;
    
    const msg = (err.message || '').toLowerCase();
    const code = (err.code || '').toUpperCase();
    
    const quietStrings = [
        'timeout', 'timed out', 
        'econnrefused', 'ehostunreach', 'etimedout', 
        'socket hang up', 'read econnreset'
    ];

    // Return TRUE only if it is NOT a quiet error
    return !quietStrings.some(q => msg.includes(q) || code === q.toUpperCase());
}

// --- 3. Connection Loop ---
async function connectionLoop() {
    if (isConnected) return;

    try {
        await device.connect(); 
    } catch (err) {
        // Use our smart logger
        if (shouldLog(err)) {
            // Add [DEBUG] prefix if in debug mode to distinguish easily
            const prefix = DEBUG_MODE ? '[DEBUG] ' : '';
            console.error(`${ts()} ${prefix}Connection Error: ${err.message}`);
        }
        
        setTimeout(connectionLoop, 1000); 
    }
}

// --- 4. Event Listeners ---

device.on('connected', () => {
    console.log(`${ts()} >>> CONNECTED. Waiting for data...`);
    isConnected = true;
});

device.on('disconnected', () => {
    if (DEBUG_MODE) {
        console.log(`${ts()} [DEBUG] Disconnected.`);
    }
    isConnected = false;
    setTimeout(connectionLoop, 1000);
});

device.on('error', (err) => {
    if (shouldLog(err)) {
        const prefix = DEBUG_MODE ? '[DEBUG] ' : '';
        console.error(`${ts()} ${prefix}Socket Error: ${err.message}`);
    }
    isConnected = false;
});

// Common handler
function handleData(data) {
    // In Debug mode, log raw data to help identify unknown DPS
    if (DEBUG_MODE) {
        console.log(`${ts()} [DEBUG] Raw Data: ${JSON.stringify(data)}`);
    }

    if (!data || !data.dps) return;

    const triggerId = TRIGGER_IDS.find(id => data.dps.hasOwnProperty(id));

    if (triggerId) {
        console.log(`${ts()} !!! RING DETECTED (DPS ${triggerId}) !!!`);
        
        let payload = {
            event: 'ring',
            battery: data.dps['145'] || 'unknown'
        };

        if (triggerId === '154' && typeof data.dps['154'] === 'string') {
            try {
                const imageUrl = Buffer.from(data.dps['154'], 'base64').toString('utf8');
                console.log(`${ts()} + Image URL decoded successfully!`);
                payload.image = imageUrl;
            } catch (e) {
                console.error(`${ts()} Error decoding image: ${e.message}`);
            }
        }

        axios.post(WEBHOOK_URL, payload)
            .then(() => console.log(`${ts()} -> Webhook sent successfully.`))
            .catch(err => console.error(`${ts()} -> Webhook failed: ${err.message}`));
    }
}

device.on('data', handleData);
device.on('dp-refresh', handleData);

// Debug: Log heartbeat only in debug mode (it's spammy)
device.on('heartbeat', (data) => {
    if (DEBUG_MODE) {
        console.log(`${ts()} [DEBUG] Heartbeat.`);
    }
});

console.log(`${ts()} Starting service on IP: ${DEVICE_IP}`);
connectionLoop();