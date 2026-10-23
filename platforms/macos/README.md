# macOS Monterey preview

Minimum macOS: **12.0**. Intel testing was performed on **Monterey 12.1** in VirtualBox.

## Builds

- Intel (x64): launch, sample playback/recording, real Tapo camera viewing,
  recording and saved-recording playback, camera pause/resume, and same-window
  Quit/Start passed owner tests.
- Apple Silicon (M-series): architecture/deployment/package checks passed;
  not tested on Apple Silicon hardware. User feedback is welcome.

The reported virtual-machine restart is attributed by the tester to the VM
setup and is excluded from application pass/fail results. Keychain persistence,
backup/restore and longer-running Mac acceptance checks remain unconfirmed.
Both builds are unsigned and not notarized; these are preview packages.

Extract the architecture-specific ZIP in macOS and move MediaMTX Manager.app
into Applications. No Terminal or manual dependency installation is intended.
When published, get the ZIPs from [Releases](https://github.com/MindVisionGraphics/MediaMTX-Manager/releases).
Report problems through [Issues](https://github.com/MindVisionGraphics/MediaMTX-Manager/issues),
including your macOS version, processor type and steps to reproduce; omit passwords.

See [the compatibility report](../../packaging/MONTEREY%20COMPATIBILITY.md)
and [build script](../../packaging/build-macos.py). The script expects the local
project build layout and downloaded archives; it is not a standalone CI pipeline.
