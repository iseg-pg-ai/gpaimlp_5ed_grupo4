"""Sondas de leitura limitadas a serviços locais e metadados publicados."""
from __future__ import annotations

from collections import deque
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import shutil
import threading
import time
from urllib.error import HTTPError
from urllib.request import build_opener, HTTPRedirectHandler, ProxyHandler, Request

from monitoring.alerts import AlertStore
from monitoring.signals import operational_signals


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def probe(name, url, enabled=True):
    if not enabled:
        return {"name": name, "state": "disabled", "latency_ms": None, "http_status": None}
    start = time.monotonic()
    try:
        # Sem proxies do ambiente, redirects, modelos ou APIs de escrita.
        with build_opener(ProxyHandler({}), NoRedirect()).open(
            Request(url, headers={"User-Agent": "BLU-Monitor/1"}), timeout=3
        ) as response:
            status = response.status
        state = "up" if status == 200 else "down"
    except HTTPError as error:
        status, state = error.code, "down"
    except (OSError, ValueError):
        status, state = None, "down"
    return {"name": name, "state": state, "latency_ms": round((time.monotonic() - start) * 1000),
            "http_status": status}


def bounded_json(path):
    if path.stat().st_size > 2_000_000:
        raise ValueError("Metadados demasiado grandes")
    return json.loads(path.read_text())


def warehouse_status(root, max_age_hours=None):
    result = {"state": "unknown", "published_at": None, "age_hours": None,
              "validation": "unknown", "tables": None, "records": None,
              "freshness": "not_configured" if max_age_hours is None else "unknown"}
    try:
        manifest = bounded_json(root / "manifest.json")
        validation = bounded_json(root / "validation_report.json")
        published = datetime.fromisoformat(manifest["ran_at_utc"])
        if published.tzinfo is None:
            raise ValueError("Data sem timezone")
        age = (datetime.now(timezone.utc) - published).total_seconds() / 3600
        if age < -0.1:
            raise ValueError("Data no futuro")
        tables = validation["tables"]
        valid = validation["status"] == "passed"
        result.update(published_at=published.isoformat(), age_hours=round(max(0, age), 1),
                      validation="passed" if valid else "failed", tables=len(tables),
                      records=sum(int(row["record_count"]) for row in tables.values()))
        result["freshness"] = ("not_configured" if max_age_hours is None else
                               "fresh" if age <= max_age_hours else "stale")
        result["state"] = "up" if valid else "down"
        if valid and result["freshness"] == "stale":
            result["state"] = "degraded"
    except (OSError, ValueError, KeyError, TypeError, OverflowError):
        result["state"] = "unknown"
    # Apenas agregados; nunca exportar nomes das fontes, registos ou contactos.
    return result


class Collector:
    def __init__(self, root: Path, runtime: Path, config: dict):
        self.root, self.config = root, config
        self.interval = int(config["interval_seconds"])
        if not 10 <= self.interval <= 300:
            raise ValueError("Intervalo entre 10 e 300 segundos.")
        age = config["warehouse_max_age_hours"]
        if age is not None and (not isinstance(age, (int, float)) or age <= 0):
            raise ValueError("Cadência do warehouse inválida.")
        self.lock = threading.Lock()
        self.stop = threading.Event()
        self.samples, self.events = deque(maxlen=240), deque(maxlen=100)
        self.latest = None
        self.previous = {}
        runtime.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.runtime = runtime
        self.alerts = AlertStore(runtime)
        self.logger = logging.Logger("blu-monitor-probes")
        handler = RotatingFileHandler(runtime / "probes.jsonl", maxBytes=1_000_000, backupCount=3)
        os.chmod(runtime / "probes.jsonl", 0o600)
        handler.setFormatter(logging.Formatter("%(message)s"))
        self.logger.addHandler(handler)

    def collect(self):
        definitions = [("Portal BLU", "http://127.0.0.1:3001/catalog", True),
                       ("Observatório analítico", "http://127.0.0.1:8501/_stcore/health", True),
                       ("Apresentação", "http://127.0.0.1:3003/", True),
                       ("Agente IA", "http://127.0.0.1:8000/api/health", self.config["agent_enabled"])]
        with ThreadPoolExecutor(max_workers=4) as pool:
            services = list(pool.map(lambda args: probe(*args), definitions))
        now = datetime.now(timezone.utc).isoformat()
        warehouse = warehouse_status(self.root / "warehouse", self.config["warehouse_max_age_hours"])
        disk = shutil.disk_usage(self.root)
        system = {"disk_free_gb": round(disk.free / 1024**3, 1),
                  "disk_used_pct": round(100 * disk.used / disk.total, 1),
                  "load_1m": round(os.getloadavg()[0], 2) if hasattr(os, "getloadavg") else None}
        snapshot = {"checked_at": now, "interval_seconds": self.interval, "services": services,
                    "warehouse": warehouse, "system": system}
        snapshot["operations"] = operational_signals(self.runtime)
        conditions = {f"service:{item['name']}": item["state"] == "down" for item in services
                      if item["state"] != "disabled"}
        conditions.update({"warehouse": warehouse["state"] in {"down", "degraded"},
                           "disk": system["disk_used_pct"] >= 90,
                           "portal-errors": snapshot["operations"]["portal"]["errors_24h"] > 0,
                           "ai-failures": snapshot["operations"]["ai"]["failures_24h"] > 0,
                           "backup": snapshot["operations"]["backup"]["state"] == "down"})
        snapshot["alerts"] = self.alerts.reconcile(conditions)
        entities = [(x["name"], x["state"]) for x in services] + [("Warehouse", warehouse["state"])]
        with self.lock:
            for name, state in entities:
                if self.previous.get(name) != state:
                    self.events.appendleft({"at": now, "component": name, "state": state})
                self.previous[name] = state
            self.latest = snapshot
            self.samples.append({"at": now, "services": services})
            self.logger.info(json.dumps({"at": now, "component": "monitoring", "operation": "probe_cycle",
                                         "services": services, "warehouse_state": warehouse["state"]}))

    def run(self):
        while not self.stop.is_set():
            try:
                self.collect()
            except Exception:
                # Não registar exceções que possam conter caminhos ou conteúdo operacional.
                with self.lock:
                    self.events.appendleft({"at": datetime.now(timezone.utc).isoformat(),
                                            "component": "Recolha", "state": "down"})
                self.logger.info('{"component":"monitoring","operation":"probe_cycle","state":"failed"}')
            self.stop.wait(self.interval)

    def snapshot(self):
        with self.lock:
            return {"snapshot": self.latest, "history": list(self.samples), "events": list(self.events)}
