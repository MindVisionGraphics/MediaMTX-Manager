# MediaMTX Manager checklist

Implemented:
- Matching blue M / mint play logo in sidebar, favicon, title-bar icon, Windows application/setup/shortcuts and Mac ICNS packaging. Vector and multi-resolution icon assets included.
- Windows graphical setup EXE built with the Windows compiler, packaged app startup/recording tested. Installer execution blocked by automatic approval review; owner confirmed graphical installation and same-window Quit/Start pass; import/upgrade/uninstall acceptance remains pending.
- macOS runtime paths and Keychain credential-helper bridge prepared; Apple Silicon and Intel .app ZIPs pass manifest/architecture/archive checks. Mac execution and signing/notarization are unverified.
- Watch page Quality menu and owner-selected default, anonymous active website viewer counts per camera/overall, and Help/FAQ instead of a troubleshooting log. Browser playback/count/quality tests passed.
- Portable Windows desktop preview: dedicated sandboxed window, single-instance focus, shared local manager and Desktop/Start-menu shortcut helper. Local launch/record/restart tests passed; full native video/download user acceptance pending.
- Custom RTSP camera paths and optional login, alongside the original Tapo setup. Local authenticated/anonymous sources, recording and backup tests passed; physical other-brand cameras unverified.
- Connected-curve navigation, workspace settings and branded About page.
- Camera viewing, pause/resume, recording timers and MP4 playback/download.
- Same-tab manager restart and MediaMTX start/stop controls.
- Public website viewer with independent Standard/Data Saver choices.
- Recurring recording schedules and recording-storage cleanup/protection.
- Encrypted settings backup/restore and previous-setup recovery: local tests passed; user acceptance check pending.
- RTMP/RTMPS stream-forwarding controls: native MediaMTX forwarding with silent AAC compatibility track, encrypted keys and local RTMP receiver tests. Outside-service integrations remain experimental.

Remaining:
- External-service forwarding verification and broader protocol/source controls (including WebRTC/SRT) as needed.
- Remaining Windows import/upgrade/uninstall acceptance and code signing.
- Test Mac launch, Keychain access, cameras, playback and updates on macOS; finish Mac signing/notarization and release packaging.
- Final release checks and documentation.
- GitHub publication when the owner is ready; exclude camera data, recordings and backup files.

Separate scope: video-file backup/archival, authenticated remote manager controls and company-style user roles are not implemented.
