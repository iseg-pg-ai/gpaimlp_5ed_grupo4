# Publica uma imagem identificada e verifica o digest remoto para relacionar o artefacto com
# a entrega.
"""Publica bytes OCI assinados, sem criar recursos nem alterar serviços ECS."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import subprocess
import tempfile
import tarfile

from scripts.image_release import ReleaseError, digest, revision, verify_release
from scripts.verify_image_delivery import verify


def target_uri(value, account, region):
    if not re.fullmatch(r"[0-9]{12}", account) or region != "eu-west-1":
        raise ReleaseError("Conta ou região alvo inválida.")
    registry = f"{account}.dkr.ecr.{region}.amazonaws.com"
    match = re.fullmatch(re.escape(registry) + r"/([a-z0-9]+(?:[._/-][a-z0-9]+)*)", value)
    if not match or len(match[1]) > 256:
        raise ReleaseError("O repositório não pertence ao ECR aprovado.")
    return registry, match[1]


def aws_json(*args):
    result = subprocess.run(["aws", *args, "--output", "json"], check=True,
                            capture_output=True, timeout=90)
    return json.loads(result.stdout)


def stored_digest(repository, tag, region):
    result = aws_json("ecr", "batch-get-image", "--repository-name", repository,
                      "--image-ids", "imageTag=" + tag, "--region", region)
    images, failures = result.get("images", []), result.get("failures", [])
    if len(images) == 1 and not failures:
        return digest(images[0]["imageId"]["imageDigest"])
    if not images and len(failures) == 1 and failures[0].get("failureCode") == "ImageNotFound":
        return None
    raise ReleaseError("Não foi possível confirmar o digest no ECR.")


def copy_archive(archive, registry, destination, region):
    password = subprocess.run(["aws", "ecr", "get-login-password", "--region", region],
                              check=True, capture_output=True, timeout=90).stdout
    with tempfile.TemporaryDirectory(prefix="blu-ecr-auth-") as folder:
        auth = str(Path(folder) / "auth.json")
        subprocess.run(["skopeo", "login", "--authfile", auth, "--username", "AWS",
                        "--password-stdin", registry], input=password, check=True,
                       capture_output=True, timeout=90)
        subprocess.run(["skopeo", "copy", "--all", "--preserve-digests", "--authfile", auth,
                        "oci-archive:" + str(archive.resolve()), "docker://" + destination],
                       check=True, capture_output=True, timeout=1200)


# Confirmar o digest publicado para evitar promover apenas uma etiqueta mutável.
def publish(archive, signed, expected_digest, expected_revision, repository_uri,
            account, region="eu-west-1", *, execute=False):
    expected_digest, expected_revision = digest(expected_digest), revision(expected_revision)
    registry, repository = target_uri(repository_uri, account, region)
    # Nenhuma chamada AWS ocorre antes de validar assinatura, evidência e bytes.
    verify_release(signed / "release.json", signed / "release.sigstore.json", signed,
                   expected_digest, expected_revision)
    image, _ = verify(archive, expected_digest, expected_revision)
    evidence = json.loads((signed / "delivery.json").read_text())
    if image["platform_digest"] != evidence["platform_digest"]:
        raise ReleaseError("O arquivo difere da plataforma assinada.")
    tag = "git-" + expected_revision
    result = {"schema_version": 1, "image_uri": repository_uri + "@" + expected_digest,
              "tag": tag, "revision": expected_revision, "published": False,
              "deployment_performed": False}
    if not execute:
        return result
    if aws_json("sts", "get-caller-identity").get("Account") != account:
        raise ReleaseError("A identidade AWS não pertence à conta aprovada.")
    repositories = aws_json("ecr", "describe-repositories", "--repository-names", repository,
                            "--region", region).get("repositories", [])
    if (len(repositories) != 1 or repositories[0].get("repositoryUri") != repository_uri
            or repositories[0].get("imageTagMutability") != "IMMUTABLE"):
        raise ReleaseError("O ECR exige um repositório existente com tags imutáveis.")
    previous = stored_digest(repository, tag, region)
    if previous and previous != expected_digest:
        raise ReleaseError("A tag imutável já identifica outra imagem.")
    if previous is None:
        copy_archive(archive, registry, repository_uri + ":" + tag, region)
    if stored_digest(repository, tag, region) != expected_digest:
        raise ReleaseError("O digest publicado não corresponde ao aprovado; promoção bloqueada.")
    return {**result, "published": True, "already_present": previous == expected_digest}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", required=True, type=Path)
    parser.add_argument("--signed", required=True, type=Path)
    parser.add_argument("--digest", required=True)
    parser.add_argument("--revision", required=True)
    parser.add_argument("--repository-uri", required=True)
    parser.add_argument("--account", required=True)
    parser.add_argument("--region", default="eu-west-1")
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    try:
        result = publish(args.archive, args.signed, args.digest, args.revision,
                         args.repository_uri, args.account, args.region, execute=args.execute)
    except (ValueError, KeyError, TypeError, OSError, tarfile.TarError, subprocess.SubprocessError):
        parser.exit(1, "Publicação recusada: assinatura, bytes, destino ou confirmação ECR inválidos.\n")
    args.output.write_text(json.dumps(result, indent=2) + "\n")


if __name__ == "__main__":
    main()
