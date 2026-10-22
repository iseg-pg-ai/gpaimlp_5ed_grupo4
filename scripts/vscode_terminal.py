#!/usr/bin/env python3
"""Instalar a ponte local do editor ou pedir um split Bash/Codex."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "scripts/vscode-terminal"
DISCOVERY = ROOT / "monitoring/runtime/editor-terminal.json"


def install() -> bool:
    """Empacotar apenas as fontes locais; não consultar o Marketplace."""
    code = shutil.which("code")
    if not code:
        print("VS Code CLI indisponível; não foi instalada a integração de terminal.")
        return False
    package = json.loads((SOURCE / "package.json").read_text())
    version = package["version"]
    manifest = f'''<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
<Metadata><Identity Language="en-US" Id="blu-terminal" Version="{version}" Publisher="blu-local"/>
<DisplayName>BLU — Bash e Codex</DisplayName><Description xml:space="preserve">Terminais locais BLU</Description>
<Categories>Other</Categories><Properties>
<Property Id="Microsoft.VisualStudio.Code.Engine" Value="^1.85.0"/>
<Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="workspace"/>
</Properties></Metadata><Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation>
<Dependencies/><Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/>
</Assets></PackageManifest>'''
    with tempfile.TemporaryDirectory(prefix="blu-terminal-package-") as directory:
        package_path = Path(directory) / "blu-terminal.vsix"
        with zipfile.ZipFile(package_path, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("extension.vsixmanifest", manifest)
            archive.writestr("[Content_Types].xml", '''<?xml version="1.0"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="json" ContentType="application/json"/>
<Default Extension="cjs" ContentType="application/javascript"/>
<Default Extension="vsixmanifest" ContentType="text/xml"/></Types>''')
            for name in ("package.json", "extension.cjs"):
                archive.write(SOURCE / name, f"extension/{name}")
        result = subprocess.run([code, "--install-extension", str(package_path), "--force"], check=False)
    return result.returncode == 0


def request_split() -> bool:
    executable = shutil.which("codex")
    if not executable:
        print("Codex CLI não instalado; os serviços BLU continuam ativos.")
        return False
    parents = []
    pid = os.getpid()
    while pid > 1 and pid not in parents:
        parents.append(pid)
        try:
            # O nome do processo entre parênteses pode conter espaços.
            pid = int(Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()[1])
        except (OSError, ValueError, IndexError):
            break
    try:
        address = json.loads(DISCOVERY.read_text())["socket"]
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
            connection.settimeout(5)
            connection.connect(address)
            connection.sendall((json.dumps({"parents": parents, "executable": executable}) + "\n").encode())
            response = connection.makefile("r").readline(8192)
        if json.loads(response).get("ok") is True:
            print("Codex aberto num terminal separado, ao lado do Bash.")
            return True
    except (OSError, ValueError, KeyError, TypeError):
        pass
    print("Integração do editor ainda indisponível. Executa python3 scripts/vscode_terminal.py --install")
    print("e, se necessário, usa Developer: Reload Window no VS Code. O Bash fica livre.")
    return False


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--install", action="store_true", help="Instalar a extensão local no VS Code.")
    arguments = parser.parse_args()
    if arguments.install:
        raise SystemExit(0 if install() else 1)
    request_split()
