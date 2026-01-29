Tuya Battery Doorbell Bridge (Home Assistant Add-on)A specialized Home Assistant Add-on designed to bridge battery-powered Tuya video doorbells that use deep sleep mode.Standard Tuya integrations often fail with battery doorbells because the device stays offline (sleeps) 99% of the time and only wakes up for a few seconds when the button is pressed. This add-on acts as a persistent listener, capturing the momentary connection, decoding the event, and forwarding it to Home Assistant via a Webhook.Key Features:🚀 Instant detection: Uses a persistent socket connection loop to catch the device immediately upon wake-up.📸 Snapshot decoding: Automatically decodes the Base64 image URL (DPS 154) sent by the doorbell.🔋 Battery reporting: Forwards battery levels (DPS 145) if available.⚡ Webhook integration: Pushes data directly to Home Assistant automation or sensors.PrerequisitesTuya Device ID \& Local Key: You need to obtain these from the Tuya IoT Platform or using tuya-cli.Note: If you remove/re-add the device in the app, the Local Key changes!Static IP Address: You must set a static IP (DHCP reservation) for your doorbell in your router. The add-on needs to know exactly where to listen.ConfigurationIn the Add-on configuration tab, fill in the following fields:OptionDescriptionExampletuya\_device\_idThe unique ID of your device.bf005c...tuya\_local\_keyThe local security key (16 chars).1d44555d...tuya\_device\_ipCritical: The local static IP of the doorbell.192.168.0.104webhook\_urlThe local HA webhook URL.http://homeassistant.local:8123/api/webhook/my\_doorbell\_idWebhook URL FormatThe URL should point to your local Home Assistant instance. You can choose any WEBHOOK\_ID you like (e.g., front\_door\_bell), but you must use the same ID in your Automations.http://<YOUR\_HA\_IP>:8123/api/webhook/<YOUR\_CHOSEN\_WEBHOOK\_ID>

How it works (The Payload)When the doorbell is pressed, the add-on sends a POST request to your Webhook URL with the following JSON payload:JSON{

&nbsp; "event": "ring",

&nbsp; "battery": 100,

&nbsp; "image": "https://ty-eu-storage30-pic.s3.eu-central-1.amazonaws.com/..."

}

event: Always "ring".battery: Percentage (if available).image: A direct link to the snapshot captured by the doorbell (valid for a limited time).Home Assistant SetupYou don't need to "create" a webhook. It is created automatically when an automation or sensor listens for it.Option 1: Create a Binary Sensor (Recommended)Add this to your configuration.yaml (or templates.yaml) to create a sensor that shows "Detected" when someone rings.YAMLtemplate:

&nbsp; - trigger:

&nbsp;     - platform: webhook

&nbsp;       webhook\_id: "my\_doorbell\_id"  # Must match the URL in Add-on config

&nbsp;       local\_only: true

&nbsp;   binary\_sensor:

&nbsp;     - name: "Doorbell Ring"

&nbsp;       unique\_id: "tuya\_doorbell\_ring"

&nbsp;       state: "true"

&nbsp;       auto\_off: "00:00:05" # Automatically turns off after 5 seconds

&nbsp;       device\_class: sound

&nbsp;       icon: mdi:doorbell

&nbsp;       attributes:

&nbsp;         image: "{{ trigger.json.image }}"

&nbsp;         battery: "{{ trigger.json.battery }}"

Option 2: Automation (Advanced)This example sends a notification to an Android phone with the snapshot image, sets a custom alarm sound (Samsung/Android), and plays a gong on a Google Home speaker.YAMLalias: "Doorbell Ring Handling"

description: "Notify mobile and play sound on Google Home"

trigger:

&nbsp; - platform: webhook

&nbsp;   webhook\_id: "my\_doorbell\_id"

&nbsp;   local\_only: true

action:

&nbsp; # 1. Play Gong on Google Home

&nbsp; - service: media\_player.volume\_set

&nbsp;   target:

&nbsp;     entity\_id: media\_player.living\_room\_speaker

&nbsp;   data:

&nbsp;     volume\_level: 0.7

&nbsp; - service: media\_player.play\_media

&nbsp;   target:

&nbsp;     entity\_id: media\_player.living\_room\_speaker

&nbsp;   data:

&nbsp;     media\_content\_id: "http://<YOUR\_HA\_IP>:8123/local/gong.mp3"

&nbsp;     media\_content\_type: music



&nbsp; # 2. Advanced Notification to Android (with Image \& Alarm Sound)

&nbsp; - service: notify.mobile\_app\_my\_phone

&nbsp;   data:

&nbsp;     message: "Someone is at the door!"

&nbsp;     title: "Ding Dong!"

&nbsp;     data:

&nbsp;       image: "{{ trigger.json.image }}"

&nbsp;       ttl: 0

&nbsp;       priority: high

&nbsp;       channel: "Domovni\_Zvonek\_Alarm" # Creates a custom channel on Android

&nbsp;       color: "#FF0000"

&nbsp;       clickAction: "{{ trigger.json.image }}"

&nbsp;       tag: "doorbell\_ring"



TroubleshootingConnection timed out / Host unreachable:This is normal behavior 99% of the time because the doorbell is sleeping.If it happens while you are pressing the button, verify the IP Address and Local Key.HMAC mismatch:Your tuya\_local\_key is incorrect. If you re-paired the device, the key has changed. Check via Tuya IoT Platform.Connected but no data:Ensure the add-on version matches the protocol used by the device (currently hardcoded to 3.3 as per testing).LicenseMIT License. See LICENSE file for details.

