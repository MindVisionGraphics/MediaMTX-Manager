# MediaMTX Manager

Read START HERE.md for the complete Windows instructions. Extract the full Windows package and double-click Start Manager.vbs. No terminal or dependency installation is required.

Project files:
- launcher.mjs: keeps the local page available and restarts the manager in the same tab without opening another browser window.
- server.mjs: local controller, MediaMTX lifecycle, camera configuration, Windows DPAPI credential storage, sample publication, recording downloads and HLS proxy.
- website-feeds.mjs: creates Standard (360p/15fps) and Data Saver (180p/10fps) website feeds per publicly shared camera while preserving the original recording stream. Visitors choose independently on the public viewing page.
- sharing.mjs: isolated, read-only public video service on loopback port 17862; only explicitly shared cameras are available.
- recording-automation.mjs: per-camera recurring schedules, manual overrides, retention/quota/free-space cleanup and recording storage protection. Controls appear on Recordings; automatic cleanup is disabled by default.
- settings-backup.mjs: portable encrypted settings exports, authenticated decryption, schema checks and paused restore defaults. Settings provides preview/apply and previous-setup recovery; footage is excluded.
- stream-forwarding.mjs: RTMP/RTMPS destinations through MediaMTX native forwarding. FFmpeg supplies H.264 video plus silent AAC locally; native forwarding state/byte counts drive the UI. Keys use Windows encryption, outgoing forwarding is never resumed automatically after restart, and external-service compatibility remains experimental.
- dist/: navy/blue interface with connected-curve navigation. Hosted deployments use design-preview mode; the local app uses real server data.
- runtime/: bundled Windows x64 Node.js, MediaMTX and FFmpeg; excluded from Git.
- data/: per-computer settings, recordings and generated configuration; excluded from Git and distribution ZIP.
- Start Manager.vbs: hidden Windows launcher that opens the browser without CMD.

For development, run node launcher.mjs. Direct node server.mjs remains available for isolated controller tests. End users use the launcher and bundled runtime. MTX_MANAGER_DATA isolates test data; MTX_MANAGER_PORT changes the manager port.

The controller binds to loopback, validates Host and Origin, and requires a per-launch token on mutations. It controls its own bundled server. Camera credentials are applied to MediaMTX in memory; generated configuration contains no camera passwords.

Official references: https://mediamtx.org/docs/features/control-api and https://www.tp-link.com/us/support/faq/2680/.
# Custom RTSP camera support

`camera-source.mjs` validates both the original Tapo setup and generic RTSP paths.
See CUSTOM CAMERAS.txt for setup and the limits of local verification.
