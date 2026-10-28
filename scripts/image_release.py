# Valida a identidade da revisão e a evidência da imagem usada na preparação de uma entrega.
"""Associa evidência ao digest e verifica a assinatura da identidade de release."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

POLICY = Path(__file__).resolve().parents[1] / "config/image_signing_policy.json"
FILES = ("delivery.json", "sbom.json", "provenance.json")


class ReleaseError(ValueError):
    """A release não satisfaz a política de aceitação."""


def policy():
    rules = json.loads(POLICY.read_text())
    rules["certificate_identity"] = (f"https://github.com/{rules['repository']}/"
                                     f"{rules['signing_workflow']}@refs/heads/{rules['branch']}")
    return rules


def digest(value):
    if not isinstance(value, str) or not re.fullmatch(r"sha256:[a-f0-9]{64}", value):
        raise ReleaseError("Digest inválido.")
    return value


def revision(value):
    if not isinstance(value, str) or not re.fullmatch(r"[a-f0-9]{40}", value):
        raise ReleaseError("Revisão inválida.")
    return value


def _validate_run(run, expected_workflow, event):
    rules = policy()
    if (run.get("status") != "completed" or run.get("conclusion") != "success"
            or run.get("event") != event or run.get("head_branch") != rules["branch"]
            or run.get("path") != expected_workflow
            or run.get("repository", {}).get("full_name") != rules["repository"]
            or run.get("head_repository", {}).get("full_name") != rules["repository"]
            or type(run.get("id")) is not int or run["id"] <= 0):
        raise ReleaseError("O build não pertence ao fluxo de release aprovado.")
    return revision(run.get("head_sha"))


def validate_run(run):
    return _validate_run(run, policy()["source_workflow"], "push")


def validate_signing_run(run):
    return _validate_run(run, policy()["signing_workflow"], "workflow_dispatch")


def evidence_hashes(directory):
    result = {}
    for name in FILES:
        path = directory / name
        if path.is_symlink() or not path.is_file() or path.stat().st_size > 32 * 1024 * 1024:
            raise ReleaseError("Evidência ausente ou inválida.")
        result[name] = "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()
    return result


def validate_environment(value):
    if not any(rule.get("type") == "required_reviewers" and rule.get("reviewers")
               and rule.get("prevent_self_review") is True
               for rule in value.get("protection_rules", [])):
        raise ReleaseError("O ambiente exige revisores e prevenção de autoaprovação.")


# Relacionar revisão, imagem e evidência para permitir a verificação posterior da entrega.
def create_statement(directory, run):
    commit = validate_run(run)
    hashes = evidence_hashes(directory)
    report = json.loads((directory / "delivery.json").read_text())
    if (report.get("schema_version") != 1 or report.get("revision") != commit
            or report.get("platform") != "linux/amd64"
            or report.get("signature_verified") is not False or report.get("smoke_verified") is not True):
        raise ReleaseError("Relatório de entrega incompatível.")
    rules = policy()
    return {
        "schema_version": 1, "purpose": "blu-curation-release",
        "repository": rules["repository"], "branch": rules["branch"],
        "source_workflow": rules["source_workflow"], "source_run_id": run["id"],
        "revision": commit, "build_digest": digest(report.get("build_digest")),
        "platform_digest": digest(report.get("platform_digest")), "evidence": hashes,
    }


def verify_release(statement, bundle, directory, expected_digest, expected_revision, cosign="cosign"):
    # Os valores esperados vêm da entrega a promover, nunca da assinatura recebida.
    expected_digest, expected_revision = digest(expected_digest), revision(expected_revision)
    rules = policy()
    subprocess.run([
        cosign, "verify-blob", "--bundle", str(bundle),
        "--certificate-identity", rules["certificate_identity"],
        "--certificate-oidc-issuer", rules["oidc_issuer"], str(statement),
    ], check=True, capture_output=True, timeout=90)
    value = json.loads(statement.read_text())
    if (value.get("schema_version") != 1 or value.get("purpose") != "blu-curation-release"
            or value.get("repository") != rules["repository"]
            or value.get("branch") != rules["branch"]
            or value.get("source_workflow") != rules["source_workflow"]
            or value.get("build_digest") != expected_digest
            or value.get("revision") != expected_revision
            or type(value.get("source_run_id")) is not int or value["source_run_id"] <= 0
            or value.get("evidence") != evidence_hashes(directory)):
        raise ReleaseError("A assinatura não corresponde à entrega esperada.")
    report = json.loads((directory / "delivery.json").read_text())
    if (report.get("build_digest") != expected_digest or report.get("revision") != expected_revision
            or report.get("platform_digest") != digest(value.get("platform_digest"))
            or report.get("platform") != "linux/amd64" or report.get("smoke_verified") is not True):
        raise ReleaseError("Os metadados diferem da entrega assinada.")
    return {"signature_verified": True, "build_digest": expected_digest,
            "revision": expected_revision, "certificate_identity": rules["certificate_identity"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="operation", required=True)
    source = sub.add_parser("source")
    source.add_argument("--run", type=Path, required=True)
    source.add_argument("--signing", action="store_true")
    source.add_argument("--environment", type=Path, required=True)
    prepare = sub.add_parser("prepare")
    prepare.add_argument("--run", type=Path, required=True)
    prepare.add_argument("--digest", required=True)
    prepare.add_argument("--evidence", type=Path, required=True)
    prepare.add_argument("--output", type=Path, required=True)
    verify = sub.add_parser("verify")
    verify.add_argument("--statement", type=Path, required=True)
    verify.add_argument("--bundle", type=Path, required=True)
    verify.add_argument("--evidence", type=Path, required=True)
    verify.add_argument("--digest", required=True)
    verify.add_argument("--revision", required=True)
    verify.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        if args.operation == "source":
            validate_environment(json.loads(args.environment.read_text()))
            print((validate_signing_run if args.signing else validate_run)(json.loads(args.run.read_text())))
            return
        if args.operation == "prepare":
            result = create_statement(args.evidence, json.loads(args.run.read_text()))
            if result["build_digest"] != digest(args.digest):
                raise ReleaseError("O build não corresponde ao digest aprovado.")
        else:
            result = verify_release(args.statement, args.bundle, args.evidence, args.digest, args.revision)
        args.output.write_text(json.dumps(result, sort_keys=True, indent=2) + "\n")
    except (ReleaseError, KeyError, ValueError, TypeError, OSError, subprocess.SubprocessError):
        parser.exit(1, "Release recusada: origem, assinatura ou evidência inválida.\n")


if __name__ == "__main__":
    main()
