# Confirma os contratos da entrega da imagem antes de permitir que seja apresentada como
# candidata válida.
"""Valida uma entrega OCI e conserva evidência, sem extrair ou executar a imagem."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import tarfile


class DeliveryError(ValueError):
    """A entrega não satisfaz o contrato de integridade e rastreabilidade."""


def verify(archive: Path, expected_digest: str, revision: str) -> tuple[dict, dict]:
    if not re.fullmatch(r"sha256:[a-f0-9]{64}", expected_digest):
        raise DeliveryError("Digest de build inválido.")
    if not re.fullmatch(r"[a-f0-9]{40}", revision):
        raise DeliveryError("Revisão Git inválida.")
    with tarfile.open(archive, "r:*") as bundle:
        def read(name):
            member = bundle.getmember(name)
            if not member.isfile() or member.size > 32 * 1024 * 1024:
                raise DeliveryError("Metadados OCI inválidos ou demasiado grandes.")
            return bundle.extractfile(member).read()

        def blob(descriptor):
            digest = descriptor.get("digest", "")
            if not re.fullmatch(r"sha256:[a-f0-9]{64}", digest):
                raise DeliveryError("Digest OCI inválido.")
            data = read("blobs/sha256/" + digest.split(":")[1])
            if len(data) != descriptor.get("size") or hashlib.sha256(data).hexdigest() != digest[7:]:
                raise DeliveryError("Integridade dos metadados OCI inválida.")
            return json.loads(data)

        index_data = read("index.json")
        index = json.loads(index_data)
        roots = index.get("manifests", [])
        if len(roots) != 1:
            raise DeliveryError("A entrega deve conter uma única raiz OCI.")
        root = roots[0]
        if expected_digest not in (root.get("digest"), "sha256:" + hashlib.sha256(index_data).hexdigest()):
            raise DeliveryError("O arquivo não corresponde ao digest emitido pelo build.")
        manifest = blob(root)
        manifests = manifest.get("manifests", [])
        images = [d for d in manifests if d.get("platform", {}).get("os") == "linux"
                  and d.get("platform", {}).get("architecture") == "amd64"]
        attestations = [d for d in manifests if d.get("annotations", {}).get(
            "vnd.docker.reference.type") == "attestation-manifest"]
        if len(images) != 1 or len(manifests) != len(images) + len(attestations):
            raise DeliveryError("É exigida uma única imagem linux/amd64.")
        image_descriptor = images[0]
        image_digest = image_descriptor["digest"]
        image = blob(image_descriptor)
        config = blob(image["config"])
        if config.get("os") != "linux" or config.get("architecture") != "amd64":
            raise DeliveryError("Plataforma da configuração inválida.")
        if config.get("config", {}).get("Labels", {}).get("org.opencontainers.image.revision") != revision:
            raise DeliveryError("A revisão da imagem difere da revisão aprovada.")
        # Os layers grandes são verificados por streaming, sem os descomprimir.
        for layer in image["layers"]:
            digest = layer.get("digest", "")
            if not re.fullmatch(r"sha256:[a-f0-9]{64}", digest):
                raise DeliveryError("Digest de layer inválido.")
            member = bundle.getmember("blobs/sha256/" + digest[7:])
            if not member.isfile() or member.size != layer.get("size"):
                raise DeliveryError("Tamanho do layer inválido.")
            checksum = hashlib.sha256()
            with bundle.extractfile(member) as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    checksum.update(chunk)
            if checksum.hexdigest() != digest[7:]:
                raise DeliveryError("Integridade do layer inválida.")
        statements = []
        for descriptor in attestations:
            if descriptor.get("annotations", {}).get("vnd.docker.reference.digest") != image_digest:
                raise DeliveryError("Atestação associada a outra imagem.")
            for layer in blob(descriptor).get("layers", []):
                statement = blob(layer)
                subjects = statement.get("subject", [])
                if not subjects or any(s.get("digest", {}).get("sha256") != image_digest[7:] for s in subjects):
                    raise DeliveryError("Subject da atestação difere da imagem.")
                statements.append(statement)
        sboms = [s["predicate"] for s in statements if s.get("predicateType") == "https://spdx.dev/Document"]
        provenance = [s for s in statements if s.get("predicateType") in (
            "https://slsa.dev/provenance/v0.2", "https://slsa.dev/provenance/v1")]
        if len(sboms) != 1 or len(provenance) != 1:
            raise DeliveryError("São exigidas uma SBOM SPDX e uma proveniência SLSA.")
        sbom = sboms[0]
        if not sbom.get("spdxVersion", "").startswith("SPDX-2.") or not sbom.get("packages"):
            raise DeliveryError("SBOM vazia ou incompatível.")
        report = {
            "schema_version": 1, "build_digest": expected_digest,
            "platform_digest": image_digest, "config_digest": image["config"]["digest"], "revision": revision,
            "platform": "linux/amd64", "packages": len(sbom["packages"]),
            "compressed_layers_bytes": sum(d["size"] for d in image["layers"]),
            "oci_archive_bytes": archive.stat().st_size,
            "signature_verified": False, "smoke_verified": False,
        }
        return report, {"sbom": sbom, "provenance": provenance[0]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--digest", required=True)
    parser.add_argument("--revision", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        report, evidence = verify(args.archive, args.digest, args.revision)
    except (DeliveryError, KeyError, ValueError, TypeError, OSError, tarfile.TarError):
        parser.exit(1, "Entrega OCI recusada: integridade ou contrato de metadados inválido.\n")
    args.output.mkdir(parents=True, exist_ok=True)
    for name, value in {"delivery": report, **evidence}.items():
        (args.output / f"{name}.json").write_text(json.dumps(value, indent=2) + "\n")
    print(f"Entrega OCI validada: {report['packages']} pacotes; assinatura ainda não validada.")


if __name__ == "__main__":
    main()
