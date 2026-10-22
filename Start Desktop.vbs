Option Explicit
Dim shell, fs, folder, exe, app
Set shell = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
folder = fs.GetParentFolderName(WScript.ScriptFullName)
exe = fs.BuildPath(folder, "runtime\desktop\electron.exe")
app = fs.BuildPath(folder, "desktop.cjs")
If Not fs.FileExists(exe) Or Not fs.FileExists(app) Then
  MsgBox "Extract the complete desktop package into your manager folder first.", 48, "MediaMTX Manager"
  WScript.Quit
End If
shell.CurrentDirectory = folder
shell.Run Chr(34) & exe & Chr(34) & " " & Chr(34) & app & Chr(34), 0, False
