"""Ensaios OCI sintéticos: hashes, revisão e ligação das atestações à imagem."""
import hashlib
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest

from scripts.verify_image_delivery import DeliveryError, verify

REVISION = "a" * 40


def fixture(path, *, revision=REVISION, subject=None, sbom=True, corrupt=False):
    files = {}

    def raw(data):
        digest = "sha256:" + hashlib.sha256(data).hexdigest()
        files["blobs/sha256/" + digest[7:]] = data
        return {"digest": digest, "size": len(data)}

    def blob(value):
        return raw(json.dumps(value).encode())

    config = blob({"os": "linux", "architecture": "amd64", "config": {
        "Labels": {"org.opencontainers.image.revision": revision}}})
    layer = raw(b"conteudo sintetico")
    image = blob({"config": config, "layers": [layer]})
    image["platform"] = {"os": "linux", "architecture": "amd64"}
    subjects = [{"name": "imagem", "digest": {"sha256": subject or image["digest"][7:]}}]
    layers = [blob({"subject": subjects, "predicateType": "https://slsa.dev/provenance/v0.2",
                    "predicate": {"buildType": "buildkit"}})]
    if sbom:
        layers.append(blob({"subject": subjects, "predicateType": "https://spdx.dev/Document",
                            "predicate": {"spdxVersion": "SPDX-2.3", "packages": [{"name": "teste"}]}}))
    attestation = blob({"layers": layers})
    attestation["annotations"] = {"vnd.docker.reference.type": "attestation-manifest",
                                  "vnd.docker.reference.digest": image["digest"]}
    root = blob({"manifests": [image, attestation]})
    files["index.json"] = json.dumps({"manifests": [root]}).encode()
    if corrupt:
        files["blobs/sha256/" + layer["digest"][7:]] = b"X" * layer["size"]
    with tarfile.open(path, "w") as archive:
        for name, data in files.items():
            member = tarfile.TarInfo(name)
            member.size = len(data)
            archive.addfile(member, io.BytesIO(data))
    return root["digest"]


class DeliveryTests(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.TemporaryDirectory()
        self.addCleanup(self.root.cleanup)
        self.archive = Path(self.root.name) / "image.tar"

    def test_valid_evidence_is_not_claimed_as_a_signature(self):
        digest = fixture(self.archive)
        report, evidence = verify(self.archive, digest, REVISION)
        self.assertFalse(report["signature_verified"])
        self.assertEqual(report["compressed_layers_bytes"], len(b"conteudo sintetico"))
        self.assertEqual(evidence["sbom"]["packages"][0]["name"], "teste")

    def test_wrong_build_digest_is_refused(self):
        fixture(self.archive)
        with self.assertRaises(DeliveryError):
            verify(self.archive, "sha256:" + "0" * 64, REVISION)

    def test_wrong_revision_is_refused(self):
        digest = fixture(self.archive, revision="b" * 40)
        with self.assertRaises(DeliveryError):
            verify(self.archive, digest, REVISION)

    def test_foreign_attestation_is_refused(self):
        digest = fixture(self.archive, subject="b" * 64)
        with self.assertRaises(DeliveryError):
            verify(self.archive, digest, REVISION)

    def test_missing_sbom_is_refused(self):
        digest = fixture(self.archive, sbom=False)
        with self.assertRaises(DeliveryError):
            verify(self.archive, digest, REVISION)

    def test_corrupted_layer_is_refused(self):
        digest = fixture(self.archive, corrupt=True)
        with self.assertRaises(DeliveryError):
            verify(self.archive, digest, REVISION)


if __name__ == "__main__":
    unittest.main()
