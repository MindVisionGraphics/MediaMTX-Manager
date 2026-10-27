# Monterey compatibility — controlled FFmpeg build

Application minimum macOS: **12.0**. The dependency replacement is FFmpeg 9.0.2
and libx264, built from the pinned sources and recipe published under
packaging/ffmpeg in the MediaMTX Manager repository. It replaces the older
prebuilt vendor FFmpeg files; those provider source-reference gaps are not being
carried into this component's distribution.

Electron 43.8.3, Node.js 22.23.4 and MediaMTX 1.21.1 remain as in the previous
Monterey package. All copied Mach-O executables, helper apps and frameworks are
checked for the intended CPU architecture and a deployment minimum no newer
than 12.0. The app Info.plist explicitly declares 12.0. No incompatible binary
has its native deployment commands patched merely to change a version label.

The FFmpeg build uses MACOSX_DEPLOYMENT_TARGET=12.0 and native Apple build tools.
Its external media library list is restricted to libx264, statically linked.
Other dynamic dependencies must be macOS system libraries. Matching source
archives, license texts, build scripts, configure arguments/logs, compiler
identity and native smoke results accompany the public release separately.
See runtime/ffmpeg/SOURCE.txt and build-report.json in the application resources.

Native component tests cover H.264/AAC creation, MP4 decode, scaling with the
existing custom website encoder settings, RTSP publication, a real MediaMTX
HLS playlist and RTSP receive/decode. Those tests run on current GitHub Mac
runners; they do not establish execution on Monterey 12.1 or test the complete
desktop app on Apple Silicon.

The owner previously confirmed Intel Monterey 12.1 app launch, sample video,
real Tapo viewing, recording/playback, pause/resume and same-window Quit/Start
with the prior FFmpeg component. The owner subsequently confirmed the updated Intel package works in Monterey. The camera connection/recording service is
otherwise unchanged. Keychain persistence, backup/restore, long-running use,
updates and preservation of data still need their remaining acceptance tests.

The FFmpeg executable has an ad hoc signature for native loading. The app is
not Developer ID signed or notarized in the 1.0.0 release. Source/build
documentation is not a claim of full platform acceptance or legal certification.
