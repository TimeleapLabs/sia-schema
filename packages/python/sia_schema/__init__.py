"""Sia schema compiler — generates serialization code from .sia files."""

from __future__ import annotations

import os
import sys
import sysconfig


def find_sia_bin() -> str:
    """Return the path to the sia binary."""
    sia_exe = "sia" + sysconfig.get_config_var("EXE")

    # Check the scripts directory (where pip installs binaries)
    scripts_dir = sysconfig.get_path("scripts")
    if scripts_dir:
        path = os.path.join(scripts_dir, sia_exe)
        if os.path.isfile(path):
            return path

    # Check the base prefix scripts directory (for venvs)
    base_scripts = sysconfig.get_path("scripts", vars={"base": sys.base_prefix})
    if base_scripts:
        path = os.path.join(base_scripts, sia_exe)
        if os.path.isfile(path):
            return path

    raise FileNotFoundError("Could not find the sia binary")


__all__ = ["find_sia_bin"]
