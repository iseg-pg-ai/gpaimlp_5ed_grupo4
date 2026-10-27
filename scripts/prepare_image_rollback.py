"""Prepara uma referência anterior assinada, sem atualizar serviços ou dados."""
import argparse
import json
from pathlib import Path
import subprocess

from scripts.image_release import ReleaseError, digest, revision, verify_release
from scripts.publish_image_release import target_uri, aws_json, stored_digest


def prepare(signed, expected_digest, expected_revision, repository_uri, account,
            region="eu-west-1", *, confirm_registry=False):
    expected_digest, expected_revision = digest(expected_digest), revision(expected_revision)
    target_uri(repository_uri, account, region)
    verify_release(signed / "release.json", signed / "release.sigstore.json", signed,
                   expected_digest, expected_revision)
    if confirm_registry:
        if aws_json("sts", "get-caller-identity").get("Account") != account:
            raise ReleaseError("Conta AWS diferente da aprovada.")
        repository = repository_uri.split("/", 1)[1]
        if stored_digest(repository, "git-" + expected_revision, region) != expected_digest:
            raise ReleaseError("A release anterior não está confirmada no ECR.")
    return {"schema_version": 1, "rollback_image_uri": repository_uri + "@" + expected_digest,
            "revision": expected_revision, "registry_confirmed": confirm_registry,
            "deployment_performed": False, "data_compatibility_verified": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--signed", type=Path, required=True)
    parser.add_argument("--digest", required=True)
    parser.add_argument("--revision", required=True)
    parser.add_argument("--repository-uri", required=True)
    parser.add_argument("--account", required=True)
    parser.add_argument("--region", default="eu-west-1")
    parser.add_argument("--confirm-registry", action="store_true")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        value = prepare(args.signed, args.digest, args.revision, args.repository_uri,
                        args.account, args.region, confirm_registry=args.confirm_registry)
    except (ValueError, KeyError, TypeError, OSError, subprocess.SubprocessError):
        parser.exit(1, "Rollback recusado: assinatura, destino ou referência anterior inválida.\n")
    args.output.write_text(json.dumps(value, indent=2) + "\n")


if __name__ == "__main__":
    main()
