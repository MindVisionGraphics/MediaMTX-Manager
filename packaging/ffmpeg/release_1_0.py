"""Promote tested packages with version-only changes; retain native media bytes."""
import json
import os
import pathlib
import plistlib
import subprocess
import sys
import urllib.request
import zipfile
from release_api import api, headers, opener, download, digest
from app_smoke import check_manager

REPO = pathlib.Path(__file__).resolve().parents[2]
WORK = pathlib.Path(os.environ['RUNNER_TEMP']) / 'release-1.0.0'
WORK.mkdir(exist_ok=True)
TAG = 'v1.0.0'
SOURCE = 'MediaMTX-Manager-FFmpeg-Corresponding-Sources.zip'
BODY = '''# MediaMTX Manager 1.0.0

The first regular release for Windows and macOS, with a Windows browser-only package.
**No CMD, PowerShell, Terminal, sudo or manual package installation required.**

## Downloads
- Windows desktop: open **MediaMTX-Manager-1.0.0-Windows-Setup.exe**.
- Windows web only: extract the complete **Windows-Web-x64.zip** and open Start Manager.vbs.
- Mac: choose **Intel** or **Apple-Silicon**, open the DMG and drag the app to Applications. ZIP alternatives are also available. Minimum macOS 12.0.
- SHA256SUMS.txt verifies all files. The separate FFmpeg-Corresponding-Sources ZIP supplies the exact FFmpeg/x264 sources, build records and license material. GitHub's automatic source archives are developer files, not installable apps.

## What's changed
The release version is now 1.0.0 in About, Windows setup/installed-app metadata, and Mac bundle metadata. Release labels and download names no longer say Preview. Camera, recording, media binaries and saved-data locations are unchanged from the tested builds.

To update Windows, stop recordings, Quit manager and close its window, then run setup using the same application folder; leave portable import blank. On Mac, quit the app and replace it in Applications.

## Features
Local camera dashboard, per-camera pause/resume, Tapo and compatible RTSP setup, recording timers and MP4 playback, schedules, optional automatic cleanup/storage limits, encrypted settings backup/restore, experimental forwarding, Help and About.

## Testing and platform notes
Owner tests passed Windows installation, update, uninstall/reinstall, saved cameras/settings/recording preservation, desktop and browser launch, Tapo playback/pause/resume/recording, and same-window Quit/Start. Owner Intel Mac Monterey 12.1 tests passed camera viewing, recording/playback, pause/resume and Quit/Start.

Native FFmpeg and packaged backend streaming, MP4 recording and Quit/Start tests passed on Windows x64, Intel Mac and Apple Silicon Mac runners. This version repeats the packaged backend checks after the version metadata changes. Apple Silicon interactive desktop testing and Mac Keychain/update/removal lifecycle checks remain unconfirmed. Windows is x64; native Windows ARM is not supplied. Third-party forwarding destinations remain experimental.

Apps are unsigned; Mac apps are not notarized, so OS security prompts can appear. A regular release does not remove those prompts. Report problems through Issues without camera credentials.

The MindVision public printing Watch page is a separate custom website integration, not a public Watch page included with the general manager. Manager-authored code is MIT; bundled components retain their licenses. The Mac About screen still has its hidden Easter egg.
'''

def release():
    result = next((r for r in api('/releases') if r['tag_name'] == TAG), None)
    assert result and result['draft'], 'Only work on the intended draft'
    return result

def upload(file):
    r = release()
    assert not any(a['name'] == file.name for a in r['assets']), 'Never replace completed release assets'
    h = headers()
    h.update({'Content-Type': 'application/octet-stream', 'Content-Length': str(file.stat().st_size)})
    with file.open('rb') as stream:
        result = json.load(opener.open(urllib.request.Request(r['upload_url'].split('{')[0] + '?name=' + file.name,
            data=stream, headers=h, method='POST'), timeout=120))
    assert result['digest'] == 'sha256:' + digest(file)
    print('Verified upload: ' + file.name, flush=True)

def base(tag, name, expected):
    r = api('/releases/tags/' + tag)
    asset = next(a for a in r['assets'] if a['name'] == name)
    assert asset['digest'] == 'sha256:' + expected
    file = WORK / name
    download(asset['url'], file, expected)
    return file

def patch(original, output, prefix, mac=False, uninstall=None):
    changed = {prefix + 'dist/app.js': (REPO / 'dist/app.js').read_bytes(),
               prefix + 'README.md': (REPO / 'README.md').read_bytes()}
    text = ('MediaMTX Manager 1.0.0\n\nNo command-line or manual package installation required.\n'
        'Windows: run setup, or extract the browser-only ZIP and open Start Manager.vbs.\n'
        'Mac: choose the correct processor build and move the app into Applications. macOS 12.0+.\n'
        'Quit manager and close its window before updating. Installed settings and recordings\n'
        'are kept separately. Leave portable import blank when updating an installed Windows app.\n'
        'Apps are unsigned; Mac apps are not notarized. Testing details and matching sources:\n'
        'https://github.com/MindVisionGraphics/MediaMTX-Manager/releases/tag/v1.0.0\n').encode()
    if uninstall:
        changed['Uninstall.exe'] = uninstall.read_bytes()
    with zipfile.ZipFile(str(original)) as old, zipfile.ZipFile(str(output), 'w', zipfile.ZIP_DEFLATED) as new:
        for entry in old.infolist():
            name = entry.filename
            assert '/data/' not in '/' + name
            data = old.read(entry)
            if name in changed:
                data = changed.pop(name)
            elif name.endswith('/app/package.json'):
                info = json.loads(data); info['version'] = '1.0.0'; data = json.dumps(info).encode()
            elif mac and name == 'MediaMTX Manager.app/Contents/Info.plist':
                info = plistlib.loads(data); info['CFBundleShortVersionString'] = '1.0.0'
                info['CFBundleVersion'] = '2026.10.26'; info['LSMinimumSystemVersion'] = '12.0'
                data = plistlib.dumps(info)
            elif name.endswith('runtime/ffmpeg/SOURCE.txt'):
                data = data.replace(b'/v0.9.0-preview.1/', b'/v1.0.0/')
            elif name in ['WINDOWS INSTALLER - READ FIRST.txt', 'MAC TEST CHECKLIST.txt', 'README FIRST.txt']:
                data = text
            elif mac and name == 'MONTEREY COMPATIBILITY.md':
                data = (REPO / 'packaging/MONTEREY-DOCUMENTED-FFMPEG.md').read_bytes()
            new.writestr(entry, data)
        for name, data in changed.items():
            new.writestr(name, data)
    with zipfile.ZipFile(str(original)) as old, zipfile.ZipFile(str(output)) as new:
        assert new.testzip() is None
        assert len(new.namelist()) == len(set(new.namelist()))
        for name in old.namelist():
            if name.startswith(prefix + 'runtime/') and not name.endswith('/SOURCE.txt'):
                assert old.getinfo(name).CRC == new.getinfo(name).CRC, 'Changed native runtime: ' + name
        assert b'<dd>1.0.0</dd>' in new.read(prefix + 'dist/app.js')

mode = sys.argv[1]
if mode == 'prepare':
    assert not any(r['tag_name'] == TAG for r in api('/releases')), 'Release already exists'
    api('/releases', {'tag_name': TAG, 'target_commitish': 'main', 'name': 'MediaMTX Manager 1.0.0',
        'body': BODY, 'draft': True, 'prerelease': False})
    source = base('v0.9.0-preview.1', SOURCE, '4ceec3ed25d7e325e1ac8f97e0703d32e05e617b3f258ee2f9e3d96544f21ed9')
    upload(source)
elif mode == 'windows':
    original = base('v0.9.1-preview.1', 'MediaMTX-Manager-Windows-Setup-0.9.1-Preview.exe',
        'd98a8c83e8a3859fa0713939b50a2d73f27e60ea7b099d94f33ddae9474e2f7a')
    csc = pathlib.Path(os.environ['WINDIR']) / 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
    helper = WORK / 'ReadPayload.cs'
    helper.write_text('''using System;using System.IO;using System.Reflection;
class R{static void Main(string[]a){var x=Assembly.ReflectionOnlyLoadFrom(Path.GetFullPath(a[0]));
using(var s=x.GetManifestResourceStream("payload.zip"))using(var f=File.Create(a[1])){s.CopyTo(f);}}}''')
    subprocess.run([str(csc), '/nologo', '/out:' + str(WORK / 'ReadPayload.exe'), str(helper)], check=True)
    payload = WORK / 'old.zip'
    subprocess.run([str(WORK / 'ReadPayload.exe'), str(original), str(payload)], check=True)
    flags = [str(csc), '/nologo', '/target:winexe', '/platform:x64',
        '/win32icon:' + str(REPO / 'packaging/app.ico'), '/win32manifest:' + str(REPO / 'packaging/app.manifest')]
    flags += ['/reference:' + r for r in ['System.Windows.Forms.dll', 'System.Drawing.dll',
        'System.IO.Compression.dll', 'System.IO.Compression.FileSystem.dll', 'Microsoft.CSharp.dll', 'System.Web.Extensions.dll']]
    uninstall = WORK / 'Uninstall.exe'
    subprocess.run(flags + ['/define:UNINSTALL', '/out:' + str(uninstall), str(REPO / 'packaging/Setup.cs')], check=True)
    patched = WORK / 'new.zip'
    patch(payload, patched, 'resources/manager/', uninstall=uninstall)
    installed = WORK / 'app'
    with zipfile.ZipFile(str(patched)) as z: z.extractall(str(installed))
    results = check_manager(installed / 'resources/manager', WORK / 'test-data', True)
    (WORK / 'checks.json').write_text(json.dumps(results, indent=2))
    setup = WORK / 'MediaMTX-Manager-1.0.0-Windows-Setup.exe'
    subprocess.run(flags + ['/out:' + str(setup), '/resource:' + str(patched) + ',payload.zip', str(REPO / 'packaging/Setup.cs')], check=True)
    webbase = base('v0.9.0-preview.1', 'MediaMTX-Manager-Windows-Web-x64-Source-Build-Preview.zip',
        'c9de9ef15a8a8ca5f845209a210eebd06060e48560b3a603d08b39d9cfab346d')
    with zipfile.ZipFile(str(webbase)) as z: prefix = next(n[:-len('server.mjs')] for n in z.namelist() if n.endswith('server.mjs'))
    web = WORK / 'MediaMTX-Manager-1.0.0-Windows-Web-x64.zip'
    patch(webbase, web, prefix)
    upload(setup); upload(web)
elif mode in ('Intel', 'Apple-Silicon'):
    hashes = {'Intel': 'e65d3effe25d72fe0c726afd936654538485748f9f84a7819616c6b79d9464d2',
              'Apple-Silicon': '5074292280ed10a873372b30722f9bc05655bd222ede1b63247f8eb4d14980e4'}
    original = base('v0.9.0-preview.1', 'MediaMTX-Manager-macOS-12-' + mode + '-Source-Build-Preview.zip', hashes[mode])
    output = WORK / ('MediaMTX-Manager-1.0.0-macOS-' + mode + '.zip')
    prefix = 'MediaMTX Manager.app/Contents/Resources/manager/'
    patch(original, output, prefix, mac=True)
    stage = WORK / 'disk-image'; stage.mkdir()
    subprocess.run(['/usr/bin/ditto', '-x', '-k', str(output), str(stage)], check=True)
    results = check_manager(stage / prefix, WORK / 'test-data', False)
    (WORK / 'checks.json').write_text(json.dumps(results, indent=2))
    (stage / 'Applications').symlink_to('/Applications', target_is_directory=True)
    dmg = WORK / ('MediaMTX-Manager-1.0.0-macOS-' + mode + '.dmg')
    subprocess.run(['hdiutil', 'create', '-volname', 'MediaMTX Manager', '-srcfolder', str(stage), '-ov', '-format', 'UDZO', str(dmg)], check=True)
    upload(output); upload(dmg)
elif mode == 'finish':
    r = release()
    expected = {SOURCE, 'MediaMTX-Manager-1.0.0-Windows-Setup.exe', 'MediaMTX-Manager-1.0.0-Windows-Web-x64.zip'}
    expected |= {'MediaMTX-Manager-1.0.0-macOS-' + arch + '.' + ext for arch in ['Intel', 'Apple-Silicon'] for ext in ['zip', 'dmg']}
    assert {a['name'] for a in r['assets']} == expected
    assert all(a['state'] == 'uploaded' and a.get('digest', '').startswith('sha256:') for a in r['assets'])
    sums = WORK / 'SHA256SUMS.txt'
    sums.write_text(''.join(a['digest'].split(':', 1)[1] + '  ' + a['name'] + '\n' for a in sorted(r['assets'], key=lambda a: a['name'])))
    upload(sums)
    result = api('/releases/' + str(r['id']), {'draft': False, 'prerelease': False, 'make_latest': 'true'}, method='PATCH')
    assert not result['draft'] and not result['prerelease']
    print('Published regular release: ' + result['html_url'], flush=True)
else:
    raise ValueError('Unknown release phase')
