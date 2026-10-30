# Verifica o arranque e as respostas da imagem num ambiente de ensaio e termina os processos
# que criou.
"""Smoke interno da imagem, com dados sintéticos e processos descartáveis."""
from __future__ import annotations

import json
import os
from pathlib import Path
import re
import secrets
import signal
import subprocess
import sys
import tempfile
import time
from urllib.error import HTTPError
from urllib.request import build_opener, ProxyHandler, Request

ROOT = Path(__file__).resolve().parents[1]
OPENER = build_opener(ProxyHandler({}))


def request(url, *, data=None, headers=None):
    try:
        response = OPENER.open(Request(url, data=data, headers=headers or {}), timeout=3)
    except HTTPError as response:
        return response.code, response.read()
    with response:
        return response.status, response.read()


def wait_ready(process, url, timeout=60):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError("O serviço terminou antes de ficar disponível.")
        try:
            if request(url)[0] == 200:
                return
        except OSError:
            pass
        time.sleep(0.25)
    raise TimeoutError("O serviço não ficou disponível.")


def stop(process):
    if process.poll() is None:
        os.killpg(process.pid, signal.SIGTERM)
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait(timeout=5)


def smoke():
    definitions = json.loads((ROOT / "config/curation_services.json").read_text())
    if definitions.get("schema_version") != 1:
        raise ValueError("Versão de serviços inválida.")
    checks = []
    processes = []
    logs = []
    with tempfile.TemporaryDirectory(prefix="smoke-", dir="/var/lib/blu") as folder:
        runtime = Path(folder)
        env = {**os.environ,
            "BLU_DATA_DIR": str(runtime / "data"), "BLU_WAREHOUSE_DIR": str(runtime / "warehouse"),
            "BLU_EXPORT_DIR": str(runtime / "exports/itineraries"),
            "BLU_OPERATIONAL_DIR": str(runtime / "operational"),
            "BLU_MONITORING_RUNTIME": str(runtime / "monitoring"),
            "BLU_BACKUP_DIR": str(runtime / "backups"),
            "BLU_IDENTITY_MODE": "disabled", "BLU_DATA_S3_BUCKET": "", "BLU_BACKUP_S3_BUCKET": "",
            "BLU_MONITORING_NOTIFICATIONS_ENABLED": "false", "AWS_EC2_METADATA_DISABLED": "true",
            "BLU_PUBLIC_URL": "http://127.0.0.1:3001", "PORTAL_PUBLIC_ORIGIN": "http://127.0.0.1:3001",
            "BLU_MONITORING_PUBLIC_URL": "https://127.0.0.1:3004",
            "BLU_DASHBOARD_PUBLIC_URL": "https://127.0.0.1", "BLU_PRESENTATION_BASE_PATH": "",
            "BLU_PORTAL_PUBLIC_URL": "http://127.0.0.1:3001", "BLU_BIND_HOST": "127.0.0.1",
            "XDG_CACHE_HOME": str(runtime / "cache"), "XDG_CONFIG_HOME": str(runtime / "config"),
            "STREAMLIT_BROWSER_GATHER_USAGE_STATS": "false", "STREAMLIT_SERVER_FILE_WATCHER_TYPE": "none",
        }
        # Os comandos de preparação não recebem dados de clientes nem credenciais AWS.
        from scripts.create_ci_etl_fixture import create
        from monitoring.security import save_credentials
        create(runtime / "data")
        subprocess.run([sys.executable, "-B", "-m", "etl.pipeline", "--data-dir", env["BLU_DATA_DIR"],
                        "--output-dir", env["BLU_WAREHOUSE_DIR"]], cwd=ROOT, env=env,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True, timeout=60)
        save_credentials(runtime / "monitoring/credentials.json", "smoke-admin", secrets.token_urlsafe(32))
        phase = "startup"
        try:
            for service in definitions["services"]:
                log = (runtime / (service["name"] + ".log")).open("wb")
                logs.append(log)
                process = subprocess.Popen(service["command"], cwd=ROOT, env=env, stdout=log, stderr=log,
                                           start_new_session=True)
                processes.append(process)
                phase = service["name"]
                wait_ready(process, f"http://127.0.0.1:{service['port']}{service['health_path']}")
                checks.append(phase)
            phase = "portal-javascript"
            _, html = request("http://127.0.0.1:3001/")
            assets = re.findall(rb'(?:src|href)="([^"<>]*?/_next/static/[^"<>]+\.js[^"<>]*)"', html)
            if not assets or not assets[0].startswith(b"/") or assets[0].startswith(b"//"):
                raise AssertionError("Asset local ausente.")
            if request("http://127.0.0.1:3001" + assets[0].decode())[0] != 200:
                raise AssertionError("Asset JavaScript indisponível.")
            checks.append(phase)
            phase = "portal-python"
            status, data = request("http://127.0.0.1:3001/api/catalog")
            records = json.loads(data)
            if status != 200 or not isinstance(records, list) or not records:
                raise AssertionError("Adaptador Python indisponível.")
            checks.append(phase)
            phase = "foreign-origin"
            if request("http://127.0.0.1:3001/api/versions", data=b"{}",
                       headers={"Origin": "https://foreign.invalid", "Content-Type": "application/json"})[0] != 403:
                raise AssertionError("Origem externa não foi recusada.")
            checks.append(phase)
            phase = "monitoring-auth"
            if request("http://127.0.0.1:3004/api/status")[0] != 401:
                raise AssertionError("Monitoring sem proteção de sessão.")
            checks.append(phase)
            return {"schema_version": 1, "checks": checks, "external_network": False,
                    "synthetic_data": True, "cloud_identity_tested": False}
        except Exception as error:
            raise RuntimeError(f"Smoke recusado na fase {phase}: {type(error).__name__}") from None
        finally:
            for process in reversed(processes):
                stop(process)
            for log in logs:
                log.close()


if __name__ == "__main__":
    try:
        print(json.dumps(smoke()))
    except Exception as error:
        print(str(error) if isinstance(error, RuntimeError) else "Smoke recusado na preparação.", file=sys.stderr)
        sys.exit(1)
