# Release source audit — October 24, 2026

The four app downloads and their checksums are uploaded to a **private draft**.
This page identifies the remaining source provenance work; it is not a finding
that a provider has violated a license, or a legal certification.

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

Provider-specific requests have been prepared; **no provider has been contacted**.
A response may identify existing complete material, or supply missing information.
An alternative is to use builds made from a fully tracked source set, followed by
new platform testing. No unsupported source-supply promise is being made.

References: [Windows provider](https://www.gyan.dev/ffmpeg/builds/),
[Intel provider](https://evermeet.cx/ffmpeg/),
[Apple Silicon provider](https://osxexperts.net/),
[GPLv3](https://www.gnu.org/licenses/gpl-3.0.html).
