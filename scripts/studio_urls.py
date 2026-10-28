# Descobre e normaliza o URL do Space atual para evitar ligações copiadas de outro workspace.
"""Endereços das interfaces resolvidos para o workspace Code Editor atual."""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from urllib.parse import urlsplit

CONFIG = Path(__file__).resolve().parents[1] / "config/studio.local.json"
INTERFACES = json.loads((CONFIG.parent / "workspace_interfaces.json").read_text())
METADATA = Path("/opt/ml/metadata/resource-metadata.json")


def normalize_studio_url(raw: str) -> str:
    """Validar o URL público do Code Editor, sem fixar domínio, região ou workspace."""
    value = raw.strip().rstrip("/")
    parsed = urlsplit(value)
    labels = (parsed.hostname or "").split(".")
    valid_host = len(labels) == 5 and labels[1] == "studio" and labels[-2:] == ["sagemaker", "aws"]
    if (parsed.scheme != "https" or not valid_host or parsed.username or parsed.password
            or parsed.port or parsed.query or parsed.fragment
            or re.fullmatch(r"/codeeditor/[A-Za-z0-9_-]+", parsed.path) is None):
        raise ValueError("Usar o URL AWS do Studio terminado em /codeeditor/NOME, sem portas ou parâmetros.")
    return value


# Descobrir o domínio do Space em execução sem reutilizar um identificador de outro ambiente.
def studio_base() -> str:
    if METADATA.is_file():
        metadata = json.loads(METADATA.read_text())
        if metadata.get("AppType") == "CodeEditor":
            # A API devolve o URL do Space atual. Um ficheiro copiado de outro
            # workspace nunca deve prevalecer sobre a identidade deste ambiente.
            import boto3
            region = metadata["ResourceArn"].split(":")[3]
            from botocore.config import Config
            try:
                response = boto3.client("sagemaker", region_name=region,
                    config=Config(connect_timeout=5, read_timeout=5, retries={"max_attempts": 1})).describe_space(
                        DomainId=metadata["DomainId"], SpaceName=metadata["SpaceName"])
                return normalize_studio_url(response["Url"])
            except Exception as error:
                raise ValueError("Não foi possível resolver o workspace atual por DescribeSpace. Verifique o acesso sagemaker:DescribeSpace; não será usado um URL antigo.") from error
    try:
        return normalize_studio_url(json.loads(CONFIG.read_text())["base_url"])
    except FileNotFoundError as error:
        raise ValueError("Configuração Studio ausente. Executar: python3 scripts/setup_workspace.py") from error


def dashboard_url(port: int, path: str = "", *, base: str | None = None) -> str:
    if not 1 <= port <= 65535:
        raise ValueError("Porta inválida.")
    if path and (not path.startswith("/") or path.startswith("//")
                 or "?" in path or "#" in path or ".." in path.split("/")):
        raise ValueError("Usar um caminho local iniciado por /, sem parâmetros ou fragmentos.")
    return f"{base or studio_base()}/ports/{port}{path or '/'}"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin", action="store_true")
    parser.add_argument("--base", action="store_true")
    parser.add_argument("--port", type=int)
    parser.add_argument("--path", default="")
    args = parser.parse_args()
    base = studio_base()
    if args.origin:
        parsed = urlsplit(base)
        print(f"{parsed.scheme}://{parsed.netloc}")
    elif args.base:
        print(base)
    elif args.port is not None:
        print(dashboard_url(args.port, args.path, base=base))
    else:
        for service in INTERFACES:
            print(f"{service['label']}: {dashboard_url(service['port'], base=base)}")


if __name__ == "__main__":
    main()
