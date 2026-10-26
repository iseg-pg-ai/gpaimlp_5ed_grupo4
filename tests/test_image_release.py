"""Política de release, ligação da evidência e assinatura criptográfica local."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from scripts.image_release import (ReleaseError, create_statement, policy,
                                   validate_environment, validate_run, validate_signing_run, verify_release)

REVISION = "a" * 40
DIGEST = "sha256:" + "b" * 64


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        rules = policy()
        self.run = {"id": 123, "status": "completed", "conclusion": "success", "event": "push",
                    "head_branch": rules["branch"], "path": rules["source_workflow"],
                    "head_sha": REVISION, "repository": {"full_name": rules["repository"]},
                    "head_repository": {"full_name": rules["repository"]}}
        report = {"schema_version": 1, "revision": REVISION, "build_digest": DIGEST,
                  "platform_digest": DIGEST, "platform": "linux/amd64", "signature_verified": False}
        for name, data in [("delivery.json", report), ("sbom.json", {"packages": ["test"]}),
                           ("provenance.json", {"predicate": {"test": True}})]:
            (self.root / name).write_text(json.dumps(data))
        self.statement = self.root / "release.json"
        self.statement.write_text(json.dumps(create_statement(self.root, self.run)))
        self.bundle = self.root / "bundle.json"

    def test_only_successful_push_builds_from_dev_are_accepted(self):
        self.assertEqual(validate_run(self.run), REVISION)
        for key, value in [("event", "pull_request"), ("head_branch", "other"),
                           ("conclusion", "failure"), ("path", "other.yml")]:
            with self.subTest(key=key), self.assertRaises(ReleaseError):
                validate_run({**self.run, key: value})
        with self.assertRaises(ReleaseError):
            validate_run({**self.run, "head_repository": {"full_name": "other/repo"}})

    def test_signing_source_must_be_manual_and_from_the_trusted_workflow(self):
        signing = {**self.run, "path": policy()["signing_workflow"], "event": "workflow_dispatch"}
        self.assertEqual(validate_signing_run(signing), REVISION)
        with self.assertRaises(ReleaseError):
            validate_signing_run(self.run)
        with self.assertRaises(ReleaseError):
            validate_signing_run({**signing, "head_branch": "other"})

    def test_environment_requires_review_and_no_self_approval(self):
        for rules in [[], [{"type": "required_reviewers", "reviewers": ["test"]}]]:
            with self.assertRaises(ReleaseError):
                validate_environment({"protection_rules": rules})
        validate_environment({"protection_rules": [{"type": "required_reviewers",
                              "reviewers": ["test"], "prevent_self_review": True}]})

    def test_verifier_requires_exact_identity_and_issuer(self):
        with patch("scripts.image_release.subprocess.run") as command:
            report = verify_release(self.statement, self.bundle, self.root, DIGEST, REVISION)
        self.assertTrue(report["signature_verified"])
        args = command.call_args.args[0]
        self.assertEqual(args[args.index("--certificate-identity") + 1], policy()["certificate_identity"])
        self.assertEqual(args[args.index("--certificate-oidc-issuer") + 1], policy()["oidc_issuer"])
        self.assertNotIn("--certificate-identity-regexp", args)
        self.assertNotIn("--insecure-ignore-tlog", args)
        self.assertNotIn("--insecure-ignore-sct", args)

    def test_cosign_failure_is_not_accepted(self):
        with patch("scripts.image_release.subprocess.run", side_effect=subprocess.CalledProcessError(1, "cosign")):
            with self.assertRaises(subprocess.CalledProcessError):
                verify_release(self.statement, self.bundle, self.root, DIGEST, REVISION)

    def test_unexpected_digest_or_revision_is_refused(self):
        with patch("scripts.image_release.subprocess.run"):
            for digest, revision in [("sha256:" + "c" * 64, REVISION), (DIGEST, "d" * 40)]:
                with self.assertRaises(ReleaseError):
                    verify_release(self.statement, self.bundle, self.root, digest, revision)

    def test_changed_evidence_is_refused(self):
        (self.root / "sbom.json").write_text('{}')
        with patch("scripts.image_release.subprocess.run"), self.assertRaises(ReleaseError):
            verify_release(self.statement, self.bundle, self.root, DIGEST, REVISION)

    @unittest.skipUnless(os.environ.get("COSIGN_BINARY"), "Cosign local não selecionado")
    def test_real_local_signature_rejects_tampering(self):
        cosign = os.environ["COSIGN_BINARY"]
        env = {**os.environ, "COSIGN_PASSWORD": ""}
        def call(*args, success=True):
            result = subprocess.run([cosign, *args], cwd=self.root, env=env,
                                    capture_output=True, timeout=90)
            if success:
                self.assertEqual(result.returncode, 0, result.stderr.decode())
            else:
                self.assertNotEqual(result.returncode, 0)
        call("signing-config", "create", "--out", "local-signing.json")
        call("generate-key-pair", "--output-key-prefix", "temporary")
        call("sign-blob", "--yes", "--key", "temporary.key", "--signing-config",
             "local-signing.json", "--bundle", "local-bundle.json", "release.json")
        # Só o ensaio com chave efémera dispensa o log; a release nunca usa esta opção.
        call("verify-blob", "--insecure-ignore-tlog", "--key", "temporary.pub", "--bundle", "local-bundle.json", "release.json")
        self.statement.write_text(self.statement.read_text() + " ")
        call("verify-blob", "--insecure-ignore-tlog", "--key", "temporary.pub", "--bundle", "local-bundle.json", "release.json", success=False)


if __name__ == "__main__":
    unittest.main()
