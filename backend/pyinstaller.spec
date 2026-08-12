# -*- mode: python ; coding: utf-8 -*-
#
# Builds the onedir bundle for backend/server.py. Run from backend/:
#   pyinstaller pyinstaller.spec --distpath dist --workpath build --noconfirm
#
# --onedir (not --onefile), deliberately — see deploy plan §1. --onefile
# re-extracts its whole payload to a temp dir on every process start, which
# is slow on SD-card-class storage and bad under systemd's Restart=on-failure.

import os
from PyInstaller.utils.hooks import collect_all, collect_submodules, collect_data_files

datas = []
binaries = []
hiddenimports = []

# Known PyInstaller friction points for this dependency set — static import
# analysis misses these because they're loaded dynamically (cffi/OpenSSL
# bindings, lazily-registered image codecs, class-path-string worker
# selection, etc). See deploy plan §1 for the reasoning behind each one.
for pkg in ('cryptography', 'psycopg2', 'Pillow', 'anthropic', 'voyageai',
            'stripe', 'mcp', 'pydantic', 'pydantic_core', 'anyio'):
    d, b, h = collect_all(pkg)
    datas += d
    binaries += b
    hiddenimports += h

# gunicorn's worker classes are loaded by dynamic class-path string.
hiddenimports += collect_submodules('gunicorn')

# requests/anthropic/voyageai/stripe all need certifi's bundled cacert.pem
# as a *data file* or outbound HTTPS calls fail cert verification once frozen.
datas += collect_data_files('certifi')

# Bundle the app's static reference data (e.g. the RAG demo's sample PDF) —
# read-only content served via current_app.root_path, not runtime-writable
# state (that goes through APP_DATA_DIR — see upload_utils.get_app_data_dir).
datas += [(os.path.join(SPECPATH, 'data'), 'data')]

a = Analysis(
    ['server.py'],
    pathex=[SPECPATH],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='server',
)
