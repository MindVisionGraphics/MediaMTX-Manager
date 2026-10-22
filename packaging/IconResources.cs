using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;

// Apply the same multi-resolution ICO to all existing application icon groups.
class IconResources {
  delegate bool NameCallback(IntPtr module, IntPtr type, IntPtr name, IntPtr parameter);
  delegate bool LanguageCallback(IntPtr module, IntPtr type, IntPtr name, ushort language, IntPtr parameter);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern IntPtr LoadLibraryEx(string file, IntPtr unused, uint flags);
  [DllImport("kernel32.dll")] static extern bool FreeLibrary(IntPtr module);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern bool EnumResourceNames(IntPtr module, IntPtr type, NameCallback callback, IntPtr parameter);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern bool EnumResourceLanguages(IntPtr module, IntPtr type, IntPtr name, LanguageCallback callback, IntPtr parameter);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr BeginUpdateResource(string file, bool deleteExisting);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool UpdateResource(IntPtr handle, IntPtr type, IntPtr name, ushort language, byte[] bytes, uint length);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool EndUpdateResource(IntPtr handle, bool discard);

  static void Put(IntPtr handle, int type, int name, ushort language, byte[] bytes) {
    if(!UpdateResource(handle,new IntPtr(type),new IntPtr(name),language,bytes,(uint)bytes.Length))
      throw new IOException("Could not update application icon: "+Marshal.GetLastWin32Error());
  }
  static int Main(string[] args) {
    if(args.Length!=2)return 2;
    var groups=new Dictionary<int,List<ushort>>();
    var module=LoadLibraryEx(Path.GetFullPath(args[0]),IntPtr.Zero,0x22);
    if(module==IntPtr.Zero)return 3;
    NameCallback names=(m,t,n,p)=>{
      long id=n.ToInt64();if(id<1||id>65535)throw new IOException("Unsupported named application icon resource.");
      var languages=new List<ushort>();
      LanguageCallback callback=(a,b,c,language,d)=>{languages.Add(language);return true;};
      EnumResourceLanguages(m,t,n,callback,IntPtr.Zero);groups[(int)id]=languages;return true;
    };
    EnumResourceNames(module,new IntPtr(14),names,IntPtr.Zero);FreeLibrary(module);
    if(groups.Count==0)groups[1]=new List<ushort>();
    var ico=File.ReadAllBytes(args[1]);int count=BitConverter.ToUInt16(ico,4);
    var groupStream=new MemoryStream();var writer=new BinaryWriter(groupStream);
    writer.Write((ushort)0);writer.Write((ushort)1);writer.Write((ushort)count);
    for(int i=0;i<count;i++){writer.Write(ico,6+i*16,12);writer.Write((ushort)(22000+i));}
    writer.Flush();var group=groupStream.ToArray();writer.Dispose();
    var update=BeginUpdateResource(Path.GetFullPath(args[0]),false);if(update==IntPtr.Zero)return 4;
    try {
      for(int i=0;i<count;i++){
        int size=BitConverter.ToInt32(ico,6+i*16+8),offset=BitConverter.ToInt32(ico,6+i*16+12);
        var content=new byte[size];Buffer.BlockCopy(ico,offset,content,0,size);Put(update,3,22000+i,0,content);
      }
      foreach(var item in groups){if(!item.Value.Contains(0))item.Value.Add(0);foreach(ushort language in item.Value)Put(update,14,item.Key,language,group);}
      if(!EndUpdateResource(update,false))return 5;update=IntPtr.Zero;
    } finally {if(update!=IntPtr.Zero)EndUpdateResource(update,true);}
    Console.WriteLine("Applied matching logo to "+groups.Count+" application icon group(s).");return 0;
  }
}
