; PharmaPOS Inno Setup Script
; Version is passed from build.bat via: /DAppVersion=x.y.z
; Run manually:  ISCC.exe /DAppVersion=1.0.0 installer\installer.iss

#ifndef AppVersion
  #define AppVersion "0.0.0-dev"
#endif

#define AppName      "PharmaPOS"
#define AppPublisher "PharmaPOS"
#define AppURL       "http://localhost:8000"
#define AppExeName   "PharmaPOS.exe"
#define BundleDir    "..\dist\PharmaPOS"

[Setup]
AppId={{A3F7B2C1-D4E5-4F60-9A1B-2C3D4E5F6071}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
OutputDir=Output
OutputBaseFilename=PharmaPOS-Setup-{#AppVersion}
SetupIconFile=pharmapos.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
; Allow non-admin install to user's %LOCALAPPDATA%
PrivilegesRequiredOverridesAllowed=dialog

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional icons:"; Flags: unchecked

[Files]
; Copy the entire PyInstaller bundle
Source: "{#BundleDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
; Start menu shortcut
Name: "{group}\{#AppName}";        Filename: "{app}\{#AppExeName}"
; Desktop shortcut (optional)
Name: "{autodesktop}\{#AppName}";  Filename: "{app}\{#AppExeName}"; Tasks: desktopicon

[Run]
; Launch the app after install (no elevation)
Filename: "{app}\{#AppExeName}"; Description: "Launch {#AppName}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; Nothing extra needed — uninstaller removes the install directory
; User data in %LOCALAPPDATA%\PharmaPOS is intentionally left behind

[Code]
// Show a reminder that user data lives in %LOCALAPPDATA%\PharmaPOS
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
    MsgBox('PharmaPOS has been uninstalled.' + #13#10 + #13#10 +
           'Your database and backups are kept in:' + #13#10 +
           ExpandConstant('{localappdata}\PharmaPOS') + #13#10 + #13#10 +
           'Delete that folder manually if you want to remove all data.',
           mbInformation, MB_OK);
end;
