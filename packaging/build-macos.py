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
import argparse
from macho_compat import inspect

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--monterey', action='store_true', help='Build for macOS 12.0 or later')
args = parser.parse_args()
MONTEREY = args.monterey
ELECTRON_VERSION = '43.8.3' if MONTEREY else '45.0.0'
NODE_VERSION = '22.23.4' if MONTEREY else '24.19.0'
MTX_VERSION = '1.21.1' if MONTEREY else '1.21.2'

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
    electron = WORK / (('electron43' if MONTEREY else 'electron') + '-mac-' + arch + '.zip')
    node = WORK / (('node22' if MONTEREY else 'node') + '-mac-' + arch + '.tar.gz')
    mediamtx = WORK / (('mediamtx1211' if MONTEREY else 'mediamtx') + '-mac-' + arch + '.tar.gz')
    ffmpeg = WORK / ('ffmpeg-mac-' + arch + '.zip')
    verify(electron, WORK / ('electron43-SHASUMS256.txt' if MONTEREY else 'electron-SHASUMS256.txt'), 'electron-v' + ELECTRON_VERSION + '-darwin-' + arch + '.zip')
    verify(node, WORK / ('node22-SHASUMS256.txt' if MONTEREY else 'node-mac-SHASUMS256.txt'), 'node-v' + NODE_VERSION + '-darwin-' + arch + '.tar.gz')
    expected_mtx = {'arm64': '7d0d0c5c11527cbd10bde1c3d728864eb0334a9b653566cd73c0259750cbf093',
                    'x64': '87a00062b6a588aa1158f875504a3b56c80d62e2611dc450b83d0534e1b49198'}
    if MONTEREY:
        expected_mtx = {'arm64': '25e20ed41611f1f3103b8359585210b29b11b69fa0d9e11bd11b92f7bbcb42ef',
                        'x64': 'be403a36d2225668ea695cbd2c784109bc23ef9a32f886837e43c920b6818813'}
    if digest(mediamtx) != expected_mtx[arch]:
        raise ValueError('MediaMTX checksum mismatch')
    binaries = {'node': tar_binary(node, '/bin/node'), 'mediamtx': tar_binary(mediamtx, 'mediamtx')}
    with zipfile.ZipFile(str(ffmpeg)) as archive:
        binaries['ffmpeg'] = archive.read(next(n for n in archive.namelist() if n.split('/')[-1] == 'ffmpeg' and '__MACOSX' not in n))
    if MONTEREY and arch == 'arm64':
        if hashlib.sha256(binaries['ffmpeg']).hexdigest() != '591260c945d0eef150e3bf82b0ef988bd36a9cecc18ff05d6679617159f0a95e':
            raise ValueError('FFmpeg does not match the publisher SHA-256')
    for binary in binaries.values():
        macho(binary, arch)
    label = 'Apple-Silicon' if arch == 'arm64' else 'Intel'
    destination = ROOT / 'outputs' / ('MediaMTX-Manager-macOS-' + ('Monterey-12-' if MONTEREY else '') + label + '-UNVERIFIED.zip')
    with zipfile.ZipFile(str(destination), 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=3 if MONTEREY else 6) as output:
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
                                CFBundleShortVersionString='1.0.0', CFBundleVersion='2026.10.23' if MONTEREY else '2026.10.22',
                                CFBundleIconFile='MediaMTXManager.icns')
                    if MONTEREY:
                        info['LSMinimumSystemVersion'] = '12.0'
                        info['LSMinimumSystemVersionByArchitecture'] = {'x86_64': '12.0', 'arm64': '12.0'}
                    content = plistlib.dumps(info)
                clone = zipfile.ZipInfo(name)
                clone.create_system = item.create_system
                clone.external_attr = item.external_attr
                clone.compress_type = zipfile.ZIP_DEFLATED
                output.writestr(clone, content)
        put(output, RESOURCE + 'MediaMTXManager.icns', (ROOT / 'outputs/installer-source/MediaMTXManager.icns').read_bytes())
        for file in SOURCE.iterdir():
            if file.suffix in ('.mjs', '.cjs', '.md', '.txt'):
                content = file.read_bytes()
                if MONTEREY and file.name == 'THIRD-PARTY-NOTICES.md':
                    content = ('# Monterey test build components\n\n'
                               'Electron ' + ELECTRON_VERSION + ' (MIT and Chromium notices), Node.js ' + NODE_VERSION + ',\n'
                               'MediaMTX ' + MTX_VERSION + ' (MIT), and hls.js 1.6.16 (Apache-2.0).\n'
                               'Electron/Chromium notices are included in this app; Node/MediaMTX licenses are under runtime/licenses.\n'
                               'FFmpeg ' + ('9.0 from https://osxexperts.net/' if arch == 'arm64' else '9.0.2 from https://evermeet.cx/ffmpeg/') + '\n'
                               'includes GPL components. Its archive notices are under runtime/licenses/ffmpeg-mac when supplied.\n'
                               'See the root MONTEREY COMPATIBILITY.md and JSON for provenance and verification limits.\n'
                               'Manager code is independent of MediaMTX and TP-Link.\n').encode()
                put(output, RESOURCE + 'manager/' + file.name, content)
        for file in (SOURCE / 'dist').rglob('*'):
            if file.is_file():
                content = file.read_bytes()
                if MONTEREY and file.name == 'about-notices.txt':
                    content = output.read(RESOURCE + 'manager/THIRD-PARTY-NOTICES.md')
                put(output, RESOURCE + 'manager/dist/' + file.relative_to(SOURCE / 'dist').as_posix(), content)
        for component, content in binaries.items():
            rel = component if component == 'node' else component + '/' + component
            put(output, RESOURCE + 'manager/runtime/' + rel, content, True)
        put(output, RESOURCE + 'app/package.json', json.dumps({'name': 'mediamtx-manager', 'version': '1.0.0', 'main': 'main.cjs'}).encode())
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
                 'Runtime provenance: Electron ' + ELECTRON_VERSION + ' and Node ' + NODE_VERSION + ' SHA-256 verified against\n'
                 'official release manifests; MediaMTX ' + MTX_VERSION + ' verified against GitHub asset digest.\n'
                 'FFmpeg binary from ' + ('osxexperts.net/ffmpeg9arm.zip' if arch == 'arm64' else 'evermeet.cx/ffmpeg/ffmpeg-9.0.2.zip') + '\n'
                 'FFmpeg architecture checked; upstream cryptographic verification not completed.\n'
                 'The FFmpeg license notices from the source archive and project are bundled.\n')
        put(output, 'MAC TEST CHECKLIST.txt', notes.encode())
        with tarfile.open(str(mediamtx), 'r:gz') as archive:
            for item in archive.getmembers():
                if item.isfile() and pathlib.PurePosixPath(item.name).name.lower() in ('license', 'license.txt'):
                    put(output, RESOURCE + 'manager/runtime/licenses/MediaMTX-LICENSE.txt', archive.extractfile(item).read())
        with zipfile.ZipFile(str(ffmpeg)) as archive:
            for item in archive.infolist():
                if not item.is_dir() and any(word in item.filename.lower() for word in ('license', 'copying', 'readme')):
                    put(output, RESOURCE + 'manager/runtime/licenses/ffmpeg-mac/' + pathlib.PurePosixPath(item.filename).name, archive.read(item))
        for file in (SOURCE / 'runtime/licenses').rglob('*'):
            if file.is_file():
                content = (WORK / 'node22-LICENSE').read_bytes() if MONTEREY and file.name == 'Node-LICENSE.txt' else file.read_bytes()
                put(output, RESOURCE + 'manager/runtime/licenses/' + file.relative_to(SOURCE / 'runtime/licenses').as_posix(), content)
        if MONTEREY:
            report = {'minimumMacOS': '12.0', 'testTarget': '12.1', 'architecture': arch,
                      'runtimeVersions': {'electron': ELECTRON_VERSION, 'node': NODE_VERSION, 'mediamtx': MTX_VERSION},
                      'archiveSHA256': {p.name: digest(p) for p in (electron, node, mediamtx, ffmpeg)},
                      'binaries': [], 'macOSExecutionTested': False,
                      'apiAudit': 'See MONTEREY COMPATIBILITY.md. Static checks do not replace a Monterey runtime test.'}
            # Inspect all copied native code, not only the outer launcher.
            for item in list(output.infolist()):
                if item.is_dir() or item.file_size < 32:
                    continue
                with output.open(item) as stream:
                    magic = stream.read(4)
                if magic not in (b'\xcf\xfa\xed\xfe', b'\xce\xfa\xed\xfe', b'\xca\xfe\xba\xbe', b'\xca\xfe\xba\xbf'):
                    continue
                for binary in inspect(output.read(item)):
                    if binary['architecture'] != arch or not binary['minimum'] or binary['minimum'] > [12, 0, 0]:
                        raise ValueError('Monterey-incompatible binary: ' + item.filename + ' ' + str(binary))
                    for library in binary['libraries']:
                        if not library['path'].startswith(('/usr/lib/', '/System/Library/', '@rpath/', '@loader_path/', '@executable_path/')):
                            raise ValueError('Unexpected external dependency: ' + library['path'])
                    report['binaries'].append(dict(path=item.filename, **binary))
            put(output, 'MONTEREY COMPATIBILITY.json', json.dumps(report, indent=2).encode())
            put(output, 'MONTEREY COMPATIBILITY.md', (ROOT / 'outputs/installer-source/MONTEREY COMPATIBILITY.md').read_bytes())
    with zipfile.ZipFile(str(destination)) as check:
        assert check.testzip() is None
        for executable in ('node', 'mediamtx/mediamtx', 'ffmpeg/ffmpeg'):
            assert (check.getinfo(RESOURCE + 'manager/runtime/' + executable).external_attr >> 16) & 0o111
    print('Prepared unsigned/unverified Mac bundle:', destination.name)
