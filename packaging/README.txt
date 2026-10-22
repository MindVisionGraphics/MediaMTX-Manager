MEDIAMTX MANAGER PACKAGING SOURCES
MindVision Graphics - 2026-10-22

Setup.cs is a WinForms installer/uninstaller compiled using the Windows .NET
Framework compiler. It runs per user, registers Windows Apps uninstall metadata,
creates shortcuts and keeps installed data outside the application directory.
The Windows binary is unsigned. Automatic approval review prevented executing
the installer in the build session. The project owner subsequently confirmed
graphical desktop installation and same-window Quit/Start passed. Import, upgrade
and uninstall acceptance remain pending.

Windows payload layout:
- MediaMTX Manager.exe: Electron executable renamed from the official runtime
- resources/app/package.json and main.cjs: installed app entrypoint
- resources/manager/: UI, local server, launcher and bundled Node/MediaMTX/FFmpeg
- app.ico, Electron LICENSE and Chromium notices
- Uninstall.exe: Setup.cs compiled with UNINSTALL defined

Compile Uninstall.exe first; include it in the payload ZIP. Compile Setup.cs as a
Windows executable with that ZIP embedded using resource name payload.zip. Keep
references to System.Windows.Forms, System.Drawing, System.IO.Compression,
System.IO.Compression.FileSystem, Microsoft.CSharp and System.Web.Extensions.
No downloaded build compiler or package installation was used.

build-macos.py builds unsigned architecture-specific .app ZIPs from official
Electron/Node/MediaMTX archives already downloaded into work/. It verifies release
hashes, checks runtime CPU types and preserves Unix symlinks/executable modes.
The Mac credential helper uses Electron safeStorage with OS encryption required;
it passes credential text over standard input, not command-line arguments.
macOS execution, Keychain behavior and signing require a real macOS test environment.

All release binaries and runtime archives are excluded from GitHub publication
until provenance/licensing and signing/acceptance checks are complete. Source
can be reviewed independently. No private camera settings or recordings belong
in a release archive.
