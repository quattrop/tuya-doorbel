const TuyAPI = require('tuyapi');
const axios = require('axios');
const fs = require('fs');

console.log('--- Tuya Doorbell Bridge (FINAL: Verze 3.3 + Refresh) ---');

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
    version: '3.3',  // <--- VRACÍME SE K 3.3 (dle logu je to správně)
    issueGetOnConnect: false 
});

const TRIGGER_IDS = ['154', '185', '136', '115']; // Přidal jsem i 115 pro jistotu
let isConnected = false;

async function connectionLoop() {
    if (isConnected) return;
    try {
        await device.connect(); 
    } catch (err) {
        setTimeout(connectionLoop, 1000);
    }
}

device.on('connected', () => {
    console.log('>>> PŘIPOJENO! (v3.3)');
    isConnected = true;

    // Agresivní refresh je nutný, aby zvonek neukončil spojení
    console.log('Posílám Refresh...');
    device.refresh({ schema: true })
        .catch(e => {});
});

device.on('disconnected', () => {
    console.log('<<< Odpojeno.');
    isConnected = false;
    setTimeout(connectionLoop, 1000);
});

device.on('error', (err) => {
    // Pokud je chyba HMAC, vypíšeme ji výrazně, znamená to špatný klíč
    if (err.message.includes('HMAC')) {
        console.error('!!! KRITICKÁ CHYBA: HMAC mismatch = ŠPATNÝ LOCAL KEY !!!');
        console.error('Ověřte prosím Local Key v konfiguraci.');
    } else {
        console.log('Error:', err.message);
    }
    isConnected = false;
});

device.on('data', data => {
    console.log('DATA PŘIJATA:', JSON.stringify(data));

    if (!data || !data.dps) return;
    
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