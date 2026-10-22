Option Explicit
Dim shell, fs, folder, exe, app, process
Set shell = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
folder = fs.GetParentFolderName(WScript.ScriptFullName)
exe = fs.BuildPath(folder, "runtime\node.exe")
app = fs.BuildPath(folder, "launcher.mjs")
If Not fs.FileExists(exe) Or Not fs.FileExists(app) Then
  MsgBox "Please extract the entire downloaded folder before starting MediaMTX Manager.", 48, "MediaMTX Manager"
  WScript.Quit
End If
shell.CurrentDirectory = folder
shell.Run Chr(34) & exe & Chr(34) & " " & Chr(34) & app & Chr(34) & " --open", 0, False
