"""Sia schema compiler wrapper for Python."""

import os
import platform
import subprocess
import sys


def _find_binary():
    """Find the sia binary for the current platform."""
    system = platform.system().lower()
    machine = platform.machine().lower()

    # Map platform names
    if system == "darwin":
        plat = "darwin"
    elif system == "linux":
        plat = "linux"
    elif system == "windows":
        plat = "win32"
    else:
        plat = system

    if machine in ("x86_64", "amd64"):
        arch = "x64"
    elif machine in ("aarch64", "arm64"):
        arch = "arm64"
    else:
        arch = machine

    binary_name = "sia.exe" if system == "windows" else "sia"

    # Check bundled binary
    pkg_dir = os.path.dirname(os.path.abspath(__file__))
    bundled = os.path.join(pkg_dir, "bin", f"{plat}-{arch}", binary_name)
    if os.path.exists(bundled):
        return bundled

    # Fall back to PATH
    return "sia"


def main():
    """Run the sia compiler with the given arguments."""
    binary = _find_binary()
    args = sys.argv[1:]

    try:
        result = subprocess.run([binary] + args)
        sys.exit(result.returncode)
    except FileNotFoundError:
        print(
            f"Error: Could not find 'sia' binary. "
            f"Please install the sia-schema compiler or add it to your PATH.",
            file=sys.stderr,
        )
        sys.exit(1)
