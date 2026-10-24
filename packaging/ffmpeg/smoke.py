"""Run the actual video/audio/RTSP paths required by MediaMTX Manager."""
import hashlib
import json
import os
import pathlib
import subprocess
import sys
import tarfile
import time
import urllib.request
import zipfile

root = pathlib.Path(sys.argv[1]).resolve()
label = sys.argv[2]
exe = root / 'prefix/bin' / ('ffmpeg.exe' if label == 'windows-x64' else 'ffmpeg')
test = root / 'smoke'
test.mkdir(exist_ok=True)

def run(args):
    subprocess.run([str(exe), '-hide_banner', '-loglevel', 'error', '-y'] + args, check=True, timeout=90)

sample = str(test / 'sample.mp4')
run(['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=15', '-f', 'lavfi', '-i',
     'anullsrc=channel_layout=stereo:sample_rate=48000', '-t', '2', '-c:v', 'libx264',
     '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', sample])
run(['-i', sample, '-f', 'null', '-'])
run(['-i', sample, '-vf', 'scale=320:180:force_original_aspect_ratio=decrease:force_divisible_by=2,fps=10,setsar=1,setpts=N/(10*TB)', '-an', '-c:v', 'libx264',
     '-preset', 'veryfast', '-tune', 'zerolatency', '-profile:v', 'baseline',
     '-level:v', '3.0', '-b:v', '120k', str(test / 'scaled.mp4')])

assets = {
    'windows-x64': ('windows_amd64.zip', 'faa97974861eb75a68b5aa326c78e7e7a6f670b5ef191bace78e715130381f23'),
    'macos-x64': ('darwin_amd64.tar.gz', 'be403a36d2225668ea695cbd2c784109bc23ef9a32f886837e43c920b6818813'),
    'macos-arm64': ('darwin_arm64.tar.gz', '25e20ed41611f1f3103b8359585210b29b11b69fa0d9e11bd11b92f7bbcb42ef'),
}
suffix, expected = assets[label]
archive = test / ('mediamtx.' + ('zip' if suffix.endswith('.zip') else 'tar.gz'))
urllib.request.urlretrieve('https://github.com/bluenviron/mediamtx/releases/download/v1.21.1/mediamtx_v1.21.1_' + suffix, str(archive))
assert hashlib.sha256(archive.read_bytes()).hexdigest() == expected
mtx = test / ('mediamtx.exe' if label == 'windows-x64' else 'mediamtx')
if suffix.endswith('.zip'):
    with zipfile.ZipFile(str(archive)) as z:
        mtx.write_bytes(z.read('mediamtx.exe'))
else:
    with tarfile.open(str(archive), 'r:gz') as t:
        member = next(m for m in t.getmembers() if m.isfile() and m.name.endswith('mediamtx'))
        mtx.write_bytes(t.extractfile(member).read())
    mtx.chmod(0o755)
config = test / 'mediamtx.json'
config.write_text(json.dumps({'logLevel': 'error', 'rtsp': True, 'rtspAddress': '127.0.0.1:18554',
    'rtspTransports': ['tcp'], 'hls': True, 'hlsAddress': '127.0.0.1:18888', 'hlsAlwaysRemux': True,
    'hlsVariant': 'mpegts', 'hlsSegmentDuration': '1s', 'hlsSegmentCount': 6,
    'rtmp': False, 'webrtc': False, 'srt': False, 'moq': False, 'paths': {'sample': {'source': 'publisher'}}}))
server = subprocess.Popen([str(mtx), str(config)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
publisher = None
try:
    time.sleep(2)
    assert server.poll() is None, 'MediaMTX did not start'
    publisher = subprocess.Popen([str(exe), '-hide_banner', '-loglevel', 'error', '-re', '-stream_loop', '-1',
        '-i', sample, '-c', 'copy', '-f', 'rtsp', '-rtsp_transport', 'tcp', 'rtsp://127.0.0.1:18554/sample'],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    playlist = None
    for _ in range(40):
        assert publisher.poll() is None, 'RTSP publisher stopped'
        try:
            playlist = urllib.request.urlopen('http://127.0.0.1:18888/sample/index.m3u8', timeout=2).read()
            if playlist.startswith(b'#EXTM3U'):
                break
        except Exception:
            pass
        time.sleep(0.5)
    assert playlist and playlist.startswith(b'#EXTM3U'), 'HLS playlist unavailable'
    run(['-rtsp_transport', 'tcp', '-i', 'rtsp://127.0.0.1:18554/sample', '-t', '2', '-f', 'null', '-'])
finally:
    for child in (publisher, server):
        if child is not None:
            child.terminate()
            try:
                child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()
result = {'platform': label, 'passed': ['H.264 sample encode', 'AAC silent audio encode', 'MP4 decode',
    'Data Saver scaling/preset', 'RTSP publish', 'MediaMTX HLS playlist', 'RTSP camera-style receive/decode'],
    'montereyExecutionTested': False}
(root / 'smoke-results.json').write_text(json.dumps(result, indent=2))
print('PASS: native ' + label + ' video/audio/RTSP/HLS smoke checks', flush=True)
