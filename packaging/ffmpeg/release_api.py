"""Repository-scoped release/artifact I/O. Never forward auth to storage redirects."""
import hashlib
import json
import os
import pathlib
import urllib.parse
import urllib.request

REPOSITORY = 'MindVisionGraphics/MediaMTX-Manager'
BASE = 'https://api.github.com/repos/' + REPOSITORY


class StorageRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        request = super().redirect_request(req, fp, code, msg, headers, newurl)
        if request and urllib.parse.urlparse(req.full_url).netloc != urllib.parse.urlparse(newurl).netloc:
            request.remove_header('Authorization')
        return request


opener = urllib.request.build_opener(StorageRedirect())


def headers():
    return {'Authorization': 'Bearer ' + os.environ['GITHUB_TOKEN'],
        'Accept': 'application/vnd.github+json', 'User-Agent': 'MediaMTX-Manager-packaging',
        'Cache-Control': 'no-cache'}


def api(path, body=None, method=None):
    h = headers()
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        h['Content-Type'] = 'application/json'
    response = opener.open(urllib.request.Request(BASE + path, data=data, headers=h, method=method), timeout=120)
    payload = response.read()
    return json.loads(payload) if payload else None


def digest(path):
    h = hashlib.sha256()
    with pathlib.Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def download(url, path, expected):
    path = pathlib.Path(path)
    h = headers()
    if '/releases/assets/' in url:
        h['Accept'] = 'application/octet-stream'
    with opener.open(urllib.request.Request(url, headers=h), timeout=120) as response, path.open('wb') as output:
        while True:
            block = response.read(1024 * 1024)
            if not block:
                break
            output.write(block)
    assert digest(path) == expected.lower().replace('sha256:', '', 1), 'Download digest mismatch'


def draft():
    release = next(r for r in api('/releases') if r['tag_name'] == 'v0.9.0-preview.1')
    assert release['draft'], 'Packaging may only modify the private draft'
    return release


def upload(path):
    path = pathlib.Path(path)
    release = draft()
    expected = 'sha256:' + digest(path)
    previous = next((a for a in release['assets'] if a['name'] == path.name), None)
    if previous:
        if previous.get('digest') == expected and previous['state'] == 'uploaded':
            print('Already verified in draft: ' + path.name, flush=True)
            return
        # These are generated preview assets, with their source and local copies retained.
        assert 'Source-Build' in path.name or 'Corresponding-Sources' in path.name
        api('/releases/assets/' + str(previous['id']), method='DELETE')
    h = headers()
    h.update({'Content-Type': 'application/octet-stream', 'Content-Length': str(path.stat().st_size)})
    with path.open('rb') as stream:
        request = urllib.request.Request(release['upload_url'].split('{')[0] + '?name=' + urllib.parse.quote(path.name),
            data=stream, headers=h, method='POST')
        result = json.load(opener.open(request, timeout=120))
    assert result['digest'] == expected and result['size'] == path.stat().st_size
    print('Verified draft upload: ' + path.name, flush=True)
