\# Tuya Battery Doorbell Bridge (Home Assistant Add-on)



A specialized Home Assistant Add-on designed to bridge \*\*battery-powered Tuya video doorbells\*\* that use deep sleep mode to Home Assistant via Webhooks.



\### 🛑 The Problem

Standard Tuya integrations (LocalTuya, Tuya Official) often fail with battery doorbells because the device stays offline (deep sleep) 99% of the time to save battery. It only wakes up for a few seconds when the button is pressed. Standard integrations cannot reconnect fast enough to capture the event.



\### ✅ The Solution

This add-on uses a "hammering" connection strategy. It runs a persistent connection loop that instantly detects when the device wakes up, establishes a TCP session, captures the event (Ring/Motion), decodes the snapshot image, and pushes the data to Home Assistant via a high-speed local Webhook.



\## ✨ Features

\* \*\*Instant Detection:\*\* Reacts immediately when the doorbell wakes up.

\* \*\*Image Decoding:\*\* Automatically decodes the Base64 snapshot (DPS `154`) into a valid URL.

\* \*\*Battery Reporting:\*\* Forwards battery level (DPS `145`) if available.

\* \*\*Silent Operation:\*\* Filters out connection timeout logs by default (to keep logs clean).

\* \*\*Debug Mode:\*\* Optional toggle to see raw data and connection errors for troubleshooting.



\## 📋 Prerequisites



1\.  \*\*Tuya Device ID \& Local Key:\*\* You need to obtain these from the Tuya IoT Platform or using `tuya-cli`.

&nbsp;   \* \*Note: If you remove/re-add the device in the Tuya app, the Local Key WILL change!\*

2\.  \*\*Static IP Address:\*\* You \*\*must\*\* set a static IP (DHCP reservation) for your doorbell in your router. The add-on needs to know exactly where to listen.



\## ⚙️ Configuration



In the Add-on configuration tab, fill in the following fields:



| Option | Description | Example |

| :--- | :--- | :--- |

| `tuya\_device\_id` | The unique ID of your device. | `bf005c...` |

| `tuya\_local\_key` | The local security key (16 chars). | `1d44555d...` |

| `tuya\_device\_ip` | \*\*Critical:\*\* The local static IP of the doorbell. | `192.168.0.104` |

| `webhook\_url` | The local HA webhook URL. | `http://homeassistant.local:8123/api/webhook/doorbell\_ring` |

| `debug\_logging` | Enable verbose logging (default: false). | `true` / `false` |





\### Webhook URL Format

You can choose any `WEBHOOK\_ID` you like (e.g., `doorbell\_ring`), but you must use the same ID in your Automations.



&nbsp;   http://<YOUR\_HA\_IP>:8123/api/webhook/<YOUR\_CHOSEN\_WEBHOOK\_ID>



📡 How it works (The Payload)

When the doorbell is pressed, the add-on sends a POST request to your Webhook URL with the following JSON payload:



JSON



{

&nbsp; "event": "ring",

&nbsp; "battery": 100,

&nbsp; "image": "\[https://ty-eu-storage30-pic.s3.eu-central-1.amazonaws.com/](https://ty-eu-storage30-pic.s3.eu-central-1.amazonaws.com/)..."

}

event: Always ring.



battery: Percentage (if available).



image: A direct link to the snapshot captured by the doorbell (note: this URL is signed and valid for a limited time).







\## 🏠 Home Assistant Setup



\### Step 1: Enable Image Downloading

To persist the image (so it can be shown on a dashboard), we need a shell command to download it.

Add this to your `configuration.yaml`:



shell\_command:

&nbsp; # Downloads the image from the URL provided by the webhook to the local www folder

&nbsp; download\_doorbell\_image: 'wget -O /config/www/last\_doorbell.jpg "{{ url }}"'

Note: You must restart Home Assistant after adding this.



Step 2: Create a Camera Entity

Since YAML configuration for cameras is deprecated in newer HA versions, set this up via UI:



Go to Settings -> Devices \& Services -> Add Integration.



Search for Generic Camera.



Still Image URL: http://127.0.0.1:8123/local/last\_doorbell.jpg



Verify SSL: Uncheck (Disable).



Finish setup and name it "Doorbell Camera".



\### Step 3: Automation Example

This automation handles the ring, downloads the image, updates the camera, and sends a rich notification to your phone.



```yaml

alias: "Doorbell Ring Handling"

mode: queued

max: 5

trigger:

&nbsp; - platform: webhook

&nbsp;   webhook\_id: "doorbell\_ring" # Must match Add-on config

&nbsp;   local\_only: true

action:

&nbsp; # 1. Download the image to local storage

&nbsp; - service: shell\_command.download\_doorbell\_image

&nbsp;   data:

&nbsp;     url: "{{ trigger.json.image }}"



&nbsp; # 2. Wait a moment for the file to save

&nbsp; - delay: "00:00:01"



&nbsp; # 3. Force the camera entity to refresh the image

&nbsp; - service: homeassistant.update\_entity

&nbsp;   target:

&nbsp;     entity\_id: camera.doorbell\_camera



&nbsp; # 4. Send Notification (Android Example with Notification Channel)

&nbsp; - service: notify.mobile\_app\_my\_phone

&nbsp;   data:

&nbsp;     message: "Someone is at the door!"

&nbsp;     title: "Ding Dong!"

&nbsp;     data:

&nbsp;       image: "{{ trigger.json.image }}" # Use the cloud link for faster mobile delivery

&nbsp;       ttl: 0

&nbsp;       priority: high

&nbsp;       channel: "Doorbell\_Alarm\_Channel" # Configure sound/vibration for this channel on your phone

&nbsp;       tag: "doorbell\_ring"

&nbsp;       clickAction: "/lovelace/doorbell"



```



\## 🔧 Troubleshooting



\### Nothing happens when I ring

1\.  Check if the Add-on is running.

2\.  Go to \*\*Configuration\*\* and enable \*\*Debug Logging\*\*.

3\.  Restart the Add-on and check the logs while ringing.



\### Common Log Messages

\* \*\*`Socket Error: connection timed out`\*\*:

&nbsp;   \* \*If Debug is OFF:\* You shouldn't see this.

&nbsp;   \* \*If Debug is ON:\* This is normal behavior when the doorbell is sleeping.

\* \*\*`HMAC mismatch`\*\*:

&nbsp;   \* \*\*Critical Error.\*\* Your `tuya\_local\_key` is incorrect. If you re-paired the device in the app, the key has changed. You must get the new key.

\* \*\*`Connected` but no `RING DETECTED`\*\*:

&nbsp;   \* The doorbell might use a different DPS ID for ringing. Enable Debug Mode, ring the bell, and look for `\[DEBUG] Raw Data`. Check which ID changes (e.g., `136`, `115`) and report it.



\## License

MIT License.

