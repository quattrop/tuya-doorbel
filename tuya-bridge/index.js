const TuyAPI = require('tuyapi');
const axios = require('axios');
const fs = require('fs');

// Pomocná funkce pro časová razítka
function ts() {
    const now = new Date();
    const time = now.toTimeString().split(' ')[0]; // HH:MM:SS
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    return `[${time}.${ms}]`;
}

console.log(`${ts()} --- Tuya Doorbell Bridge (TIMESTAMPS + SPY MODE) ---`);

let config = {};
try {
    const optionsRaw = fs.readFileSync('/data/options.json', 'utf8');
    config = JSON.parse(optionsRaw);
} catch (e) {
    config = process.env;
}

const DEVICE_ID = config.tuya_device_id ? config.tuya_device_id.trim() : process.env.TUYA_DEVICE_ID;
const LOCAL_KEY = config.tuya_local_key ? config.tuya_local_key.trim() : process.env.TUYA_LOCAL_KEY;
const DEVICE_IP = config.tuya_device_ip ? config.tuya_device_ip.trim() : undefined;
const WEBHOOK_URL = config.webhook_url ? config.webhook_url.trim() : process.env.WEBHOOK_URL;

const device = new TuyAPI({
    id: DEVICE_ID,
    key: LOCAL_KEY,
    ip: DEVICE_IP,
    version: '3.3', // Zůstáváme u 3.3, protože logy ukazovaly hex 33.2e.33
    issueGetOnConnect: false
});

const TRIGGER_IDS = ['154', '185', '136', '115', '101'];
let isConnected = false;

async function connectionLoop() {
    if (isConnected) return;
    try {
        // Zkoušíme připojit
        await device.connect(); 
    } catch (err) {
        // Timeouty při spánku nelogujeme, jen zpomalují výpis
        if (!err.message.includes('timeout') && !err.message.includes('ECONNREFUSED')) {
             console.log(`${ts()} Connection Error: ${err.message}`);
        }
        setTimeout(connectionLoop, 1000); 
    }
}

// --- LISTENERY ---

device.on('connected', () => {
    console.log(`${ts()} >>> PŘIPOJENO! Spojení navázáno.`);
    isConnected = true;
    
    // Zkusíme pasivně čekat. Pokud nic nepřijde do 500ms, zkusíme refresh
    // Ale zatím jen posloucháme.
});

device.on('disconnected', () => {
    console.log(`${ts()} <<< ODPOJENO. Zvonek ukončil spojení.`);
    isConnected = false;
    setTimeout(connectionLoop, 1000);
});

device.on('error', (err) => {
    // Detailní výpis chyby
    console.log(`${ts()} ERROR Socket: ${err.message}`);
    isConnected = false;
});

// Odchytáváme úplně všechna data
device.on('data', data => {
    console.log(`${ts()} EVENT [DATA]: ${JSON.stringify(data)}`);
    checkAndFireWebhook(data);
});

device.on('dp-refresh', data => {
    console.log(`${ts()} EVENT [DP-REFRESH]: ${JSON.stringify(data)}`);
    checkAndFireWebhook(data);
});

device.on('heartbeat', data => {
    console.log(`${ts()} EVENT [HEARTBEAT]: ${JSON.stringify(data)}`);
});

function checkAndFireWebhook(data) {
    if (!data || !data.dps) return;

    console.log(`${ts()} OBSAH DPS: ${JSON.stringify(data.dps)}`);

    const isRingEvent = TRIGGER_IDS.some(id => data.dps.hasOwnProperty(id));
    if (isRingEvent) {
        console.log(`${ts()} !!! ZVONÍ !!! Volám webhook...`);
        axios.post(WEBHOOK_URL, { event: 'ring', raw_data: data.dps })
            .then(() => console.log(`${ts()} Webhook OK.`))
            .catch(err => console.error(`${ts()} Webhook Error: ${err.message}`));
    }
}

console.log(`${ts()} Startuji smyčku na IP: ${DEVICE_IP}`);
connectionLoop();