"""Collect the exact source and platform build records beside private app assets."""
import io
import json
import os
import pathlib
import sys
import zipfile
from release_api import api, digest, download, upload

root = pathlib.Path(os.environ['RUNNER_TEMP']) / 'manager-source-bundle'
root.mkdir(exist_ok=True)
sources = json.loads((pathlib.Path(__file__).parent / 'sources.json').read_text())
output = root / 'MediaMTX-Manager-FFmpeg-Corresponding-Sources.zip'
seen = {}
with zipfile.ZipFile(str(output), 'w', zipfile.ZIP_DEFLATED) as target:
    for label, run in [('windows-x64', sys.argv[1]), ('macos-x64', sys.argv[2]), ('macos-arm64', sys.argv[2])]:
        artifacts = api('/actions/runs/' + run + '/artifacts')['artifacts']
        artifact = next(a for a in artifacts if a['name'] == 'documented-ffmpeg-' + label)
        assert not artifact['expired']
        archive = root / (label + '.zip')
        download(artifact['archive_download_url'], archive, artifact['digest'])
        with zipfile.ZipFile(str(archive)) as outer:
            report = json.loads(outer.read('build-report.json'))
            assert report['source'] == sources and report['platform'] == label
            assert report['enabledExternalLibraries'] == ['libx264']
            assert 'RTSP camera-style receive/decode' in report['nativeSmokeTests']['passed']
            with zipfile.ZipFile(io.BytesIO(outer.read('corresponding-source.zip'))) as inner:
                for name in inner.namelist():
                    content = inner.read(name)
                    if name in ('ffmpeg.tar.gz', 'x264.tar.gz'):
                        import hashlib
                        key = name.split('.')[0]
                        assert hashlib.sha256(content).hexdigest() == sources[key]['sha256']
                        if name in seen:
                            assert seen[name] == hashlib.sha256(content).hexdigest()
                            continue
                        seen[name] = hashlib.sha256(content).hexdigest()
                        target.writestr('source/' + name, content)
                    else:
                        target.writestr('platforms/' + label + '/' + name, content)
    target.writestr('README.txt', 'FFmpeg 9.0.2 and x264 corresponding source\n\n'
        'The source folder contains the two complete, unmodified upstream source archives.\n'
        'Each platform folder contains its actual recipe, configure/build records, compiler\n'
        'identity, license notices and test results. Follow recipe/BUILDING.md using the\n'
        'source archives in the source folder. No source patches were applied.\n'
        'The build reports identify the exact executable hashes in the app packages.\n'
        'This bundle covers the separate GPL-covered FFmpeg executable; the manager is MIT.\n')
assert len(seen) == 2
with zipfile.ZipFile(str(output)) as check:
    assert check.testzip() is None
upload(output)
print('Verified complete source bundle: ' + digest(output), flush=True)
