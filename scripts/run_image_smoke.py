"""Importa a plataforma OCI para testes isolados, preservando o arquivo original."""
import argparse
import json
import re
from pathlib import Path
import subprocess
import uuid


def command(args, **kwargs):
    return subprocess.run(args, capture_output=True, text=True, check=kwargs.pop("check", True),
                          timeout=kwargs.pop("timeout", 90), **kwargs)


def run_smoke(archive, delivery, output):
    report = json.loads(delivery.read_text())
    report["smoke_verified"] = False
    report.pop("smoke_checks", None)
    delivery.write_text(json.dumps(report, indent=2) + "\n")
    if not re.fullmatch(r"sha256:[a-f0-9]{64}", report.get("config_digest", "")):
        raise ValueError("Digest da configuração ausente ou inválido.")
    name = "blu-smoke-" + uuid.uuid4().hex
    tag = name + ":test"
    try:
        command(["skopeo", "--override-os", "linux", "--override-arch", "amd64", "copy",
                 "oci-archive:" + str(archive.resolve()), "docker-daemon:" + tag], timeout=300)
        image = json.loads(command(["docker", "image", "inspect", "--format", "{{json .}}", tag]).stdout)
        if image.get("Id") != report.get("config_digest") or image.get("Config", {}).get("User") not in ("blu", "1000", "1000:1000"):
            raise ValueError("A configuração executável não corresponde à imagem verificada.")
        result = command([
            "docker", "run", "--rm", "--name", name, "--network", "none", "--read-only",
            "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
            "--user", "1000:1000", "--workdir", "/app",
            "--tmpfs", "/tmp:rw,nosuid,nodev,size=256m",
            "--tmpfs", "/var/lib/blu:rw,nosuid,nodev,uid=1000,gid=1000,size=256m",
            "--entrypoint", "/app/.venv/bin/python", tag,
            "-B", "-m", "scripts.smoke_curation_image",
        ], timeout=420)
        smoke = json.loads(result.stdout)
        definitions = json.loads((Path(__file__).resolve().parents[1] / "config/curation_services.json").read_text())
        expected = {s["name"] for s in definitions["services"]} | {
            "portal-javascript", "portal-python", "foreign-origin", "monitoring-auth"}
        if (set(smoke.get("checks", [])) != expected or smoke.get("external_network") is not False
                or smoke.get("synthetic_data") is not True or smoke.get("cloud_identity_tested") is not False):
            raise ValueError("Relatório de smoke incompleto.")
        report.update(smoke_verified=True, smoke_checks=smoke["checks"],
                      smoke_cloud_identity_tested=False, smoke_external_network=False)
        delivery.write_text(json.dumps(report, indent=2) + "\n")
        output.write_text(json.dumps(smoke, indent=2) + "\n")
    finally:
        # Só os recursos com o identificador único deste ensaio são removidos.
        command(["docker", "rm", "-f", name], check=False)
        command(["docker", "image", "rm", "-f", tag], check=False)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--delivery", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        run_smoke(args.archive, args.delivery, args.output)
    except subprocess.CalledProcessError as error:
        # Dentro do container só existem dados sintéticos; não expor logs dos serviços.
        if error.cmd[0:2] == ["docker", "run"]:
            print("Smoke de runtime recusado; " + (error.stderr or "sem diagnóstico").strip()[-500:])
        else:
            print("Smoke recusado durante a importação da plataforma OCI.")
        raise SystemExit(1)
    except (ValueError, KeyError, OSError, subprocess.SubprocessError):
        raise SystemExit("Smoke recusado: configuração, execução ou relatório inválido.")


if __name__ == "__main__":
    main()
