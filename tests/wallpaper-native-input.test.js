'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { nativeWallpaperInputSource } = require('../desktop/wallpaper-engine-input');

test('native scene input maps coordinates, keeps drag flags, releases buttons and restores focus policy',
  { skip: process.platform !== 'win32' }, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-we-native-input-'));
    try {
      const source = `using System; using System.Diagnostics; using System.IO; using System.Text;
using System.Runtime.InteropServices; using System.Windows.Forms; using System.Collections.Generic;
${nativeWallpaperInputSource()}
public static class InputProbe {
  delegate IntPtr WndProc(IntPtr h, uint m, IntPtr w, IntPtr l);
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct WC {
    public uint style; public WndProc proc; public int cls, win; public IntPtr instance, icon, cursor, background;
    public string menu, name;
  }
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern ushort RegisterClassW(ref WC c);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr CreateWindowExW(int e,string c,string t,int s,int x,int y,int w,int h,IntPtr p,IntPtr menu,IntPtr instance,IntPtr param);
  [DllImport("user32.dll")] static extern IntPtr DefWindowProcW(IntPtr h,uint m,IntPtr w,IntPtr l);
  [DllImport("user32.dll")] static extern bool DestroyWindow(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowLongW(IntPtr h,int i);
  static List<long[]> messages = new List<long[]>();
  static WndProc callback = (h,m,w,l) => {
    if (m >= 0x0200 && m <= 0x020A) messages.Add(new long[]{m,w.ToInt64(),l.ToInt64()});
    return DefWindowProcW(h,m,w,l);
  };
  static void Pump() { for(int i=0;i<25;i++){ Application.DoEvents(); System.Threading.Thread.Sleep(2); } }
  static void Check(bool v,string message){ if(!v)throw new Exception(message); }
  public static void Run() {
    var wc=new WC { name="WPEDesktopDX11Window", proc=callback }; Check(RegisterClassW(ref wc)!=0,"register");
    using(var parent=new Form()) {
      parent.StartPosition=FormStartPosition.Manual; parent.Bounds=new System.Drawing.Rectangle(-14000,-14000,640,360);
      parent.Show(); var child=CreateWindowExW(0,wc.name,"fixture",0x50000000,20,30,500,300,parent.Handle,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero);
      Check(child!=IntPtr.Zero,"child"); Pump(); messages.Clear(); int original=GetWindowLongW(parent.Handle,-20);
      var input=new MineradioWeInput(parent.Handle);
      Check((GetWindowLongW(parent.Handle,-20)&0x08000000)!=0,"source may steal focus");
      input.Forward("down",0.25,0.75,1,0,0); Pump();
      var down=messages.Find(x=>x[0]==0x0201); Check(down!=null && down[1]==1,"down flags");
      Check((short)(down[2]&65535)==125 && (short)(down[2]>>16)==224,"coordinate mapping");
      input.Forward("move",0.5,0.5,1,0,0); Pump(); Check(messages[messages.Count-1][1]==1,"drag flags lost");
      input.Reset(); Pump(); Check(messages.Exists(x=>x[0]==0x0202),"release lost");
      input.Forward("wheel",0.5,0.5,0,0,-120); Pump(); var wheel=messages.Find(x=>x[0]==0x020A);
      Check(wheel!=null && (short)(wheel[1]>>16)==-120,"wheel delta");
      input.Close(); Check(GetWindowLongW(parent.Handle,-20)==original,"focus style not restored");
      DestroyWindow(child); messages.Clear(); input.Forward("down",0.5,0.5,1,0,0); Pump();
      Check(messages.Count==0,"input delivered to a destroyed target");
    }
    Console.WriteLine("NATIVE_INPUT_OK");
  }
}`;
      const file = path.join(root, 'input.ps1');
      fs.writeFileSync(file, `$ErrorActionPreference='Stop'\n$source=@'\n${source}\n'@\nAdd-Type -ReferencedAssemblies @('System.Windows.Forms','System.Drawing') -TypeDefinition $source\n[InputProbe]::Run()\n`);
      const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file],
        { encoding: 'utf8', windowsHide: true, timeout: 20000 });
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout, /NATIVE_INPUT_OK/);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
