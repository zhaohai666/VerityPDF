Ghostscript Binary Placement
=============================

This directory is used to store the Ghostscript CLI binary for PDF compression.

To enable Ghostscript-based compression:

Windows:
  - Download Ghostscript from: https://ghostscript.com/releases/gsdnld.html
  - Place `gswin64c.exe` (or `gswin32c.exe`) in this directory or in `bin/` subdirectory
  - Expected paths: vendor/gs/gswin64c.exe or vendor/gs/bin/gswin64c.exe

macOS:
  - Install via: brew install ghostscript
  - Or place the `gs` binary in this directory

Linux:
  - Install via: apt install ghostscript (or equivalent)
  - Or place the `gs` binary in this directory

If Ghostscript is not found in this directory, the application will:
  1. Search the system PATH for gs/gswin64c
  2. Fall back to pdf-lib optimization (limited compression)

The vendor/ directory is included in Electron builds via the `extraResources`
configuration in package.json.
