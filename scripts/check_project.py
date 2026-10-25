"""Verifica artefactos locais versionados e links Markdown sem dependências externas."""

from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from portal.identity_policy import load_identity_policy  # noqa: E402


LOCAL_FILES = {".DS_Store", ".bash_history", ".bashrc", ".wget-hsts"}
LOCAL_ROOT_FILES = {Path("package-lock.json"), Path("user-default-efs")}
LINK = re.compile(r'\]\(([^\s)]+)(?:\s+"[^"]*")?\)')
RETIRED_DOCUMENTATION_TOKENS = (
    "scripts/start_ai_agent",
    "blu_ai.api.server",
    "BLU_START_AGENT",
    "BLU_MONITOR_AGENT_ENABLED",
    "/ports/8000",
    "localhost:8000",
    "127.0.0.1:8000",
)
HISTORICAL_DOCUMENTS = {Path("docs/DECISIONS.md")}


def check_project():
    load_identity_policy(ROOT / "config" / "identity_policy.json")
    names = subprocess.check_output(
        ["git", "ls-files", "-z"], cwd=ROOT
    ).decode("utf-8").split("\0")
    files = [Path(name) for name in names if name]
    problems = []
    for name in files:
        source = ROOT / name
        if name.is_relative_to(Path("monitoring/runtime")):
            problems.append(f"Artefacto privado de monitoring versionado: {name}")
        if name.name in LOCAL_FILES or name in LOCAL_ROOT_FILES:
            problems.append(f"Artefacto local versionado: {name}")
        if not source.is_file() or name.suffix != ".md":
            continue
        for number, line in enumerate(source.read_text(encoding="utf-8").splitlines(), 1):
            for match in LINK.finditer(line):
                target = match[1]
                if urlsplit(target).scheme or target.startswith(("#", "/")):
                    continue
                relative = unquote(target.split("#", 1)[0])
                if not (source.parent / relative).exists():
                    problems.append(f"{name}:{number}: ligação local inexistente: {target}")
            if name not in HISTORICAL_DOCUMENTS:
                for token in RETIRED_DOCUMENTATION_TOKENS:
                    if token in line:
                        problems.append(
                            f"{name}:{number}: referência ao agente retirado: {token}"
                        )
    return files, problems


if __name__ == "__main__":
    files, problems = check_project()
    if problems:
        raise SystemExit("\n".join(problems))
    print(f"Estrutura e ligações verificadas: {len(files)} ficheiros versionados.")
