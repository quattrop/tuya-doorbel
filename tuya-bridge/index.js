const TuyAPI = require('tuyapi');
const axios = require('axios');
const fs = require('fs');

console.log('--- Tuya Doorbell Bridge (Deep Sleep Mode) ---');

// --- Načtení Configu ---
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

if (!DEVICE_IP || DEVICE_IP === "0.0.0.0") {
    console.error("CHYBA: Pro tento režim MUSÍŠ zadat IP adresu zvonku (192.168.0.XXX)!");
    process.exit(1);
}

// Inicializace API
const device = new TuyAPI({
    id: DEVICE_ID,
    key: LOCAL_KEY,
    ip: DEVICE_IP,
    version: '3.3',
    issueGetOnConnect: false
});

// DPS ID pro zvonění
const TRIGGER_IDS = ['154', '185', '136'];
let isConnected = false;

// --- Hlavní smyčka připojování ---
async function connectionLoop() {
    if (isConnected) return; // Pokud jsme připojení, nic neděláme

    try {
        // Pokus o připojení s krátkým timeoutem (aby to neviselo)
        // TuyAPI nemá timeout v options, řešíme to wrapperem nebo spoléháme na reject
        await device.connect(); 
    } catch (err) {
        // Zvonek spí = Timeout nebo Unreachable. To je OČEKÁVANÝ STAV.
        // Nebudeme logovat každou chybu, ať nezasviníme log.
        // Jen pokud je to jiná chyba než timeout, vypíšeme ji.
        if (err.message && !err.message.includes('timeout') && !err.message.includes('EHOSTUNREACH')) {
             console.log('Chyba spojení (sleep?):', err.message);
        }
        
        // Zkusíme to znovu za 1 vteřinu
        setTimeout(connectionLoop, 1000);
    }
}

// --- Event Listenery ---

device.on('connected', () => {
    console.log('>>> PŘIPOJENO! Zvonek se probudil.');
    isConnected = true;
});

device.on('disconnected', () => {
    console.log('<<< Odpojeno. Zvonek asi usnul. Vracím se do čekací smyčky...');
    isConnected = false;
    setTimeout(connectionLoop, 1000); // Okamžitě začni zkoušet znovu
});

device.on('error', (err) => {
    // Tady chytáme chyby po připojení.
    // Ignorujeme je, reconnect řeší 'disconnected' nebo smyčka
    isConnected = false;
});

device.on('data', data => {
    console.log('DATA:', JSON.stringify(data));

    if (!data || !data.dps) return;
    const isRingEvent = TRIGGER_IDS.some(id => data.dps.hasOwnProperty(id));

    if (isRingEvent) {
        console.log(`!!! ZVONĚNÍ DETEKOVÁNO !!! Volám webhook...`);
        axios.post(WEBHOOK_URL, { event: 'ring', raw_data: data.dps })
            .then(() => console.log('Webhook OK.'))
            .catch(err => console.error('Webhook Error:', err.message));
    }
});

// Start
console.log(`Startuji smyčku na IP: ${DEVICE_IP}`);
connectionLoop();