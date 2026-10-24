# MediaMTX Manager

A desktop and browser interface for MediaMTX, created by **MindVision Graphics**.
View cameras, record video, manage storage and share selected feeds with your website.

## No command-line installation required

**No CMD, PowerShell, Terminal, sudo commands, or manual package installs.**
The packaged apps include the components they need—no separate Node.js,
MediaMTX, FFmpeg, or package-manager installation is required.

- **Windows desktop:** open the setup EXE and follow the on-screen installer.
- **Windows web edition:** extract the complete ZIP and double-click Start Manager.vbs.
- **macOS:** extract the correct app ZIP and drag MediaMTX Manager.app into Applications.

These instructions apply to the packaged downloads. GitHub's **Code → Download ZIP**
contains developer source files and is not a ready-to-install app. Preview downloads
are staged in a draft release and are not public yet. The Mac previews are unsigned
and not notarized; macOS may display a security warning.

## Preview status

This project is in active development. This repository currently provides source
code, interface assets and packaging sources. Public installer downloads are not
published yet. GitHub's Download ZIP contains source, not a ready-to-install app.

| Edition or check | Status |
| --- | --- |
| Windows graphical desktop installation | Passed by the project owner |
| Quit manager / Start manager in the same desktop window | Passed by the project owner |
| Tapo camera playback, pause/resume and recording | Passed in earlier owner tests |
| Installed web shortcut | Awaiting owner confirmation |
| Upgrade, uninstall and data preservation | Acceptance testing pending |
| macOS Intel — Monterey 12.1 | Core launch, camera, recording/playback, pause/resume and same-window Quit/Start passed owner tests |
| macOS Apple Silicon | Compatibility checks passed; hardware testing pending |
| Code signing / Mac notarization | Not completed |

The packaged Windows preview includes its required components and graphical
setup; end users do not need CMD, PowerShell or manual package installation.
The Mac preview also bundles its components and targets macOS 12.0 or later.
Keychain persistence and remaining Mac acceptance checks still need confirmation.

Platform notes: [Windows](platforms/windows/README.md) · [macOS](platforms/macos/README.md).
Packaged apps will be separate, clearly named attachments on the Releases page.

## Features

- Live camera dashboard with individual pause and resume controls.
- Tapo Camera Account setup and compatible custom RTSP camera paths.
- Recording timers, MP4 playback/download and recurring recording schedules.
- Optional age-based cleanup, storage limits and free-space protection.
- Encrypted settings backup and restore; recordings are excluded from backups.
- Separate public Watch page for explicitly shared cameras.
- Independent Standard and Data Saver website quality choices.
- Estimated active website viewing-session counts.
- Experimental RTMP/RTMPS forwarding controls.
- Connected-curve navigation, built-in FAQ and branded About page.

Camera and browser compatibility varies. External streaming-service forwarding
is experimental. This GUI does not claim tested support for every protocol
supported by MediaMTX itself.

## Camera setup

For a compatible Tapo camera, create its local **Camera Account** in the Tapo app,
then enter its local network address and Camera Account credentials in Add camera.
This account is separate from your normal Tapo sign-in. Other compatible cameras
can use their manufacturer-provided RTSP path. H.264 is recommended for browser
viewing. Camera passwords, recordings and local configuration are not in this repo.

## Desktop, browser and website viewing

Desktop and browser editions share the same local workspace. The manager normally
opens at http://127.0.0.1:17860/. Closing its window leaves the manager running;
Quit manager stops its worker and leaves Start manager available in the same window.

Public website viewing is a separate, restricted service. Select the cameras to
share and configure an HTTPS website connection; do not expose the private manager
or camera credentials. Visitor quality choices do not change original recordings.
See [website viewing](WEBSITE%20VIEWING.md) for configuration details.

## Source and development

This source checkout excludes Node.js, Electron, MediaMTX and FFmpeg binaries.
It is not the complete end-user installation package. With compatible runtimes
provided in runtime/, developers can run `node launcher.mjs`.
See [the source guide](docs/SOURCE-GUIDE.md) and [packaging notes](packaging/README.txt).
The packaging scripts currently expect the project's local build layout; they are
not yet a standalone automated release pipeline.

## A little hidden history 🏴‍☠️

The Mac edition has a hidden Easter egg from the developer. A little curiosity
might uncover the story behind getting it running. Can you find it?

## License and credits

Manager-authored code is provided under the [MIT license](LICENSE).
Bundled and vendored components retain their own licenses. See
[third-party notices](THIRD-PARTY-NOTICES.md); the MIT license does not relicense
FFmpeg, Chromium, hls.js or other dependencies.

Created by [MindVision Graphics](https://mindvisiongraphics.com/).
Independent project; not affiliated with MediaMTX, TP-Link or Tapo.
