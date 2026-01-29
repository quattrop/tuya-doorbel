const TuyAPI = require('tuyapi');
const axios = require('axios');
const fs = require('fs');

console.log('--- Start Tuya Doorbell Bridge (Debug Mode) ---');

let config = {};
const OPTIONS_PATH = '/data/options.json';

// 1. Zkusíme načíst soubor a vypsat jeho obsah
try {
    if (fs.existsSync(OPTIONS_PATH)) {
        const optionsRaw = fs.readFileSync(OPTIONS_PATH, 'utf8');
        console.log('DEBUG: Obsah options.json:', optionsRaw); // TOTO JE KLÍČOVÉ
        config = JSON.parse(optionsRaw);
    } else {
        console.error(`ERROR: Soubor ${OPTIONS_PATH} neexistuje!`);
    }
} catch (e) {
    console.error("ERROR: Chyba při čtení konfigurace:", e.message);
}

// 2. Mapování proměnných
const DEVICE_ID = config.tuya_device_id ? config.tuya_device_id.trim() : process.env.TUYA_DEVICE_ID;
const LOCAL_KEY = config.tuya_local_key ? config.tuya_local_key.trim() : process.env.TUYA_LOCAL_KEY;
const WEBHOOK_URL = config.webhook_url ? config.webhook_url.trim() : process.env.WEBHOOK_URL;

// --- ÚPRAVA: Logika pro ignorování IP ---
let rawIp = config.tuya_device_ip ? config.tuya_device_ip.trim() : "";

// Pokud je v poli napsáno "0.0.0.0" nebo "AUTO", ignorujeme to -> spustí se Auto-discovery
if (rawIp === "0.0.0.0" || rawIp.toUpperCase() === "AUTO") {
    rawIp = undefined;
}

const DEVICE_IP = (rawIp && rawIp.length > 5) ? rawIp : undefined;
// ----------------------------------------

console.log(`DEBUG: Použité hodnoty -> ID: '${DEVICE_ID}', IP: '${DEVICE_IP || 'Auto-discovery (čekám na signál)'}'`);

// 3. Záchranná brzda před pádem
if (!DEVICE_ID) {
    console.error("CRITICAL ERROR: Chybí Device ID! Zkontroluj nastavení doplňku.");
    // Uspíme proces, aby se neresetoval ve smyčce, a uživatel si mohl přečíst log
    setInterval(() => {}, 10000); 
} else {
    // 4. Spuštění Tuya API až když máme data
    const device = new TuyAPI({
        id: DEVICE_ID,
        key: LOCAL_KEY,
        ip: DEVICE_IP,
        version: '3.3',
        issueGetOnConnect: false
    });

    // DPS ID pro zvonění
    const TRIGGER_IDS = ['154', '185', '136'];

    startConnection();

    function startConnection() {
        if (!DEVICE_IP) {
            console.log('Hledám zařízení na síti (Auto-discovery)...');
            device.find().then(() => {
                console.log('Zařízení nalezeno, připojuji...');
                device.connect();
            }).catch((e) => {
                console.error('Chyba při hledání:', e);
                // Zkusíme to znovu za 10s
                setTimeout(startConnection, 10000);
            });
        } else {
            console.log(`Připojuji přímo na IP ${DEVICE_IP}...`);
            device.connect();
        }
    }

    device.on('connected', () => {
        console.log('Connected to device!');
    });

    device.on('disconnected', () => {
        console.log('Disconnected. Reconnecting in 5s...');
        setTimeout(startConnection, 5000);
    });

    device.on('error', error => {
        console.error('Error:', error);
    });

    device.on('data', data => {
        console.log('Data received:', JSON.stringify(data));

        if (!data || !data.dps) return;

        const isRingEvent = TRIGGER_IDS.some(id => data.dps.hasOwnProperty(id));

        if (isRingEvent) {
            console.log(`!!! RING DETECTED !!! Calling Webhook...`);
            axios.post(WEBHOOK_URL, { event: 'ring', raw_data: data.dps })
                .then(() => console.log('Webhook sent.'))
                .catch(err => console.error('Webhook failed:', err.message));
        }
    });
}