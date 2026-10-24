"""Fetch and verify the two source trees used by the controlled FFmpeg build."""
import hashlib
import json
import pathlib
import subprocess
import sys
import tarfile
import urllib.request

root = pathlib.Path(sys.argv[1]).resolve()
manifest = json.loads(pathlib.Path(__file__).with_name('sources.json').read_text())
root.mkdir(parents=True, exist_ok=True)
for name, source in manifest.items():
    archive = root / (name + '.tar.gz')
    urllib.request.urlretrieve(source['url'], str(archive))
    actual = hashlib.sha256(archive.read_bytes()).hexdigest()
    if actual != source['sha256']:
        raise ValueError('Source SHA-256 mismatch: ' + name)
    with tarfile.open(str(archive), 'r:gz') as check:
        for member in check.getmembers():
            path = pathlib.PurePosixPath(member.name)
            if path.is_absolute() or '..' in path.parts:
                raise ValueError('Unsafe archive path')
    destination = root / name
    destination.mkdir(exist_ok=True)
    subprocess.run(['tar', '-xzf', str(archive), '--strip-components=1', '-C', str(destination)], check=True)
    print('Verified source: ' + name + ' ' + source['revision'], flush=True)
