#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
REPO="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
WORK_ROOT="${RUNNER_TEMP:?}/mtx-ffmpeg"
if [[ "${RUNNER_OS:?}" == Windows ]]; then
  WORK_ROOT="$(cygpath -u "$WORK_ROOT")"
fi
mkdir -p "$WORK_ROOT" "$REPO/.ffmpeg-artifacts"
python3 "$SCRIPT_DIR/prepare.py" "$WORK_ROOT"
PREFIX="$WORK_ROOT/prefix"
mkdir -p "$PREFIX"
export PKG_CONFIG_PATH="$PREFIX/lib/pkgconfig"
export MACOSX_DEPLOYMENT_TARGET=12.0

X264_FLAGS=(--prefix="$PREFIX" --enable-static --disable-cli --disable-opencl --enable-pic)
FFMPEG_FLAGS=(
  --prefix="$PREFIX" --disable-autodetect --disable-doc --disable-debug
  --disable-shared --enable-static --enable-gpl --enable-version3 --enable-libx264
  --disable-ffplay --disable-ffprobe --disable-everything --enable-ffmpeg
  --enable-network --enable-avdevice --enable-swscale --enable-swresample
  --enable-indev=lavfi
  --enable-protocol=file,tcp,udp,rtp,http,crypto,data
  --enable-demuxer=rtsp,rtp,mov,mpegts,hls,aac
  --enable-muxer=rtsp,rtp,mpegts,mov,mp4,ipod,adts,framehash,framemd5,null
  --enable-decoder=h264,hevc,aac,pcm_s16le,pcm_u8,pcm_alaw,pcm_mulaw,rawvideo,wrapped_avframe
  --enable-encoder=libx264,aac,pcm_s16le,rawvideo,wrapped_avframe
  --enable-parser=h264,hevc,aac
  --enable-bsf=h264_mp4toannexb,hevc_mp4toannexb,aac_adtstoasc,extract_extradata,null,dump_extra
  --enable-filter=anullsrc,testsrc2,testsrc,color,scale,fps,format,setsar,setpts,aresample,aformat,anull,null,showinfo
  --pkg-config-flags=--static --extra-cflags="-I$PREFIX/include"
  --extra-ldflags="-L$PREFIX/lib" --extra-version=mindvision-source-build-1
)
if [[ "$RUNNER_OS" == Windows ]]; then
  X264_FLAGS+=(--host=x86_64-w64-mingw32)
  FFMPEG_FLAGS+=(--target-os=mingw32 --arch=x86_64 --cc=gcc --cxx=g++ --extra-ldflags=-static)
  JOBS=4
else
  ARCH="$(uname -m)"
  X264_FLAGS+=(--extra-cflags=-mmacosx-version-min=12.0 --extra-ldflags=-mmacosx-version-min=12.0)
  FFMPEG_FLAGS+=(--target-os=darwin --arch="$ARCH" --cc=clang --cxx=clang++ --extra-cflags=-mmacosx-version-min=12.0 --extra-ldflags=-mmacosx-version-min=12.0)
  JOBS="$(sysctl -n hw.ncpu)"
fi
printf '%s\n' "${X264_FLAGS[@]}" > "$WORK_ROOT/x264-configure-arguments.txt"
printf '%s\n' "${FFMPEG_FLAGS[@]}" > "$WORK_ROOT/ffmpeg-configure-arguments.txt"
(
  cd "$WORK_ROOT/x264"
  ./configure "${X264_FLAGS[@]}"
  make -j"$JOBS"
  make install
)
(
  cd "$WORK_ROOT/ffmpeg"
  ./configure "${FFMPEG_FLAGS[@]}"
  make -j"$JOBS"
  make install
)
if [[ "$RUNNER_OS" == macOS ]]; then
  /usr/bin/codesign --force --sign - "$PREFIX/bin/ffmpeg"
fi
python3 "$SCRIPT_DIR/smoke.py" "$WORK_ROOT" "${MTX_BUILD_LABEL:?}"
python3 "$SCRIPT_DIR/package.py" "$WORK_ROOT" "$MTX_BUILD_LABEL"
