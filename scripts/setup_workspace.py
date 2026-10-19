"""Prepara um checkout BLU para um colega no SageMaker Code Editor."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
STUDIO_CONFIG = ROOT / "config/studio.local.json"


def normalize_studio_url(raw: str) -> str:
    """Aceitar a URL base do Code Editor sem guardar caminhos de portas."""
    value = raw.strip().rstrip("/")
    parsed = urlsplit(value)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username
            or parsed.password or parsed.query or parsed.fragment
            or parsed.path != "/codeeditor/default"
            or not parsed.hostname.endswith(".studio.eu-west-1.sagemaker.aws")):
        raise ValueError(
            "Usar a URL HTTPS terminada em /codeeditor/default, sem /ports ou parâmetros."
        )
    return value


def command_version(command: str, *arguments: str) -> str | None:
    executable = shutil.which(command)
    if not executable:
        return None
    result = subprocess.run(
        [executable, *arguments], check=False, capture_output=True, text=True, timeout=10
    )
    return (result.stdout or result.stderr).strip().splitlines()[0]


def node_version() -> str | None:
    """Preferir uma versão suportada instalada no NVM, mesmo se não estiver ativa."""
    candidates = []
    current = shutil.which("node")
    if current:
        candidates.append(Path(current))
    candidates.extend(sorted((Path.home() / ".nvm/versions/node").glob("v*/bin/node"), reverse=True))
    fallback = None
    for executable in candidates:
        result = subprocess.run(
            [str(executable), "--version"], check=False, capture_output=True,
            text=True, timeout=10,
        )
        value = result.stdout.strip()
        if not value:
            continue
        fallback = fallback or value
        major, minor, *_ = map(int, value.lstrip("v").split("."))
        if 22 <= major < 25 and not (major == 22 and minor < 13):
            return value
    return fallback


def write_studio_config(value: str) -> None:
    STUDIO_CONFIG.parent.mkdir(parents=True, exist_ok=True)
    temporary = STUDIO_CONFIG.with_suffix(".tmp")
    temporary.write_text(json.dumps({"base_url": value}, indent=2) + "\n", encoding="utf-8")
    os.chmod(temporary, 0o600)
    os.replace(temporary, STUDIO_CONFIG)


def ensure_launcher() -> None:
    destination = Path.home() / ".local/bin/just"
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() or destination.is_symlink():
        if destination.is_symlink() and destination.resolve() == (ROOT / "bin/just").resolve():
            return
        raise RuntimeError(f"{destination} já existe e não pertence a este checkout.")
    destination.symlink_to(ROOT / "bin/just")


def ensure_monitoring_access() -> bool:
    credentials = ROOT / "monitoring/runtime/credentials.json"
    if credentials.exists():
        return False
    subprocess.run(
        [sys.executable, "-B", "-m", "monitoring.setup", "--generate"],
        cwd=ROOT,
        check=True,
    )
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--studio-url", help="URL base copiada do Code Editor")
    parser.add_argument("--check-only", action="store_true", help="Validar sem alterar o checkout")
    args = parser.parse_args()

    raw_url = args.studio_url
    if not raw_url and STUDIO_CONFIG.exists():
        raw_url = json.loads(STUDIO_CONFIG.read_text(encoding="utf-8"))["base_url"]
    if not raw_url and not args.check_only and sys.stdin.isatty():
        raw_url = input("URL base do SageMaker Code Editor: ")
    if not raw_url:
        parser.error("Indicar --studio-url ou configurar config/studio.local.json.")
    try:
        studio_url = normalize_studio_url(raw_url)
    except ValueError as error:
        parser.error(str(error))

    versions = {
        "Python": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        "Node": node_version(),
        "npm": command_version("npm", "--version"),
        "uv": command_version("uv", "--version"),
        "Git": command_version("git", "--version"),
    }
    python_ok = (3, 12) <= sys.version_info[:2] < (3, 14)
    node_ok = False
    if versions["Node"]:
        major, minor, *_ = map(int, versions["Node"].lstrip("v").split("."))
        node_ok = 22 <= major < 25 and not (major == 22 and minor < 13)
    missing = [name for name in ("npm", "uv", "Git") if not versions[name]]
    blockers = ([] if python_ok else ["Python 3.12 ou 3.13"])
    blockers += ([] if node_ok else ["Node >=22.13 e <25"])
    blockers += missing

    if not args.check_only:
        write_studio_config(studio_url)
        ensure_launcher()
        created_access = ensure_monitoring_access()
    else:
        created_access = False

    print("\nBLU · verificação do ambiente")
    for name, value in versions.items():
        print(f"  {'✓' if value else '✗'} {name}: {value or 'ausente'}")
    print(f"  ✓ Studio: {studio_url}")
    print(f"  {'✓' if (ROOT / 'data').is_dir() else '!'} Fontes locais: data/")
    print(f"  {'✓' if (ROOT / 'warehouse/blu_etl.sqlite').is_file() else '!'} Warehouse publicado")
    if created_access:
        print("  ✓ Acesso inicial do Monitoring criado em monitoring/runtime/initial-password.txt")
    if blockers:
        print("\nBloqueios: " + ", ".join(blockers), file=sys.stderr)
        return 1
    if not args.check_only:
        print("\nPreparação local concluída. Próximo passo: just blu it")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
