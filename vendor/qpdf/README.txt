QPDF Binary Placement Instructions
====================================

This directory should contain the QPDF command-line tool binary.

Windows:
  Place qpdf.exe in this directory (or vendor/qpdf/bin/qpdf.exe)
  Download from: https://github.com/qpdf/qpdf/releases
  Use the "qpdf-XX.X.X-msvc64.exe" installer, then copy:
    - qpdf.exe (from bin/ directory)
    - Required DLLs (libqpdf.dll, etc.)

macOS:
  Place the qpdf binary here (or vendor/qpdf/bin/qpdf)
  Install via: brew install qpdf
  Copy from: /opt/homebrew/bin/qpdf or /usr/local/bin/qpdf

Linux:
  Place the qpdf binary here (or vendor/qpdf/bin/qpdf)
  Install via: apt install qpdf
  Copy from: /usr/bin/qpdf

QPDF version requirement: >= 11.0 (for AES-256 encryption support)

The QpdfService will search for the binary in the following order:
  1. vendor/qpdf/qpdf[.exe]
  2. vendor/qpdf/bin/qpdf[.exe]
  3. System PATH (fallback)
