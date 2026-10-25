"""Rebuild the verified Windows preview with the About version-label change.

This only reads the previous installer as an assembly resource and compiles
new setup files. It does not execute setup or touch an installed workspace.
"""
import hashlib
import os
import pathlib
import subprocess
import urllib.request
import zipfile

repo = pathlib.Path(__file__).resolve().parents[1]
workspace = repo.parents[1]
work = workspace / 'work/windows-update-test'
work.mkdir(exist_ok=True)
outputs = workspace / 'outputs'
base = outputs / 'MediaMTX-Manager-Windows-Setup-Source-Build-Preview.exe'
expected = '76bb27ae9127093d555b98cf34e7dc081a1ac7ce1261d7b42f92ab5dc6061349'

def sha(file):
    h = hashlib.sha256()
    with file.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()

if not base.exists():
    urllib.request.urlretrieve('https://github.com/MindVisionGraphics/MediaMTX-Manager/releases/download/v0.9.0-preview.1/' + base.name, str(base))
assert sha(base) == expected, 'Base installer hash mismatch'
csc = pathlib.Path(os.environ['WINDIR']) / 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
helper = work / 'ReadPayload.cs'
helper.write_text('''using System; using System.IO; using System.Reflection;
class ReadPayload { static void Main(string[] a) {
var assembly=Assembly.ReflectionOnlyLoadFrom(Path.GetFullPath(a[0]));
using(var input=assembly.GetManifestResourceStream("payload.zip"))
using(var output=File.Create(a[1])) { if(input==null)throw new Exception("Missing payload");input.CopyTo(output); }
}}''')
subprocess.run([str(csc), '/nologo', '/out:' + str(work / 'ReadPayload.exe'), str(helper)], check=True)
original = work / 'original.zip'
subprocess.run([str(work / 'ReadPayload.exe'), str(base), str(original)], check=True)
references = ['System.Windows.Forms.dll', 'System.Drawing.dll', 'System.IO.Compression.dll',
              'System.IO.Compression.FileSystem.dll', 'Microsoft.CSharp.dll', 'System.Web.Extensions.dll']
flags = [str(csc), '/nologo', '/target:winexe', '/platform:x64',
         '/win32icon:' + str(repo / 'packaging/app.ico'),
         '/win32manifest:' + str(repo / 'packaging/app.manifest')]
flags += ['/reference:' + name for name in references]
uninstall = work / 'Uninstall.exe'
subprocess.run(flags + ['/define:UNINSTALL', '/out:' + str(uninstall), str(repo / 'packaging/Setup.cs')], check=True)
app_path = 'resources/manager/dist/app.js'
changes = {app_path: (repo / 'dist/app.js').read_bytes(), 'Uninstall.exe': uninstall.read_bytes()}
payload = work / 'payload.zip'
with zipfile.ZipFile(str(original)) as old, zipfile.ZipFile(str(payload), 'w', zipfile.ZIP_DEFLATED) as new:
    assert set(changes).issubset(old.namelist())
    for entry in old.infolist():
        assert '/data/' not in '/' + entry.filename
        content = changes.get(entry.filename)
        if content is None:
            content = old.read(entry)
        new.writestr(entry, content)
with zipfile.ZipFile(str(original)) as old, zipfile.ZipFile(str(payload)) as new:
    assert new.testzip() is None
    assert old.namelist() == new.namelist()
    for name in old.namelist():
        if name not in changes:
            assert old.getinfo(name).CRC == new.getinfo(name).CRC, name
    assert b'0.9.1 Preview' in new.read(app_path)
output = outputs / 'MediaMTX-Manager-Windows-Setup-0.9.1-Update-Test.exe'
subprocess.run(flags + ['/out:' + str(output), '/resource:' + str(payload) + ',payload.zip',
    str(repo / 'packaging/Setup.cs')], check=True)
(outputs / (output.name + '.sha256')).write_text(sha(output) + '  ' + output.name + '\n')
print('Verified update-test installer: ' + str(output), flush=True)
print('Only payload changes: About version label and versioned uninstaller metadata.', flush=True)
