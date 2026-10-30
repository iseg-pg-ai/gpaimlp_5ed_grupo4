"""Ensaios de publicação com AWS e transferência simuladas, sem efeitos externos."""
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from scripts.image_release import ReleaseError
from scripts.publish_image_release import publish, target_uri, copy_archive

DIGEST = "sha256:" + "a" * 64
REVISION = "b" * 40
ACCOUNT = "123456789012"
URI = ACCOUNT + ".dkr.ecr.eu-west-1.amazonaws.com/blu-curation"


class PublishTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "delivery.json").write_text(json.dumps({"platform_digest": DIGEST}))
        for name in ["verify_release", "verify", "aws_json", "stored_digest", "copy_archive"]:
            mock = patch("scripts.publish_image_release." + name)
            setattr(self, name, mock.start())
            self.addCleanup(mock.stop)
        self.verify.return_value = ({"platform_digest": DIGEST}, {})
        self.aws_json.side_effect = [{"Account": ACCOUNT}, {"repositories": [
            {"repositoryUri": URI, "imageTagMutability": "IMMUTABLE"}]}]
        self.stored_digest.side_effect = [None, DIGEST]

    def call(self, **kwargs):
        return publish(self.root / "image.tar", self.root, DIGEST, REVISION, URI, ACCOUNT, **kwargs)

    def test_default_is_preflight_without_aws_calls(self):
        self.assertFalse(self.call()["published"])
        self.aws_json.assert_not_called()
        self.copy_archive.assert_not_called()

    def test_invalid_signature_stops_before_aws(self):
        self.verify_release.side_effect = ReleaseError("assinatura")
        with self.assertRaises(ReleaseError):
            self.call(execute=True)
        self.aws_json.assert_not_called()

    def test_wrong_archive_stops_before_aws(self):
        self.verify.side_effect = ValueError("arquivo")
        with self.assertRaises(ValueError):
            self.call(execute=True)
        self.aws_json.assert_not_called()

    def test_publish_confirms_digest_without_deployment(self):
        result = self.call(execute=True)
        self.assertTrue(result["published"])
        self.assertFalse(result["deployment_performed"])
        self.assertEqual(result["image_uri"], URI + "@" + DIGEST)
        self.copy_archive.assert_called_once()

    def test_wrong_account_is_refused(self):
        self.aws_json.side_effect = [{"Account": "999999999999"}]
        with self.assertRaises(ReleaseError):
            self.call(execute=True)
        self.copy_archive.assert_not_called()

    def test_mutable_repository_is_refused(self):
        self.aws_json.side_effect = [{"Account": ACCOUNT}, {"repositories": [
            {"repositoryUri": URI, "imageTagMutability": "MUTABLE"}]}]
        with self.assertRaises(ReleaseError):
            self.call(execute=True)
        self.copy_archive.assert_not_called()

    def test_tag_collision_is_refused(self):
        self.stored_digest.side_effect = ["sha256:" + "c" * 64]
        with self.assertRaises(ReleaseError):
            self.call(execute=True)
        self.copy_archive.assert_not_called()

    def test_existing_approved_image_is_idempotent(self):
        self.stored_digest.side_effect = [DIGEST, DIGEST]
        self.assertTrue(self.call(execute=True)["already_present"])
        self.copy_archive.assert_not_called()

    def test_changed_digest_after_copy_is_refused(self):
        self.stored_digest.side_effect = [None, "sha256:" + "c" * 64]
        with self.assertRaises(ReleaseError):
            self.call(execute=True)

    def test_other_registry_or_region_is_refused(self):
        for uri in ["public.example/image", URI + ":latest", URI.replace(ACCOUNT, "999999999999")]:
            with self.assertRaises(ReleaseError):
                target_uri(uri, ACCOUNT, "eu-west-1")
        with self.assertRaises(ReleaseError):
            target_uri(URI, ACCOUNT, "us-east-1")


class StoredDigestTests(unittest.TestCase):
    def test_registry_results_distinguish_missing_image_from_other_failures(self):
        from scripts.publish_image_release import stored_digest
        with patch("scripts.publish_image_release.aws_json") as aws:
            aws.return_value = {"images": [{"imageId": {"imageDigest": DIGEST}}], "failures": []}
            self.assertEqual(stored_digest("repo", "tag", "eu-west-1"), DIGEST)
            aws.return_value = {"images": [], "failures": [{"failureCode": "ImageNotFound"}]}
            self.assertIsNone(stored_digest("repo", "tag", "eu-west-1"))
            for response in [{"images": [], "failures": []},
                             {"images": [], "failures": [{"failureCode": "OtherFailure"}]}]:
                aws.return_value = response
                with self.assertRaises(ReleaseError):
                    stored_digest("repo", "tag", "eu-west-1")


class TransferTests(unittest.TestCase):
    def test_transfer_preserves_all_manifests_and_password_uses_stdin(self):
        with tempfile.TemporaryDirectory() as root, patch("scripts.publish_image_release.subprocess.run") as run:
            run.return_value = subprocess.CompletedProcess([], 0, stdout=b"temporary-test-token")
            copy_archive(Path(root) / "image.tar", "registry.example", "registry.example/image:git-test", "eu-west-1")
            login = run.call_args_list[1]
            self.assertEqual(login.kwargs["input"], b"temporary-test-token")
            self.assertNotIn("temporary-test-token", login.args[0])
            command = run.call_args_list[2].args[0]
            self.assertIn("--all", command)
            self.assertIn("--preserve-digests", command)


class PolicyAndRollbackTests(unittest.TestCase):
    def test_policy_limits_resources_and_does_not_allow_deletion(self):
        from scripts.prepare_ecr_policy import permission_policy
        value = permission_policy(URI, ACCOUNT, "eu-west-1")
        statements = value["Statement"]
        self.assertEqual(statements[0]["Action"], ["ecr:GetAuthorizationToken"])
        self.assertEqual(statements[1]["Resource"], f"arn:aws:ecr:eu-west-1:{ACCOUNT}:repository/blu-curation")
        self.assertFalse(any("Delete" in action or "Create" in action or action == "*"
                             for rule in statements for action in rule["Action"]))

    def test_rollback_requires_signature_and_never_changes_services(self):
        from scripts.prepare_image_rollback import prepare
        with patch("scripts.prepare_image_rollback.verify_release") as signature, \
             patch("scripts.prepare_image_rollback.aws_json") as aws, \
             patch("scripts.prepare_image_rollback.stored_digest") as stored:
            result = prepare(Path("/unused"), DIGEST, REVISION, URI, ACCOUNT)
            signature.assert_called_once()
            aws.assert_not_called()
            self.assertFalse(result["registry_confirmed"])
            self.assertFalse(result["deployment_performed"])
            self.assertFalse(result["data_compatibility_verified"])
            aws.return_value = {"Account": ACCOUNT}
            stored.return_value = DIGEST
            self.assertTrue(prepare(Path("/unused"), DIGEST, REVISION, URI, ACCOUNT,
                                    confirm_registry=True)["registry_confirmed"])
            stored.return_value = None
            with self.assertRaises(ReleaseError):
                prepare(Path("/unused"), DIGEST, REVISION, URI, ACCOUNT, confirm_registry=True)
            signature.side_effect = ReleaseError("assinatura")
            with self.assertRaises(ReleaseError):
                prepare(Path("/unused"), DIGEST, REVISION, URI, ACCOUNT)


if __name__ == "__main__":
    unittest.main()
