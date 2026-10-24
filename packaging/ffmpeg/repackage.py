"""Replace only owned app staging packages with verified source-built FFmpeg."""
import json
import os
import pathlib
import plistlib
import shutil
import stat
import subprocess
import sys
import zipfile

from app_smoke import check_manager
from release_api import api, digest, download, draft, upload

SCRIPT = pathlib.Path(__file__).resolve().parent
REPO = SCRIPT.parents[1]
WORK = pathlib.Path(os.environ['RUNNER_TEMP']).resolve() / 'manager-repackage'
WORK.mkdir(exist_ok=True)
LABEL = sys.argv[1]
RUN = int(sys.argv[2])
WINDOWS = LABEL == 'windows-x64'
COMPONENT = WORK / 'component'
COMPONENT.mkdir(exist_ok=True)


def extract(archive, destination):
    destination = pathlib.Path(destination).resolve()
    destination.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(str(archive)) as z:
        for entry in z.infolist():
            target = (destination / entry.filename).resolve()
            assert target == destination or destination in target.parents, 'Unsafe ZIP path'
        z.extractall(str(destination))


artifacts = api('/actions/runs/' + str(RUN) + '/artifacts')['artifacts']
artifact = next(a for a in artifacts if a['name'] == 'documented-ffmpeg-' + LABEL)
assert not artifact['expired']
component_zip = WORK / 'component.zip'
download(artifact['archive_download_url'], component_zip, artifact['digest'])
extract(component_zip, COMPONENT)
report = json.loads((COMPONENT / 'build-report.json').read_text())
assert report['platform'] == LABEL
assert report['source'] == json.loads((SCRIPT / 'sources.json').read_text())
assert report['enabledExternalLibraries'] == ['libx264']
component_exe = COMPONENT / ('ffmpeg.exe' if WINDOWS else 'ffmpeg')
assert digest(component_exe) == report['sha256']
assert 'RTSP camera-style receive/decode' in report['nativeSmokeTests']['passed']

SOURCE_ASSET = 'MediaMTX-Manager-FFmpeg-Corresponding-Sources.zip'
source_notice = ('''FFmpeg 9.0.2 with libx264 — controlled source build

This executable is a separate GPL-covered program. MediaMTX Manager remains MIT.
The exact FFmpeg/x264 source archives, license texts, configure records and build
instructions are provided alongside app downloads at:
https://github.com/MindVisionGraphics/MediaMTX-Manager/releases/download/v0.9.0-preview.1/''' + SOURCE_ASSET + '''

Build recipe: https://github.com/MindVisionGraphics/MediaMTX-Manager/tree/main/packaging/ffmpeg
The bundled build-report.json identifies the binary hash and source revisions.
No changes to the original FFmpeg or x264 source trees are applied.
''').encode()
notices = ('''# Included components

- MediaMTX: Windows 1.21.2 / macOS 1.21.1, MIT; original runtime notices retained.
- Node.js: Windows 24.19.0 / macOS 22.23.4; runtime license retained.
- Electron desktop: Windows 45.0.0 / macOS 43.8.3, MIT and Chromium notices retained.
- hls.js 1.6.16, Apache-2.0; dist/vendor license retained.
- FFmpeg 9.0.2 and libx264: controlled source build, distributed under GPLv3;
  both projects' license texts are under runtime/ffmpeg/licenses. Corresponding
  source/build records are linked in runtime/ffmpeg/SOURCE.txt and alongside release downloads.

Manager-authored code is MIT. Components retain their own copyright and licenses.
Independent project; not affiliated with MediaMTX or TP-Link.
''').encode()


def ffmpeg_files():
    files = {'ffmpeg.exe' if WINDOWS else 'ffmpeg': component_exe.read_bytes(),
        'SOURCE.txt': source_notice, 'VERSION.txt': (COMPONENT / 'VERSION.txt').read_bytes(),
        'build-report.json': (COMPONENT / 'build-report.json').read_bytes()}
    for file in (COMPONENT / 'licenses').rglob('*'):
        if file.is_file():
            files['licenses/' + file.relative_to(COMPONENT / 'licenses').as_posix()] = file.read_bytes()
    return files


def source_files():
    files = {}
    for file in REPO.iterdir():
        if file.is_file() and file.suffix in ('.mjs', '.cjs', '.md', '.txt', '.vbs'):
            if WINDOWS or file.suffix != '.vbs':
                files[file.name] = file.read_bytes()
    files['LICENSE'] = (REPO / 'LICENSE').read_bytes()
    files['THIRD-PARTY-NOTICES.md'] = notices
    for file in (REPO / 'dist').rglob('*'):
        if file.is_file():
            files['dist/' + file.relative_to(REPO / 'dist').as_posix()] = file.read_bytes()
    files['dist/about-notices.txt'] = notices
    for name, content in ffmpeg_files().items():
        files['runtime/ffmpeg/' + name] = content
    return files


def put(z, name, content, executable=False):
    item = zipfile.ZipInfo(name)
    item.create_system = 3
    item.external_attr = (stat.S_IFREG | (0o755 if executable else 0o644)) << 16
    item.compress_type = zipfile.ZIP_DEFLATED
    z.writestr(item, content)


def base_asset(name, expected):
    asset = next(a for a in draft()['assets'] if a['name'] == name)
    assert asset['digest'] == 'sha256:' + expected
    file = WORK / name
    download(asset['url'], file, expected)
    return file


def patch_zip(original, output, manager_prefix, mac=False):
    replacements = {manager_prefix + name: content for name, content in source_files().items()}
    with zipfile.ZipFile(str(original)) as old, zipfile.ZipFile(str(output), 'w', zipfile.ZIP_DEFLATED) as new:
        for entry in old.infolist():
            path = entry.filename
            if path in replacements or path.startswith(manager_prefix + 'runtime/ffmpeg/') or path.startswith(manager_prefix + 'runtime/licenses/ffmpeg-mac/'):
                continue
            assert '/data/' not in '/' + path, 'Private data must not enter an app package'
            content = old.read(entry)
            if mac and path == 'MediaMTX Manager.app/Contents/Info.plist':
                info = plistlib.loads(content)
                info['LSMinimumSystemVersion'] = '12.0'
                info['CFBundleVersion'] = '2026.10.24'
                content = plistlib.dumps(info)
            elif mac and path == 'MONTEREY COMPATIBILITY.json':
                info = json.loads(content)
                info['runtimeVersions']['ffmpeg'] = '9.0.2 controlled source build'
                info['controlledFFmpeg'] = report
                info['archiveSHA256'] = {k: v for k, v in info.get('archiveSHA256', {}).items() if not k.startswith('ffmpeg-')}
                for binary in info['binaries']:
                    if binary['path'].endswith('/runtime/ffmpeg/ffmpeg'):
                        sys.path.insert(0, str(SCRIPT.parent))
                        from macho_compat import inspect
                        binary.update(inspect(component_exe.read_bytes())[0])
                content = json.dumps(info, indent=2).encode()
            elif mac and path == 'MONTEREY COMPATIBILITY.md':
                content = (SCRIPT.parent / 'MONTEREY-DOCUMENTED-FFMPEG.md').read_bytes()
            elif mac and path == 'MAC TEST CHECKLIST.txt':
                content = b'MACOS MONTEREY PREVIEW\n\nRequires macOS 12.0 or later. Extract on macOS and move the app to Applications.\nNo Terminal or manual package installation is intended. App is unsigned/not notarized.\n\nThis preview replaces FFmpeg with the documented source build. Its native media tests\npassed on current Mac runners. Recheck sample playback and forwarding on Monterey 12.1.\nThe original Intel app passed owner launch/camera/recording/playback/pause-resume/Quit-Start\ntests with the previous FFmpeg. Those are distinct from acceptance of this replacement.\n\nMatching source and build records are supplied beside release downloads; see runtime/ffmpeg/SOURCE.txt.\n'
            new.writestr(entry, content)
        for path, content in replacements.items():
            put(new, path, content, path.endswith('/ffmpeg/ffmpeg'))
    with zipfile.ZipFile(str(output)) as z:
        assert z.testzip() is None
        assert len(z.namelist()) == len(set(z.namelist()))


def zip_tree(root, output):
    with zipfile.ZipFile(str(output), 'w', zipfile.ZIP_DEFLATED) as z:
        for file in root.rglob('*'):
            if file.is_file():
                z.write(str(file), file.relative_to(root).as_posix())


if WINDOWS:
    original = base_asset('MediaMTX-Manager-Windows-Setup.exe', '1dafc376b9cf09eb0f5034888aa8482056d0206901c09d5ea75fdc1061707af1')
    csc = pathlib.Path(os.environ['WINDIR']) / 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
    helper = WORK / 'ExtractPayload.cs'
    helper.write_text('''using System; using System.IO; using System.Reflection;
class ExtractPayload { static void Main(string[] args) {
var a=Assembly.ReflectionOnlyLoadFrom(Path.GetFullPath(args[0]));
using(var input=a.GetManifestResourceStream("payload.zip"))
using(var output=File.Create(args[1])) { if(input==null)throw new Exception("Missing payload");input.CopyTo(output); }
}}''')
    helper_exe = WORK / 'ExtractPayload.exe'
    subprocess.run([str(csc), '/nologo', '/target:exe', '/out:' + str(helper_exe), str(helper)], check=True)
    payload = WORK / 'payload-original.zip'
    subprocess.run([str(helper_exe), str(original), str(payload)], check=True)
    patched_payload = WORK / 'payload-source.zip'
    patch_zip(payload, patched_payload, 'resources/manager/')
    installed = WORK / 'installed'
    extract(patched_payload, installed)
    result = check_manager(installed / 'resources/manager', WORK / 'manager-test-data', True)
    (WORK / 'app-smoke-results.json').write_text(json.dumps(result, indent=2))
    setup = WORK / 'MediaMTX-Manager-Windows-Setup-Source-Build-Preview.exe'
    args = [str(csc), '/nologo', '/target:winexe', '/platform:x64', '/out:' + str(setup),
        '/win32icon:' + str(REPO / 'packaging/app.ico'), '/win32manifest:' + str(REPO / 'packaging/app.manifest'),
        '/resource:' + str(patched_payload) + ',payload.zip']
    for reference in ['System.Windows.Forms.dll', 'System.Drawing.dll', 'System.IO.Compression.dll',
                      'System.IO.Compression.FileSystem.dll', 'Microsoft.CSharp.dll', 'System.Web.Extensions.dll']:
        args.append('/reference:' + reference)
    args.append(str(REPO / 'packaging/Setup.cs'))
    subprocess.run(args, check=True)
    web_base = base_asset('MediaMTX-Manager-Windows-Web-x64.zip', 'c0d2a6a46bccd8aa89961d2d4e376e2bdc377f50f1e635c3260dc53b84745ed5')
    with zipfile.ZipFile(str(web_base)) as z:
        prefix = next(n[:-len('server.mjs')] for n in z.namelist() if n.endswith('server.mjs'))
    web = WORK / 'MediaMTX-Manager-Windows-Web-x64-Source-Build-Preview.zip'
    patch_zip(web_base, web, prefix)
    upload(setup)
    upload(web)
else:
    arch = 'Intel' if LABEL == 'macos-x64' else 'Apple-Silicon'
    expected = {'Intel': '58d7d05db5ffdbb697ac09cc45b74402c87722e3db1c3c13c241b15d40bbdc3f',
        'Apple-Silicon': 'b504635d927ba4099ca5c29ca6940fcd3d4e6dcac563f24b3838a430664be035'}
    original = base_asset('MediaMTX-Manager-macOS-12-' + arch + '-Preview.zip', expected[arch])
    output = WORK / ('MediaMTX-Manager-macOS-12-' + arch + '-Source-Build-Preview.zip')
    prefix = 'MediaMTX Manager.app/Contents/Resources/manager/'
    patch_zip(original, output, prefix, mac=True)
    stage = WORK / 'disk-image'
    stage.mkdir(exist_ok=True)
    subprocess.run(['/usr/bin/ditto', '-x', '-k', str(output), str(stage)], check=True)
    manager = stage / prefix
    result = check_manager(manager, WORK / 'manager-test-data', False)
    (WORK / 'app-smoke-results.json').write_text(json.dumps(result, indent=2))
    (stage / 'Applications').symlink_to('/Applications', target_is_directory=True)
    dmg = WORK / ('MediaMTX-Manager-macOS-12-' + arch + '-Source-Build-Preview.dmg')
    subprocess.run(['hdiutil', 'create', '-volname', 'MediaMTX Manager', '-srcfolder', str(stage),
        '-ov', '-format', 'UDZO', str(dmg)], check=True)
    upload(output)
    upload(dmg)
print('Source-built app packages are staged privately; public release was not published.', flush=True)
