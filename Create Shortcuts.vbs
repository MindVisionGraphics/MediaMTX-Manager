Option Explicit
Dim shell, fs, folder, desktopFolder, menuFolder, link, title, target, names, scripts, i
Set shell = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
folder = fs.GetParentFolderName(WScript.ScriptFullName)
If Not fs.FileExists(fs.BuildPath(folder, "runtime\node.exe")) Then
  MsgBox "Extract the complete package first. Keep this folder in its permanent location before creating shortcuts.", 48, "MediaMTX Manager"
  WScript.Quit
End If
desktopFolder = shell.SpecialFolders("Desktop")
menuFolder = fs.BuildPath(shell.SpecialFolders("Programs"), "MediaMTX Manager")
If Not fs.FolderExists(menuFolder) Then fs.CreateFolder menuFolder
names = Array("MediaMTX Manager - Web", "MediaMTX Manager - Desktop")
scripts = Array("Start Manager.vbs", "Start Desktop.vbs")
For i = 0 To 1
  If i = 0 Or fs.FileExists(fs.BuildPath(folder, "runtime\desktop\electron.exe")) Then
    For Each target In Array(desktopFolder, menuFolder)
      Set link = shell.CreateShortcut(fs.BuildPath(target, names(i) & ".lnk"))
      link.TargetPath = fs.BuildPath(shell.ExpandEnvironmentStrings("%SystemRoot%"), "System32\wscript.exe")
      link.Arguments = Chr(34) & fs.BuildPath(folder, scripts(i)) & Chr(34)
      link.WorkingDirectory = folder
      link.Description = "MediaMTX Manager by MindVision Graphics"
      link.IconLocation = fs.BuildPath(folder, "dist\assets\app.ico") & ",0"
      link.Save
    Next
  End If
Next
MsgBox "Shortcuts are ready on your desktop and in Start > MediaMTX Manager. Keep the manager folder in this location. No administrator access is required.", 64, "MediaMTX Manager"
