using System;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Windows.Forms;
using System.Drawing;
using System.Diagnostics;
using System.ComponentModel;
using Microsoft.Win32;
using System.Net;
using System.Web.Script.Serialization;

[assembly: AssemblyTitle("MediaMTX Manager Setup")]
[assembly: AssemblyCompany("MindVision Graphics")]
[assembly: AssemblyVersion("1.0.0.0")]

static class InstallerFiles {
  public const string Id = "mindvision-mediamtx-manager-2026-v1";
  public const string Key = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\MindVisionMediaMTXManager";
  public static string DataPath { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MindVision Graphics", "MediaMTX Manager", "data"); } }
  public static string AppPath { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "MindVision Graphics", "MediaMTX Manager"); } }
  public static string Full(string path) { return Path.GetFullPath(path).TrimEnd(Path.DirectorySeparatorChar); }
  public static bool Within(string file, string folder) { return Full(file).StartsWith(Full(folder) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase); }
  public static void NoLinks(string folder) {
    for (var d = new DirectoryInfo(Full(folder)); d != null; d = d.Parent)
      if (d.Exists && (d.Attributes & FileAttributes.ReparsePoint) != 0) throw new IOException("Choose a normal folder, not a linked folder.");
  }
  public static void Owned(string folder) {
    NoLinks(folder);
    if (!File.Exists(Path.Combine(folder, ".manager-install")) || File.ReadAllText(Path.Combine(folder, ".manager-install")) != Id)
      throw new IOException("This folder is not a MediaMTX Manager installation.");
  }
  public static void CheckClosed(string folder) {
    try {
      using (var client = new WebClient()) {
        var json = new JavaScriptSerializer();
        var status = json.Deserialize<System.Collections.Generic.Dictionary<string,object>>(client.DownloadString("http://127.0.0.1:17860/api/launcher/status"));
        if (status.ContainsKey("appRoot") && Within((string)status["appRoot"],folder) && status.ContainsKey("managerRunning") && !(bool)status["managerRunning"]) {
          var boot = json.Deserialize<System.Collections.Generic.Dictionary<string,object>>(client.DownloadString("http://127.0.0.1:17860/api/bootstrap"));
          client.Headers["Content-Type"]="application/json"; client.Headers["X-Manager-Token"]=(string)boot["token"];
          client.UploadString("http://127.0.0.1:17860/api/launcher/exit","POST","{}"); System.Threading.Thread.Sleep(2500);
        }
      }
    } catch { }
    foreach (var p in Process.GetProcesses()) {
      try { if (Within(p.MainModule.FileName, folder) && p.Id != Process.GetCurrentProcess().Id) throw new IOException("Close MediaMTX Manager before updating or removing it. Stop recordings and Quit manager first, then close its desktop window."); }
      catch (IOException) { throw; } catch { }
    }
  }
  public static void Extract(string destination) {
    using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip")) {
      if (stream == null) throw new IOException("The setup payload is missing.");
      using (var zip = new ZipArchive(stream, ZipArchiveMode.Read)) {
        foreach (var entry in zip.Entries) {
          var output = Path.GetFullPath(Path.Combine(destination, entry.FullName.Replace('/', Path.DirectorySeparatorChar)));
          if (!Within(output, destination)) throw new IOException("Invalid file in setup payload.");
          if (entry.FullName.EndsWith("/")) { Directory.CreateDirectory(output); continue; }
          Directory.CreateDirectory(Path.GetDirectoryName(output));
          using (var input = entry.Open()) using (var file = File.Create(output)) input.CopyTo(file);
        }
      }
    }
  }
  static void CopyTree(string from, string to) {
    NoLinks(from); Directory.CreateDirectory(to);
    foreach (var file in Directory.GetFiles(from)) {
      if ((File.GetAttributes(file) & FileAttributes.ReparsePoint) != 0) throw new IOException("Linked files cannot be imported.");
      File.Copy(file, Path.Combine(to, Path.GetFileName(file)), false);
    }
    foreach (var dir in Directory.GetDirectories(from)) CopyTree(dir, Path.Combine(to, Path.GetFileName(dir)));
  }
  public static void Install(string target, bool register, string portable, bool recordings) {
    target = Full(target); NoLinks(target);
    if (target.Length < 12 || Within(DataPath, target) || Within(target, DataPath) || target.Equals(Full(DataPath), StringComparison.OrdinalIgnoreCase)) throw new IOException("Choose a separate application folder.");
    if (Directory.Exists(target) && Directory.GetFileSystemEntries(target).Length > 0) Owned(target);
    CheckClosed(target);
    var stage = target + ".install-" + Guid.NewGuid().ToString("N");
    var old = target + ".previous-" + Guid.NewGuid().ToString("N");
    Directory.CreateDirectory(stage);
    try {
      Extract(stage); File.WriteAllText(Path.Combine(stage, ".manager-install"), Id);
      if (!String.IsNullOrWhiteSpace(portable)) {
        var source = Path.Combine(Full(portable), "data"); NoLinks(source);
        if (!File.Exists(Path.Combine(source, "workspace.json"))) throw new IOException("That portable folder does not contain data/workspace.json.");
        if (File.Exists(Path.Combine(DataPath, "workspace.json"))) throw new IOException("An installed setup already exists. Use Backup and restore in the manager instead of overwriting it.");
        var incoming = DataPath + ".import-" + Guid.NewGuid().ToString("N"); Directory.CreateDirectory(incoming);
        try {
          File.Copy(Path.Combine(source, "workspace.json"), Path.Combine(incoming, "workspace.json"));
          if (recordings && Directory.Exists(Path.Combine(source, "recordings"))) CopyTree(Path.Combine(source, "recordings"), Path.Combine(incoming, "recordings"));
          if (Directory.Exists(DataPath) && Directory.GetFileSystemEntries(DataPath).Length != 0) throw new IOException("The installed data folder is not empty. Import your encrypted backup inside the app instead.");
          if (Directory.Exists(DataPath)) Directory.Delete(DataPath);
          Directory.CreateDirectory(Path.GetDirectoryName(DataPath)); Directory.Move(incoming, DataPath);
        } finally { if(Directory.Exists(incoming)){NoLinks(incoming);Directory.Delete(incoming,true);} }
      }
      if (Directory.Exists(target)) Directory.Move(target, old);
      try { Directory.Move(stage, target); if (register) Register(target); }
      catch { if (Directory.Exists(target)) { Owned(target); Directory.Delete(target, true); } if (Directory.Exists(old)) Directory.Move(old, target); throw; }
      if (Directory.Exists(old)) { if (Directory.GetFileSystemEntries(old).Length > 0) Owned(old); Directory.Delete(old, true); }
    } finally { if (Directory.Exists(stage)) { NoLinks(stage); Directory.Delete(stage, true); } }
  }
  static void Shortcut(string location, string exe, string args, string icon) {
    Directory.CreateDirectory(Path.GetDirectoryName(location));
    dynamic shell = Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));
    dynamic link = shell.CreateShortcut(location); link.TargetPath = exe; link.Arguments = args;
    link.WorkingDirectory = Path.GetDirectoryName(exe); link.Description = "MediaMTX Manager by MindVision Graphics"; link.IconLocation = icon; link.Save();
  }
  static void Register(string target) {
    var exe = Path.Combine(target, "MediaMTX Manager.exe");
    var menu = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "MediaMTX Manager");
    Shortcut(Path.Combine(menu, "MediaMTX Manager.lnk"), exe, "", Path.Combine(target,"app.ico"));
    Shortcut(Path.Combine(menu, "MediaMTX Manager - Web.lnk"), exe, "--web", Path.Combine(target,"app.ico"));
    Shortcut(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "MediaMTX Manager.lnk"), exe, "", Path.Combine(target,"app.ico"));
    using (var key = Registry.CurrentUser.CreateSubKey(Key)) {
      key.SetValue("DisplayName", "MediaMTX Manager"); key.SetValue("DisplayVersion", "1.0.0"); key.SetValue("Publisher", "MindVision Graphics");
      key.SetValue("InstallLocation", target); key.SetValue("DisplayIcon", Path.Combine(target,"app.ico")); key.SetValue("URLInfoAbout", "https://mindvisiongraphics.com/");
      key.SetValue("UninstallString", "\"" + Path.Combine(target,"Uninstall.exe") + "\""); key.SetValue("NoModify",1); key.SetValue("NoRepair",1);
    }
  }
  public static void Remove(string target, bool register) {
    target = Full(target); Owned(target); CheckClosed(target);
    if (register) {
      using (var key = Registry.CurrentUser.OpenSubKey(Key)) if (key == null || !target.Equals(Full((string)key.GetValue("InstallLocation")),StringComparison.OrdinalIgnoreCase)) throw new IOException("The registered installation folder does not match.");
    }
    // DataPath is deliberately outside the checked application folder and is never deleted.
    if (Within(DataPath,target)||target.Equals(Full(DataPath),StringComparison.OrdinalIgnoreCase)) throw new IOException("The data folder must be preserved.");
    Directory.Delete(target,true);
    if (register) {
      Registry.CurrentUser.DeleteSubKeyTree(Key,false);
      var menu = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs),"MediaMTX Manager");
      foreach(var name in new[]{"MediaMTX Manager.lnk","MediaMTX Manager - Web.lnk"}) File.Delete(Path.Combine(menu,name));
      if(Directory.Exists(menu)&&Directory.GetFileSystemEntries(menu).Length==0)Directory.Delete(menu);
      File.Delete(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),"MediaMTX Manager.lnk"));
    }
  }
}

static class Program {
  [STAThread] static int Main(string[] args) {
    Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
    try {
#if UNINSTALL
      if(args.Length==3 && args[0]=="--cleanup") {
        try { Process.GetProcessById(Int32.Parse(args[2])).WaitForExit(10000); } catch { }
        InstallerFiles.Remove(args[1],true); MessageBox.Show("Application removed. Your camera settings and recordings have been kept in:\n"+InstallerFiles.DataPath,"MediaMTX Manager"); return 0;
      }
      var target=Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location); InstallerFiles.Owned(target); InstallerFiles.CheckClosed(target);
      if(MessageBox.Show("Remove MediaMTX Manager? Settings and recordings will be kept.","MediaMTX Manager",MessageBoxButtons.YesNo,MessageBoxIcon.Question)!=DialogResult.Yes)return 0;
      var copy=Path.Combine(Path.GetTempPath(),"MediaMTX-Uninstall-"+Guid.NewGuid().ToString("N")+".exe"); File.Copy(Assembly.GetExecutingAssembly().Location,copy);
      Process.Start(new ProcessStartInfo(copy,"--cleanup \""+target+"\" "+Process.GetCurrentProcess().Id){UseShellExecute=false}); return 0;
#else
      if(args.Length==2 && args[0]=="--verify-payload") { InstallerFiles.Install(args[1],false,null,false); return 0; }
      if(args.Length==2 && args[0]=="--test-remove") { InstallerFiles.Remove(args[1],false); return 0; }
      ShowSetup(); return 0;
#endif
    } catch(Exception e) {
#if !UNINSTALL
      if(args.Length>0)return 1;
#endif
      MessageBox.Show(e.Message,"MediaMTX Manager",MessageBoxButtons.OK,MessageBoxIcon.Error); return 1;
    }
  }
  static void ShowSetup() {
    var form=new Form{Text="MediaMTX Manager Setup · MindVision Graphics",Width=670,Height=590,StartPosition=FormStartPosition.CenterScreen,FormBorderStyle=FormBorderStyle.FixedDialog,MaximizeBox=false,Font=new Font("Segoe UI",10)};
    form.Icon=Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location);
    var title=new Label{Text="Install MediaMTX Manager",Left=28,Top=25,Width=600,Height=35,Font=new Font("Segoe UI",19,FontStyle.Bold)};
    var intro=new Label{Text="Desktop and web editions. No administrator access or commands needed.\nThis application is unsigned. Close the manager before updating.",Left=30,Top=72,Width=600,Height=55};
    var label=new Label{Text="Application folder",Left=30,Top=139,Width=590};
    var folder=new TextBox{Text=InstallerFiles.AppPath,Left=30,Top=169,Width=500};
    var browse=new Button{Text="Browse…",Left=535,Top=167,Width=88}; browse.Click+=(s,e)=>{using(var d=new FolderBrowserDialog{SelectedPath=folder.Text})if(d.ShowDialog()==DialogResult.OK)folder.Text=d.SelectedPath;};
    var note=new Label{Text="Start-menu and Desktop shortcuts will be created. Saved settings and recordings\nare kept separately and are preserved when the app is updated or uninstalled.",Left=30,Top=210,Width=600,Height=50};
    var importLabel=new Label{Text="Existing portable manager folder (optional)",Left=30,Top=279,Width=590};
    var portable=new TextBox{Left=30,Top=309,Width=500};
    var importBrowse=new Button{Text="Browse…",Left=535,Top=307,Width=88}; importBrowse.Click+=(s,e)=>{using(var d=new FolderBrowserDialog())if(d.ShowDialog()==DialogResult.OK)portable.Text=d.SelectedPath;};
    var copy=new CheckBox{Text="Also copy existing recordings (may take time and extra disk space)",Left=30,Top=350,Width=600,Height=35};
    var status=new Label{Text="The original portable folder will remain unchanged.",Left=30,Top=397,Width=600,Height=50};
    var install=new Button{Text="Install",Left=480,Top=465,Width=140,Height=38};
    var progress=new ProgressBar{Left=30,Top=450,Width=590,Height=7,Style=ProgressBarStyle.Marquee,Visible=false};
    var worker=new BackgroundWorker(); bool done=false,busy=false; string installedTarget=null;
    worker.DoWork+=(s,e)=>{var values=(string[])e.Argument;InstallerFiles.Install(values[0],true,values[1],values[2]=="yes");};
    worker.RunWorkerCompleted+=(s,e)=>{busy=false;progress.Visible=false;if(e.Error!=null){status.Text=e.Error.Message;install.Enabled=true;folder.Enabled=browse.Enabled=portable.Enabled=importBrowse.Enabled=copy.Enabled=true;return;}done=true;status.Text="Installed. Use your Desktop or Start-menu shortcut next time.";install.Text="Open manager";install.Enabled=true;};
    install.Click+=(s,e)=>{if(done){Process.Start(Path.Combine(installedTarget,"MediaMTX Manager.exe"));form.Close();return;}installedTarget=folder.Text;install.Enabled=false;folder.Enabled=browse.Enabled=portable.Enabled=importBrowse.Enabled=copy.Enabled=false;busy=true;progress.Visible=true;status.Text="Installing… please keep this window open.";worker.RunWorkerAsync(new string[]{folder.Text,portable.Text,copy.Checked?"yes":"no"});};
    form.FormClosing+=(s,e)=>{if(busy)e.Cancel=true;};
    form.Controls.AddRange(new Control[]{title,intro,label,folder,browse,note,importLabel,portable,importBrowse,copy,status,progress,install}); Application.Run(form);
  }
}

