# Controlled FFmpeg builds

These are build instructions for maintainers, not end-user installation steps.
App users receive bundled executables and do not need command-line tools.

The manually started `Build documented FFmpeg` workflow builds on Windows x64,
Intel macOS and Apple Silicon macOS. It does not publish or replace app releases.
Workflow permissions are read-only; no signing credentials are used.

The complete FFmpeg and x264 source snapshots are pinned by revision and SHA-256
in sources.json. Sources are unmodified; the build applies no patches. x264 is
the sole enabled external media library. Dependency autodetection and unrelated
codecs, devices and protocols are disabled. Internal H.264/HEVC/AAC decoding,
libx264 encoding, native AAC encoding, RTSP/TCP, MP4, HLS, test-pattern generation
and scaling are retained for the manager's existing paths. This is not a general
replacement for every capability of a full FFmpeg distribution.

The native smoke test encodes/decodes sample video and audio, scales with the
actual website-quality encoder settings (for the separate custom integration),
publishes to a real MediaMTX instance, fetches HLS and reads RTSP back. Mac native
load commands must target 12.0 or earlier and reference only system libraries.
Windows imports must be system DLLs. No end-user codec package is required.

Each artifact includes the executable, version output, license texts, a build
report and corresponding-source.zip. That ZIP retains the two exact verified
source archives, actual configure arguments/configuration logs, the recipe and
workflow, compiler identity and smoke results. General-purpose build tools are
provided by the runner, with installed Windows package versions and license
notices recorded. Bit-for-bit reproducibility across changing compiler releases
is not claimed. Source availability must be preserved alongside public binaries.

Mac builds use MACOSX_DEPLOYMENT_TARGET=12.0, an ad hoc executable signature and
current GitHub Mac runners. This is not a claim of execution on Monterey 12.1,
Developer ID signing, or notarization. Original app acceptance results remain
distinct from tests of the replacement executable.
