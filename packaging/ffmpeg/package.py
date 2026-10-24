"""Package the native executable and the sources/configuration actually used."""
import hashlib
import json
import pathlib
import re
import shutil
import subprocess
import sys
import zipfile

root = pathlib.Path(sys.argv[1]).resolve()
label = sys.argv[2]
script = pathlib.Path(__file__).resolve().parent
repo = script.parents[1]
out = repo / '.ffmpeg-artifacts' / label
out.mkdir(parents=True, exist_ok=True)
executable = root / 'prefix/bin' / ('ffmpeg.exe' if label == 'windows-x64' else 'ffmpeg')

def command(args):
    return subprocess.check_output(args, stderr=subprocess.STDOUT).decode('utf-8', 'replace')

config = (root / 'ffmpeg/config.h').read_text()
enabled_external = re.findall(r'^#define CONFIG_(LIB\w+) 1$', config, re.MULTILINE)
# HDR10 support is a feature of the same x264 library, not a second dependency.
assert 'LIBX264' in enabled_external
assert set(enabled_external) <= {'LIBX264', 'LIBX264_HDR10'}, enabled_external
version = command([str(executable), '-version'])
assert '--enable-nonfree' not in version
report = {'platform': label, 'source': json.loads((script / 'sources.json').read_text()),
    'sha256': hashlib.sha256(executable.read_bytes()).hexdigest(),
    'enabledExternalLibraries': ['libx264'], 'enabledLibraryConfigurationFlags': enabled_external,
    'nativeSmokeTests': json.loads((root / 'smoke-results.json').read_text()),
    'compiler': command(['gcc' if label == 'windows-x64' else 'clang', '--version']),
    'gitCommit': command(['git', '-C', str(repo), 'rev-parse', 'HEAD']).strip(),
    'patches': [], 'macOSMinimum': None}
if label.startswith('macos-'):
    sys.path.insert(0, str(script.parent))
    from macho_compat import inspect
    native = inspect(executable.read_bytes())
    assert len(native) == 1
    assert native[0]['minimum'] <= [12, 0, 0], native
    assert native[0]['architecture'] == ('arm64' if label.endswith('arm64') else 'x64')
    assert all(x['path'].startswith(('/usr/lib/', '/System/Library/')) for x in native[0]['libraries'])
    report['nativeDependencies'] = native
    report['macOSMinimum'] = '12.0'
    report['signing'] = 'Ad hoc signature only; not Developer ID signed or notarized'
else:
    imports = command(['objdump', '-p', str(executable)])
    dlls = re.findall(r'DLL Name:\s+(\S+)', imports)
    system = {'advapi32.dll', 'bcrypt.dll', 'crypt32.dll', 'gdi32.dll', 'kernel32.dll',
        'msvcrt.dll', 'ucrtbase.dll', 'ntdll.dll', 'ole32.dll', 'oleaut32.dll', 'shell32.dll',
        'shlwapi.dll', 'secur32.dll', 'user32.dll', 'version.dll', 'ws2_32.dll', 'winmm.dll',
        'avrt.dll', 'mf.dll', 'mfplat.dll', 'propsys.dll', 'dxva2.dll', 'd3d11.dll', 'dxgi.dll',
        'imm32.dll', 'dbghelp.dll', 'psapi.dll', 'cfgmgr32.dll', 'iphlpapi.dll', 'setupapi.dll'}
    assert all(x.lower() in system or x.lower().startswith('api-ms-win-') for x in dlls), dlls
    report['nativeDependencies'] = dlls
    report['compilerPackages'] = command(['pacman', '-Q'])

shutil.copy2(str(executable), str(out / executable.name))
(out / 'VERSION.txt').write_text(version)
(out / 'build-report.json').write_text(json.dumps(report, indent=2))
licenses = out / 'licenses'
licenses.mkdir(exist_ok=True)
for license_file in (root / 'ffmpeg').glob('COPYING*'):
    if license_file.is_file():
        shutil.copy2(str(license_file), str(licenses / ('FFmpeg-' + license_file.name)))
shutil.copy2(str(root / 'x264/COPYING'), str(licenses / 'x264-COPYING'))
runtime_licenses = pathlib.Path('/ucrt64/share/licenses')
if label == 'windows-x64' and runtime_licenses.exists():
    shutil.copytree(str(runtime_licenses), str(licenses / 'build-toolchain-notices'))

with zipfile.ZipFile(str(out / 'corresponding-source.zip'), 'w', zipfile.ZIP_DEFLATED) as archive:
    # Original verified archives contain the complete unmodified source trees.
    for name in ['ffmpeg.tar.gz', 'x264.tar.gz', 'x264-configure-arguments.txt',
                 'ffmpeg-configure-arguments.txt', 'smoke-results.json']:
        archive.write(str(root / name), name)
    for name in ['config.h', 'config.log', 'config.mak']:
        file = root / 'x264' / name
        if file.exists():
            archive.write(str(file), 'build-records/x264/' + name)
    for name in ['config.h', 'ffbuild/config.log', 'ffbuild/config.mak']:
        file = root / 'ffmpeg' / name
        if file.exists():
            archive.write(str(file), 'build-records/ffmpeg/' + name)
    for file in script.iterdir():
        if file.is_file():
            archive.write(str(file), 'recipe/' + file.name)
    archive.write(str(script.parent / 'macho_compat.py'), 'macho_compat.py')
    archive.write(str(repo / '.github/workflows/build-ffmpeg.yml'), 'github-workflow.yml')
    archive.write(str(out / 'build-report.json'), 'build-report.json')
    archive.write(str(out / 'VERSION.txt'), 'VERSION.txt')
    for file in licenses.rglob('*'):
        if file.is_file():
            archive.write(str(file), 'licenses/' + file.relative_to(licenses).as_posix())
print('Packaged native binary and matching source/recipe bundle: ' + label, flush=True)
