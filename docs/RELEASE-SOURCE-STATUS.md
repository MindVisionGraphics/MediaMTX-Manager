# Controlled FFmpeg source builds — October 24, 2026

The previous vendor FFmpeg executables have been replaced in the new preview
packages by builds from pinned FFmpeg 9.0.2 and x264 source archives. No provider
email requests were sent, and a provider reply is no longer needed for this build.

The [recipe](../packaging/ffmpeg/BUILDING.md) verifies both source archive hashes,
records configure arguments and build logs, and restricts the external media
library set to statically linked libx264. Each executable has its own hash,
compiler identification, dependency report and native test results.

The matching release attachment, **MediaMTX-Manager-FFmpeg-Corresponding-Sources.zip**,
contains both complete upstream source archives plus actual records, recipes and
license material for Windows x64, Mac Intel and Mac Apple Silicon. Manager code
remains MIT; the separate FFmpeg executable and x264 retain their GPL terms.

Native component tests passed on all three architectures: H.264/AAC creation,
MP4 decoding, the existing custom quality filter chain, RTSP publish/receive and
MediaMTX HLS playback. Windows forwarding and both custom website quality feeds
also passed regression checks with the replacement. The owner subsequently confirmed the updated Windows installer and Intel Mac
Monterey build work after the requested recheck on October 24, 2026. Interactive
Apple Silicon desktop testing remains pending.

## Historical audit of superseded vendor binaries

The following findings apply only to the old vendor files. They do not describe
the source-built replacement and are not a finding of provider noncompliance.

## Material already collected

- Original Windows GPL text, configure flags and dependency version list.
- Exact Windows FFmpeg main source:
  [946fcce07b6dcd0331c8cc609192aeff5e1924f8](https://github.com/FFmpeg/FFmpeg/tree/946fcce07b6dcd0331c8cc609192aeff5e1924f8).
- Version-specific metadata for the Intel `9.0.2-tessus` build.
- File hashes and native build configuration strings for all three FFmpeg builds.
- Mac package license texts; manager-authored code remains MIT licensed.

## Specific unresolved items

| Build | Source/build information not yet verified |
| --- | --- |
| Windows 9.0.2 essentials | Release-specific recipe, patches and matching sources for statically included libraries. The provider's public build-suite fork was last changed in 2020, so it is not verified as the recipe for its September 2026 release. |
| Mac Intel 9.0.2-tessus | Exact source revision/local patches, matching static dependency source revisions and release recipe. The original ZIP contains only the executable. |
| Mac Apple Silicon, labeled 9.0 | Exact revision, patches, dependency revisions and release recipe. The provider's current source link points to the 6.1 branch; that does not establish a match for the file labeled 9.0. The original ZIP contains only the executable. |

A main-project source tarball alone is not being presented as the complete source
set for these static builds. GPLv3 section 6(d) permits source on another server
with clear directions and equivalent access; MindVision does not necessarily
need to host every source file itself. The outstanding check is that the matching
source/build information is actually available and identified.

Provider-specific requests were prepared but **not sent**. The owner chose the
controlled rebuild described above instead of pursuing those requests.

References: [Windows provider](https://www.gyan.dev/ffmpeg/builds/),
[Intel provider](https://evermeet.cx/ffmpeg/),
[Apple Silicon provider](https://osxexperts.net/),
[GPLv3](https://www.gnu.org/licenses/gpl-3.0.html).
