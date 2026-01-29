const TuyAPI = require('tuyapi');
const axios = require('axios');
const fs = require('fs');

// Pomocná funkce pro časová razítka
function ts() {
    const now = new Date();
    return `[${now.toTimeString().split(' ')[0]}]`;
}

console.log(`${ts()} --- Tuya Doorbell Bridge (FINAL PRODUCTION) ---`);

// --- 1. Načtení konfigurace ---
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

// --- 2. Inicializace (Verze 3.3 se osvědčila) ---
const device = new TuyAPI({
    id: DEVICE_ID,
    key: LOCAL_KEY,
    ip: DEVICE_IP,
    version: '3.3', 
    issueGetOnConnect: false
});

// DPS, které značí zvonění. 154 je hlavní (obsahuje fotku).
const TRIGGER_IDS = ['154', '185', '136']; 
let isConnected = false;

// --- 3. Smyčka pro připojení ---
async function connectionLoop() {
    if (isConnected) return;
    try {
        await device.connect(); 
    } catch (err) {
        // Tiché ignorování timeoutů při spánku
        setTimeout(connectionLoop, 1000); 
    }
}

// --- 4. Event Listenery ---

device.on('connected', () => {
    console.log(`${ts()} >>> PŘIPOJENO. Čekám na data...`);
    isConnected = true;
    // Refresh nevoláme, zařízení posílá 'dp-refresh' samo po připojení (ověřeno v logu)
});

device.on('disconnected', () => {
    // Jen krátká hláška, ať neplníme log
    // console.log(`${ts()} <<< Odpojeno.`); 
    isConnected = false;
    setTimeout(connectionLoop, 1000);
});

device.on('error', (err) => {
    // Logujeme jen neobvyklé chyby
    if (!err.message.includes('timeout') && !err.message.includes('ECONNREFUSED')) {
        console.error(`${ts()} Error: ${err.message}`);
    }
    isConnected = false;
});

// Funkce pro zpracování dat (společná pro 'data' i 'dp-refresh')
function handleData(data) {
    if (!data || !data.dps) return;

    // Zkontrolujeme, zda data obsahují trigger (zvonění)
    const triggerId = TRIGGER_IDS.find(id => data.dps.hasOwnProperty(id));

    if (triggerId) {
        console.log(`${ts()} !!! ZVONĚNÍ DETEKOVÁNO (DPS ${triggerId}) !!!`);
        
        let payload = {
            event: 'ring',
            battery: data.dps['145'] || 'unknown' // Přibalíme i stav baterie, když tam je
        };

        // EXTRABUŘT: Pokud je to DPS 154, dekódujeme obrázek
        if (triggerId === '154' && typeof data.dps['154'] === 'string') {
            try {
                // Dekódování Base64 -> String
                const imageUrl = Buffer.from(data.dps['154'], 'base64').toString('utf8');
                console.log(`${ts()} + Nalezena URL obrázku!`);
                payload.image = imageUrl;
            } catch (e) {
                console.error('Chyba dekódování obrázku');
            }
        }

        // Odeslání webhooku
        axios.post(WEBHOOK_URL, payload)
            .then(() => console.log(`${ts()} -> Webhook odeslán.`))
            .catch(err => console.error(`${ts()} -> Chyba webhooku: ${err.message}`));
    }
}

device.on('data', handleData);
device.on('dp-refresh', handleData);

// Start
console.log(`${ts()} Startuji službu na IP: ${DEVICE_IP}`);
connectionLoop();