#!/usr/bin/with-contenv bashio

echo "Starting Tuya Doorbell Bridge..."

# Převedení HA options na ENV proměnné pro Node.js
export TUYA_DEVICE_ID=$(bashio::config 'tuya_device_id')
export TUYA_LOCAL_KEY=$(bashio::config 'tuya_local_key')
export TUYA_DEVICE_IP=$(bashio::config 'tuya_device_ip')
export WEBHOOK_URL=$(bashio::config 'webhook_url')

# Kontrola (volitelné)
if [ -z "$TUYA_DEVICE_ID" ]; then
    bashio::log.error "Chybí Device ID!"
    exit 1
fi

# Spuštění aplikace
cd /app
exec node index.js