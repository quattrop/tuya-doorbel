const TuyAPI = require('tuyapi');
const axios = require('axios');

// Konfigurace z ENV proměnných
const device = new TuyAPI({
  id: process.env.TUYA_DEVICE_ID,
  key: process.env.TUYA_LOCAL_KEY,
  ip: process.env.TUYA_DEVICE_IP,
  version: '3.3',
  issueGetOnConnect: false
});

const WEBHOOK_URL = process.env.WEBHOOK_URL;

// DPS ID, která považujeme za "zvonění".
// 154 = Doorbell Call Status (nejčastější)
// 185 = Doorbell Press
// 136 = Doorbell State
const TRIGGER_IDS = ['154', '185', '136'];

console.log('--- Tuya Doorbell Bridge Starting ---');

function startConnection() {
    // Hledání zařízení na síti
    device.find().then(() => {
        console.log('Device found, connecting...');
        device.connect();
    }).catch((e) => {
        console.error('Error finding device:', e);
        setTimeout(startConnection, 5000);
    });
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
    // Kritická chyba, reconnect řeší 'disconnected' event
});

device.on('data', data => {
    // Logujeme vše, aby se dalo debugovat
    console.log('Data received:', JSON.stringify(data));

    if (!data || !data.dps) return;

    // Kontrola, zda změněná DPS je v našem seznamu spouštěčů
    const isRingEvent = TRIGGER_IDS.some(id => data.dps.hasOwnProperty(id));

    if (isRingEvent) {
        console.log(`!!! RING DETECTED !!! Calling Webhook...`);
        
        axios.post(WEBHOOK_URL, { 
            event: 'ring',
            raw_data: data.dps 
        })
        .then(() => console.log('Webhook sent successfully.'))
        .catch(err => console.error('Webhook failed:', err.message));
    }
});

// Spuštění
startConnection();