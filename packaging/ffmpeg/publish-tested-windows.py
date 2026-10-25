"""Reassemble and verify the exact owner-tested installer; do not rebuild it."""
import hashlib
import json
import os
import pathlib
import urllib.request
import zipfile
from release_api import api, headers, opener, digest, download

work = pathlib.Path(os.environ['RUNNER_TEMP']) / 'tested-windows'
work.mkdir(exist_ok=True)
old = api('/releases/tags/v0.9.0-preview.1')
base_asset = next(a for a in old['assets'] if a['name'] == 'MediaMTX-Manager-Windows-Setup-Source-Build-Preview.exe')
base = work / 'base.exe'
with zipfile.ZipFile(str(pathlib.Path(__file__).with_name('windows-0.9.1-installer-delta.zip'))) as delta:
    plan = json.loads(delta.read('plan.json'))
    download(base_asset['url'], base, plan['baseSHA256'])
    output = work / 'MediaMTX-Manager-Windows-Setup-0.9.1-Preview.exe'
    with base.open('rb') as source, output.open('wb') as target:
        for part in plan['parts']:
            if 'literal' in part:
                target.write(delta.read(part['literal']))
            else:
                source.seek(part['offset'])
                data = source.read(part['length'])
                assert len(data) == part['length']
                target.write(data)
    assert digest(output) == plan['targetSHA256'], 'Exact owner-tested installer hash mismatch'
release = next(r for r in api('/releases') if r['tag_name'] == 'v0.9.1-preview.1')
assert release['draft'], 'Only finalize the intended draft'
for name, data in [(output.name, None), ('SHA256SUMS.txt', (digest(output) + '  ' + output.name + '\n').encode())]:
    previous = next((a for a in release['assets'] if a['name'] == name), None)
    if previous:
        assert previous['state'] != 'uploaded', 'Do not overwrite a completed asset'
        api('/releases/assets/' + str(previous['id']), method='DELETE')
    h = headers()
    h.update({'Content-Type': 'application/octet-stream', 'Content-Length': str(output.stat().st_size if data is None else len(data))})
    url = release['upload_url'].split('{')[0] + '?name=' + name
    if data is None:
        with output.open('rb') as stream:
            result = json.load(opener.open(urllib.request.Request(url, data=stream, headers=h, method='POST'), timeout=120))
        assert result['digest'] == 'sha256:' + plan['targetSHA256']
    else:
        result = json.load(opener.open(urllib.request.Request(url, data=data, headers=h, method='POST'), timeout=120))
        assert result['digest'] == 'sha256:' + hashlib.sha256(data).hexdigest()
    print('Verified upload: ' + name, flush=True)
result = api('/releases/' + str(release['id']), {'draft': False, 'prerelease': True, 'make_latest': 'false'}, method='PATCH')
assert not result['draft']
print('Published exact tested installer: ' + result['html_url'], flush=True)
