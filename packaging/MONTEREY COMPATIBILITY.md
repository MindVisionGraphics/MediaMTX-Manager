# MediaMTX Manager — Monterey test build

Target: **macOS 12.0 and later**, specifically awaiting testing on **12.1**.
Prepared on Windows on October 23, 2026. This is an unsigned test build,
not a signed/notarized public release. Actual Mac execution has not been verified.

## Native dependency audit

- Electron **43.8.3**, replacing 45.0.0. Electron 44 and later require macOS 13;
  the Electron 43 executables and frameworks declare a macOS 12.0 minimum.
- Node.js **22.23.4**, replacing 24.19.0. Official Node 22 binaries target macOS
  11.0, below this app's 12.0 floor. No Node 24-only APIs are used by the manager.
- MediaMTX **1.21.1**, replacing 1.21.2. Its binaries target macOS 12.0 and use
  Go 1.26; 1.21.2 uses Go 1.27 and its binaries target 13.0. This is a deliberate
  dependency downgrade for this compatibility test, not an equivalent patched
  rebuild of 1.21.2. Newer server fixes are absent. Keep the manager and playback
  APIs on loopback; expose only the restricted public viewer through HTTPS.
- FFmpeg: Intel 9.0.2 from evermeet.cx declares 10.13; Apple Silicon 9.0 from
  osxexperts.net declares 12.0. These statically bundled builds do not require
  Homebrew or separately installed media libraries. Apple Silicon file SHA-256
  is checked against the publisher's posted hash. Intel archive hashing records
  build identity; upstream GPG signature verification remains pending.
- hls.js **1.6.16** is browser JavaScript, executed in Electron's bundled Chromium.

The build checks every copied Mach-O executable, framework and dylib, including
Electron helpers. It rejects a minimum OS above 12.0, an architecture mismatch,
or an unexpected external library path. See the accompanying JSON for exact
deployment targets, load dependencies and archive SHA-256 values. OS libraries
come from macOS; Electron libraries are included in the app bundle.

The outer Info.plist explicitly sets LSMinimumSystemVersion and architecture
minimums to 12.0. Native deployment commands are inspected, not relabeled or patched
to hide incompatible code. Executable permissions and framework symlinks survive
ZIP packaging. No compiled manager addon or Swift/Objective-C code is introduced.

## Application API review

- Backend: Node HTTP/net/fs/path/URL/crypto/child_process/stream/util APIs,
  fetch, AbortSignal.timeout, randomUUID, scrypt, AES-GCM, Readable.fromWeb and
  fs.statfsSync are present in Node 22. No package installation is required.
- Desktop: BrowserWindow, context isolation/sandboxing, permission handlers,
  navigation restrictions, downloads, Menu, shell.openExternal, app paths,
  single-instance locking and dialog APIs are available in Electron 43.
- Credentials: Electron safeStorage encryptString/decryptString and
  isEncryptionAvailable use macOS Keychain. Keychain approval/persistence still
  needs an actual Monterey test; plaintext fallback is not enabled.
- Platform integration uses /usr/bin/open and macOS Application Support paths.
  There are no direct APIs requiring Ventura, SwiftUI or a newer macOS SDK.
- Camera/recording/forwarding configuration uses MediaMTX's v3 API. Version
  1.21.1 exposes the same required configuration keys and forwarding endpoints.
  Cross-platform regression results are recorded separately; they do not prove
  macOS execution, media decoding or Keychain behavior.

## Remaining Mac acceptance checks

Cross-platform regressions passed on Windows with Node 22.23.4 and MediaMTX
1.21.1: custom authenticated/anonymous RTSP inputs, HLS, actual recording,
camera pause/resume/edit, encrypted backups and restore validation, schedules,
storage cleanup protection, viewer counts, native RTMP forwarding with H.264/AAC,
Standard/Data Saver feed isolation, and three consecutive same-page Quit/Start
cycles. Desktop security/single-instance/download behavior also passed its mocked
API regression. These are not Mac runtime results.

1. Extract with Finder/Archive Utility, move the app into Applications, and open.
2. Check launch and single-window behavior, including Quit/Start in that window.
3. Play and record a sample, then connect the real Tapo camera.
4. Confirm credentials survive closing and reopening the app through Keychain.
5. Check recording playback/download, schedules, cleanup and backup/restore.
6. Check public viewing, quality presets and viewer counts.

Static deployment/API checks cannot guarantee every runtime symbol or device
behavior on Monterey 12.1. Signing, notarization and the tests above remain pending.

## Upstream references

- https://www.electronjs.org/docs/latest/breaking-changes#breaking-changes-440
- https://github.com/nodejs/node/blob/v22.23.4/BUILDING.md
- https://go.dev/doc/go1.26#darwin
- https://github.com/bluenviron/mediamtx/blob/v1.21.1/go.mod
- https://github.com/electron/electron/blob/v43.8.3/docs/api/safe-storage.md
- https://evermeet.cx/ffmpeg/
- https://osxexperts.net/

## Subsequent owner test results

Intel Monterey 12.1 in VirtualBox: launch, sample video/recording, real Tapo
viewing, recording and playback, pause/resume, and same-window Quit/Start passed.
Apple Silicon remains untested on hardware. Keychain persistence, backup/restore
and longer-running Mac acceptance remain pending. The original JSON bundled
with the locally built ZIP describes the build-time static checks.
