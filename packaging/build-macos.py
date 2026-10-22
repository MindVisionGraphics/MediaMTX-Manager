"""Build unsigned architecture-specific .app ZIPs while preserving Unix modes/symlinks."""
import hashlib
import io
import json
import pathlib
import plistlib
import stat
import struct
import tarfile
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'outputs' / 'mediamtx-manager'
WORK = ROOT / 'work'
APP = 'MediaMTX Manager.app/'
RESOURCE = APP + 'Contents/Resources/'

def digest(file):
    h = hashlib.sha256()
    with file.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()

def verify(file, manifest, basename):
    lines = manifest.read_text().splitlines()
    expected = next(line.split()[0] for line in lines if line.split()[-1].lstrip('*') == basename)
    if digest(file).lower() != expected.lower():
        raise ValueError('Checksum mismatch: ' + str(file))

def put(output, name, content, executable=False):
    info = zipfile.ZipInfo(name)
    info.create_system = 3
    info.external_attr = (stat.S_IFREG | (0o755 if executable else 0o644)) << 16
    info.compress_type = zipfile.ZIP_DEFLATED
    output.writestr(info, content)

def macho(content, arch):
    if content[:4] != b'\xcf\xfa\xed\xfe':
        raise ValueError('Expected a 64-bit Mach-O executable')
    cpu = struct.unpack('<I', content[4:8])[0]
    if cpu != (0x100000c if arch == 'arm64' else 0x1000007):
        raise ValueError('Incorrect CPU architecture')

def tar_binary(file, ending):
    with tarfile.open(str(file), 'r:gz') as archive:
        member = next(m for m in archive.getmembers() if m.isfile() and m.name.endswith(ending))
        return archive.extractfile(member).read()

for arch in ('arm64', 'x64'):
    electron = WORK / ('electron-mac-' + arch + '.zip')
    node = WORK / ('node-mac-' + arch + '.tar.gz')
    mediamtx = WORK / ('mediamtx-mac-' + arch + '.tar.gz')
    ffmpeg = WORK / ('ffmpeg-mac-' + arch + '.zip')
    verify(electron, WORK / 'electron-SHASUMS256.txt', 'electron-v45.0.0-darwin-' + arch + '.zip')
    verify(node, WORK / 'node-mac-SHASUMS256.txt', 'node-v24.19.0-darwin-' + arch + '.tar.gz')
    expected_mtx = {'arm64': '7d0d0c5c11527cbd10bde1c3d728864eb0334a9b653566cd73c0259750cbf093',
                    'x64': '87a00062b6a588aa1158f875504a3b56c80d62e2611dc450b83d0534e1b49198'}
    if digest(mediamtx) != expected_mtx[arch]:
        raise ValueError('MediaMTX checksum mismatch')
    binaries = {'node': tar_binary(node, '/bin/node'), 'mediamtx': tar_binary(mediamtx, 'mediamtx')}
    with zipfile.ZipFile(str(ffmpeg)) as archive:
        binaries['ffmpeg'] = archive.read(next(n for n in archive.namelist() if n.split('/')[-1] == 'ffmpeg' and '__MACOSX' not in n))
    for binary in binaries.values():
        macho(binary, arch)
    label = 'Apple-Silicon' if arch == 'arm64' else 'Intel'
    destination = ROOT / 'outputs' / ('MediaMTX-Manager-macOS-' + label + '-UNVERIFIED.zip')
    with zipfile.ZipFile(str(destination), 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as output:
        with zipfile.ZipFile(str(electron)) as archive:
            for item in archive.infolist():
                if not item.filename.startswith('Electron.app/') or '/_CodeSignature/' in item.filename or 'default_app.asar' in item.filename:
                    continue
                name = APP + item.filename[len('Electron.app/'):]
                content = archive.read(item.filename)
                if name == APP + 'Contents/Info.plist':
                    info = plistlib.loads(content)
                    info.update(CFBundleName='MediaMTX Manager', CFBundleDisplayName='MediaMTX Manager',
                                CFBundleIdentifier='com.mindvisiongraphics.mediamtxmanager',
                                CFBundleShortVersionString='0.9.0', CFBundleVersion='2026.10.22',
                                CFBundleIconFile='MediaMTXManager.icns')
                    content = plistlib.dumps(info)
                clone = zipfile.ZipInfo(name)
                clone.create_system = item.create_system
                clone.external_attr = item.external_attr
                clone.compress_type = zipfile.ZIP_DEFLATED
                output.writestr(clone, content)
        put(output, RESOURCE + 'MediaMTXManager.icns', (ROOT / 'outputs/installer-source/MediaMTXManager.icns').read_bytes())
        for file in SOURCE.iterdir():
            if file.suffix in ('.mjs', '.cjs', '.md', '.txt'):
                put(output, RESOURCE + 'manager/' + file.name, file.read_bytes())
        for file in (SOURCE / 'dist').rglob('*'):
            if file.is_file():
                put(output, RESOURCE + 'manager/dist/' + file.relative_to(SOURCE / 'dist').as_posix(), file.read_bytes())
        for component, content in binaries.items():
            rel = component if component == 'node' else component + '/' + component
            put(output, RESOURCE + 'manager/runtime/' + rel, content, True)
        put(output, RESOURCE + 'app/package.json', json.dumps({'name': 'mediamtx-manager', 'version': '0.9.0', 'main': 'main.cjs'}).encode())
        put(output, RESOURCE + 'app/main.cjs', (ROOT / 'outputs/installer-source/app-main.cjs').read_bytes())
        notes = ('UNVERIFIED MAC BUILD - ' + label + '\n\n'
                 'Prepared on Windows. Launch, camera playback, recording, Keychain, permission prompts,\n'
                 'signing and notarization have NOT been tested on macOS. This is not a public release.\n'
                 'Apple signing/notarization must be completed on a Mac before normal distribution.\n\n'
                 'Intended installation: unzip and move MediaMTX Manager.app into Applications.\n'
                 'No Terminal install is intended. Saved settings/recordings use Application Support,\n'
                 'separate from the app bundle. Windows DPAPI data cannot be copied directly to Mac;\n'
                 'use a portable encrypted settings backup, or enter camera credentials again.\n\n'
                 'Mac acceptance: app launches; one window on repeated open; sample plays/records;\n'
                 'Tapo camera connects; Keychain encrypt/decrypt survives relaunch; backup restores;\n'
                 'Quit/Start and website presets/counts work; recording files survive replacing the app.\n\n'
                 'Runtime provenance: Electron 45.0.0 and Node 24.19.0 SHA-256 verified against\n'
                 'official release manifests; MediaMTX 1.21.2 verified against GitHub asset digest.\n'
                 'FFmpeg binary from ' + ('osxexperts.net/ffmpeg9arm.zip' if arch == 'arm64' else 'evermeet.cx/ffmpeg/ffmpeg-9.0.2.zip') + '\n'
                 'FFmpeg architecture checked; upstream cryptographic verification not completed.\n'
                 'The FFmpeg license notices from the source archive and project are bundled.\n')
        put(output, 'MAC TEST CHECKLIST.txt', notes.encode())
        with zipfile.ZipFile(str(ffmpeg)) as archive:
            for item in archive.infolist():
                if not item.is_dir() and any(word in item.filename.lower() for word in ('license', 'copying', 'readme')):
                    put(output, RESOURCE + 'manager/runtime/licenses/ffmpeg-mac/' + pathlib.PurePosixPath(item.filename).name, archive.read(item))
        for file in (SOURCE / 'runtime/licenses').rglob('*'):
            if file.is_file():
                put(output, RESOURCE + 'manager/runtime/licenses/' + file.relative_to(SOURCE / 'runtime/licenses').as_posix(), file.read_bytes())
    with zipfile.ZipFile(str(destination)) as check:
        assert check.testzip() is None
        for executable in ('node', 'mediamtx/mediamtx', 'ffmpeg/ffmpeg'):
            assert (check.getinfo(RESOURCE + 'manager/runtime/' + executable).external_attr >> 16) & 0o111
    print('Prepared unsigned/unverified Mac bundle:', destination.name)
