# Windows 1.0.0

The graphical installer is packaged separately from this source repository.
Desktop installation and Quit/Start in the same desktop window passed owner tests.
Tapo viewing, pause/resume and recording passed earlier tests. On October 25,
2026, the owner confirmed the 0.9.1 update-test installer updated the existing
installation, retained saved cameras, and successfully uninstalled/reinstalled
while preserving cameras, settings and recordings. The owner also confirmed the installed web shortcut opens the saved
dashboard in a browser.
The application is unsigned. No command-line setup is needed for the packaged app.

Get the Windows setup EXE from [Releases](https://github.com/MindVisionGraphics/MediaMTX-Manager/releases).

The source-built FFmpeg replacement passed native streaming tests, packaged
backend recording/Quit-Start checks, forwarding and custom website-feed regression
checks. The owner confirmed the rebuilt Windows installer works after the requested
recheck on October 24, 2026.
