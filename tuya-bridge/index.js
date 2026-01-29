const TuyAPI = require('tuyapi');
const axios = require('axios');
const fs = require('fs');

console.log('--- Tuya Doorbell Bridge (Verze 3.4) ---');

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
    version: '3.4',
    issueGetOnConnect: false 
});

const TRIGGER_IDS = ['154', '185', '136'];
let isConnected = false;

async function connectionLoop() {
    if (isConnected) return;

    try {
        await device.connect(); 
    } catch (err) {
        // Ignorujeme timeouty při spánku
        setTimeout(connectionLoop, 1000);
    }
}

device.on('connected', () => {
    console.log('>>> PŘIPOJENO! (v3.4)');
    isConnected = true;

    // Zkusíme si říct o data, dokud je spojení živé
    device.refresh({ schema: true })
        .then(() => console.log('Refresh request odeslán.'))
        .catch(e => {});
});

device.on('disconnected', () => {
    console.log('<<< Odpojeno.');
    isConnected = false;
    setTimeout(connectionLoop, 1000);
});

device.on('error', (err) => {
    console.log('Error:', err.message);
    isConnected = false;
});

device.on('data', data => {
    console.log('DATA PŘIJATA:', JSON.stringify(data)); // <--- Tady musíme něco vidět

    if (!data || !data.dps) return;
    
    // Pro jistotu logujeme každou změnu DPS, abychom našli to správné ID
    if (data.dps) {
        console.log("Změna DPS:", data.dps);
    }

    const isRingEvent = TRIGGER_IDS.some(id => data.dps.hasOwnProperty(id));

    if (isRingEvent) {
        console.log(`!!! ZVONÍ !!! Volám webhook...`);
        axios.post(WEBHOOK_URL, { event: 'ring', raw_data: data.dps })
            .then(() => console.log('Webhook OK.'))
            .catch(err => console.error('Webhook Error:', err.message));
    }
});

console.log(`Startuji smyčku na IP: ${DEVICE_IP}`);
connectionLoop();