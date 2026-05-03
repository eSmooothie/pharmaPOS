# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for PharmaPOS.
Build with:  pyinstaller launcher.spec
Output:      dist/PharmaPOS/  (onedir bundle)
"""

import sys
from pathlib import Path
from PyInstaller.utils.hooks import collect_all, collect_submodules, collect_data_files
from PyInstaller.utils.win32.versioninfo import (
    VSVersionInfo, FixedFileInfo, StringFileInfo, StringTable,
    StringStruct, VarFileInfo, VarStruct,
)

ROOT = Path(SPECPATH)  # project root (where this .spec lives)

# ── Version ───────────────────────────────────────────────────────────────────
VERSION = (ROOT / "version.txt").read_text().strip()
_parts = [int(x) for x in VERSION.split(".")]
while len(_parts) < 4:
    _parts.append(0)
_ver_tuple = tuple(_parts)

_win_version = VSVersionInfo(
    ffi=FixedFileInfo(filevers=_ver_tuple, prodvers=_ver_tuple),
    kids=[
        StringFileInfo([StringTable("040904B0", [
            StringStruct("CompanyName",      "PharmaPOS"),
            StringStruct("FileDescription",  "PharmaPOS Point of Sale System"),
            StringStruct("FileVersion",      VERSION),
            StringStruct("InternalName",     "PharmaPOS"),
            StringStruct("OriginalFilename", "PharmaPOS.exe"),
            StringStruct("ProductName",      "PharmaPOS"),
            StringStruct("ProductVersion",   VERSION),
        ])]),
        VarFileInfo([VarStruct("Translation", [0x0409, 1200])]),
    ],
)

# ── Collect packages that use dynamic imports ─────────────────────────────────

uvi_datas, uvi_bins, uvi_hiddens = collect_all("uvicorn")
fast_datas, fast_bins, fast_hiddens = collect_all("fastapi")
aps_datas, aps_bins, aps_hiddens = collect_all("apscheduler")
sqla_datas, sqla_bins, sqla_hiddens = collect_all("sqlalchemy")
tz_datas = collect_data_files("tzdata")  # IANA timezone database for zoneinfo on Windows

all_datas = uvi_datas + fast_datas + aps_datas + sqla_datas + tz_datas
all_binaries = uvi_bins + fast_bins + aps_bins + sqla_bins
all_hidden = (
    uvi_hiddens + fast_hiddens + aps_hiddens + sqla_hiddens
    + collect_submodules("pydantic")
    + collect_submodules("anyio")
    + collect_submodules("starlette")
    + collect_submodules("email_validator")
    + [
        "uvicorn.loops.auto",
        "uvicorn.loops.asyncio",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.http.h11_impl",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan.on",
        "uvicorn.lifespan.off",
        "uvicorn.logging",
        "h11",
        "h11._connection",
        "h11._events",
        "multipart",
        "multipart.multipart",
        "pystray._win32",
        "PIL._imaging",
        "sqlite3",
    ]
)

# ── Bundle the backend source + built frontend ────────────────────────────────

app_datas = [
    # (source_path, dest_path_inside_bundle)
    (str(ROOT / "backend"),              "backend"),
    (str(ROOT / "frontend" / "dist"),    "frontend/dist"),
    (str(ROOT / "version.txt"),          "."),
]

a = Analysis(
    [str(ROOT / "launcher.py")],
    pathex=[str(ROOT / "backend")],
    binaries=all_binaries,
    datas=all_datas + app_datas,
    hiddenimports=all_hidden,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "numpy", "pandas", "scipy"],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="PharmaPOS",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,          # no console window
    icon=str(ROOT / "installer" / "pharmapos.ico") if (ROOT / "installer" / "pharmapos.ico").exists() else None,
    version=_win_version,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="PharmaPOS",
)
