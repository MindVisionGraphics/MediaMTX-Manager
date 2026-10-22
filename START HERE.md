# MediaMTX Manager for Windows

This complete portable package is for Windows 11 on a 64-bit Intel or AMD computer. It includes the manager runtime, MediaMTX, FFmpeg, and the video player. No CMD, dependency installation, Docker, or administrator access is needed.

## Open the manager

1. Extract the **entire ZIP** to a normal folder, such as Documents\MediaMTX Manager. Do not run it from inside the ZIP.
2. Double-click **Start Manager.vbs**. It launches quietly and opens your default browser.
3. The address is **http://127.0.0.1:17860**. Leave the folder in place while the app is running.

The desktop package also includes **Start Desktop.vbs**, which opens a dedicated app window using the same local setup. Run **Create Shortcuts.vbs** once to put the available editions on your Desktop and Start menu. See **DESKTOP EDITION.txt**. This is a portable preview; the signed installer remains pending.

The manager starts its own MediaMTX server. If a manager page is already open, starting the launcher again reuses the running instance. **Settings → Quit manager** stops the camera manager and MediaMTX, while the small local launcher keeps the page available. Use **Start manager** on that page to reconnect in the same tab. Refreshing the stopped page works too. Closing the browser alone leaves the manager running.

## Test before the cameras arrive

Select **Start sample stream** on the empty dashboard or in Settings. The moving color pattern is real video generated on this computer and streamed through MediaMTX. It does not need internet access.

Select **Record**, wait several seconds, then **Stop recording**. Open **Recordings** and refresh. You can play or download the saved MP4. A file still being written is marked as recording; stop recording to finalize it.

The generated test stream is 720p at 15 fps to keep CPU use modest. Camera main streams pass through at the camera-selected resolution; the app does not upscale or transcode Tapo video. The C100 main stream can provide 1080p. Playback adds a few seconds of buffering in this first version.

## Connect a Tapo C100 / C110

1. Set up the camera in the Tapo app on your home Wi-Fi.
2. Create a **Camera Account** under **Camera Settings → Advanced Settings → Camera Account**. This is separate from your Tapo sign-in.
3. Find the camera's IP address in the app's device information.
4. Choose **Add camera** here. Enter its name, IP address, Camera Account username and password. Leave the port at **554**.
5. Choose **Main stream** for the best picture or **Low bandwidth** for weak Wi-Fi. Save.

“Waiting” means MediaMTX has not received a usable stream. Check the IP address, credentials, power and Wi-Fi. Edit, pause, resume or remove a camera from its card. Removing a camera preserves saved recordings. A router IP reservation can keep each camera's address stable.

## Files and moving computers

- Settings are stored in **data\workspace.json**. Passwords are encrypted with Windows DPAPI for the current Windows account and are not returned to the browser or hosted site.
- Recordings are saved in **data\recordings**. Automatic cleanup is optional and can be configured under recording storage settings; it starts disabled.
- Extract a fresh copy of the ZIP on the camera computer and open Start Manager.vbs there. Add the camera details again. Passwords saved on another Windows account/computer cannot be decrypted there. Copy finalized recordings separately if wanted.
- This version opens on the computer running the manager. The cameras connect over your home network. Opening the manager from other devices will need a separate authenticated network-access feature.

## Troubleshooting

The manager and MediaMTX listeners are bound to this computer only. No router port forwarding or inbound firewall changes are needed. If a port is occupied, close another instance of MediaMTX. This package uses local ports 17860 (launcher/page), 17861 (internal manager), 18554, 18888, 19996 and 19997.

Extract all files first and keep **runtime** next to **server.mjs** and **dist**. If an organization disables Windows Script Host, the launcher needs an approved alternative. The package does not change security settings.

## Current scope

Validated on the development Windows computer: real MediaMTX startup, sample RTSP publication, browser HLS playback, recording start/stop, MP4 decoding, playback/download, camera configuration, request protection and encrypted credential round-trip. The owner has also confirmed real Tapo viewing, pause/resume and recording. Other physical camera brands remain unverified. This is an early local build, not yet a signed installer or Windows service.

The hosted site remains a design preview. Use the local Windows package for live cameras and recordings.
