"""Export pip requirements from uv.lock; --check detects stale exports in CI."""
import argparse
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
EXPORTS = {
    "requirements.txt": [],
    "translations/requirements.txt": ["--only-group", "translation"],
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    stale = []
    for name, groups in EXPORTS.items():
        result = subprocess.run(
            [sys.executable, "-m", "uv", "export", "--locked", "--offline",
             "--no-header", "--no-hashes", "--no-emit-project",
             "--no-default-groups", *groups],
            cwd=ROOT, check=True, capture_output=True, text=True, encoding="utf-8",
        )
        content = "# Generated from pyproject.toml and uv.lock. Do not edit manually.\n"
        content += "# Regenerate: python scripts/export_requirements.py\n" + result.stdout
        destination = ROOT / name
        if args.check:
            if not destination.exists() or destination.read_text(encoding="utf-8") != content:
                stale.append(name)
        else:
            destination.write_text(content, encoding="utf-8")
    if stale:
        parser.exit(1, "Stale requirements: " + ", ".join(stale) + "\nRun python scripts/export_requirements.py\n")
    print("Requirements are synchronized." if args.check else "Requirements exported.")


if __name__ == "__main__":
    main()
