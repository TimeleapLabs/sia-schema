"""Allow running sia via `python -m sia_schema`."""

from __future__ import annotations

import os
import sys

from sia_schema import find_sia_bin


def _run() -> None:
    sia = find_sia_bin()
    if sys.platform == "win32":
        import subprocess

        completed_process = subprocess.run([sia, *sys.argv[1:]])
        sys.exit(completed_process.returncode)
    else:
        os.execvp(sia, [sia, *sys.argv[1:]])


if __name__ == "__main__":
    _run()
