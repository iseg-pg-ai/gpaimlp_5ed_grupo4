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


def activate_node() -> None:
    """Usar Node e npm da mesma instalação suportada durante a preparação."""
    candidates = []
    current = shutil.which("node")
    if current:
        candidates.append(Path(current))
    candidates.extend(sorted((Path.home() / ".nvm/versions/node").glob("v*/bin/node"), reverse=True))
    for executable in candidates:
        result = subprocess.run([str(executable), "--version"], capture_output=True, text=True, timeout=10)
        try:
            major, minor, *_ = map(int, result.stdout.strip().lstrip("v").split("."))
        except ValueError:
            continue
        if 22 <= major < 25 and not (major == 22 and minor < 13):
            os.environ["PATH"] = str(executable.parent) + os.pathsep + os.environ.get("PATH", "")
            return


def node_version() -> str | None:
    """Consultar a instalação selecionada por activate_node."""
    return command_version("node", "--version")


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
        print("  ! Launcher global já ocupado; usar ./bin/just neste checkout.")
        return
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
    parser.add_argument("--initialize-data", action="store_true", help="Inicializar dados locais com o Python de .venv")
    args = parser.parse_args()
    if args.check_only and args.initialize_data:
        parser.error("--check-only não pode inicializar dados.")

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

    activate_node()
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
    if versions["uv"] and versions["uv"].split()[:2] != ["uv", "0.12.19"]:
        blockers.append("uv 0.12.19")
    # O modo normal prepara código e acesso; `just blu it` materializa os dados S3.
    # A inicialização local legada continua a exigir uma entrega já presente.
    required = ["warehouse/blu_etl.sqlite", "warehouse/manifest.json",
                "warehouse/validation_report.json", "data/reference/structured_dataset.xlsx"]
    if args.initialize_data:
        blockers += [f"ficheiro local ausente: {name}" for name in required
                     if not (ROOT / name).is_file()]
    if args.initialize_data and not (ROOT / ".venv/bin/python").is_file():
        blockers.append("Executar primeiro: uv sync --locked --all-groups")

    print("\nBLU · verificação do ambiente")
    for name, value in versions.items():
        print(f"  {'✓' if value else '✗'} {name}: {value or 'ausente'}")
    print(f"  ✓ Studio: {studio_url}")
    print(f"  {'✓' if (ROOT / 'data').is_dir() else '!'} Estrutura local: data/")
    print(f"  {'✓' if (ROOT / 'warehouse/blu_etl.sqlite').is_file() else '·'} Cache local: "
          f"{'disponível' if (ROOT / 'warehouse/blu_etl.sqlite').is_file() else 'será materializada pelo just blu it'}")
    if blockers:
        print("\nBloqueios: " + ", ".join(blockers), file=sys.stderr)
        return 1

    if not args.check_only:
        write_studio_config(studio_url)
        ensure_launcher()
        created_access = ensure_monitoring_access()
        if args.initialize_data:
            subprocess.run([str(ROOT / ".venv/bin/python"), "-B", "-m", "monitoring.recovery", "ensure"],
                           cwd=ROOT, check=True)
        if created_access:
            print("  ✓ Acesso inicial do Monitoring criado em monitoring/runtime/initial-password.txt")
        print("\nPreparação local concluída. Próximo passo: ./bin/just blu it")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
