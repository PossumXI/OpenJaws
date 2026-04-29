import sys

from harbor_windows_patch import apply_windows_harbor_patches

from harbor.cli.main import app

apply_windows_harbor_patches()


if __name__ == "__main__":
    app()
