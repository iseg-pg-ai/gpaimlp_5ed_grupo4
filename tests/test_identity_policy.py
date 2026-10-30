"""Testes do contrato central de identidade e autorização."""
import copy
from pathlib import Path
import unittest

from portal.identity_policy import allows, load_identity_policy


POLICY_PATH = Path(__file__).parents[1] / "config" / "identity_policy.json"


class IdentityPolicyTests(unittest.TestCase):
    def setUp(self):
        self.policy = load_identity_policy(POLICY_PATH)

    def test_roles_are_monotonic_and_owner_has_every_permission(self):
        previous = set()
        for role in self.policy["internal_roles"]:
            current = set(self.policy["roles"][role])
            self.assertLessEqual(previous, current)
            previous = current
        self.assertEqual(previous, set(self.policy["permissions"]))

    def test_curator_can_propose_but_cannot_administer(self):
        self.assertTrue(allows(self.policy, "curator", "agent.propose"))
        self.assertTrue(allows(self.policy, "curator", "agent.approve"))
        self.assertFalse(allows(self.policy, "curator", "users.manage"))
        self.assertFalse(allows(self.policy, "curator", "operations.recover"))

    def test_viewer_and_unknown_values_fail_closed(self):
        self.assertTrue(allows(self.policy, "viewer", "trip.read"))
        self.assertFalse(allows(self.policy, "viewer", "trip.create"))
        self.assertFalse(allows(self.policy, "unknown", "trip.read"))
        self.assertFalse(allows(self.policy, "owner", "unknown.permission"))

    def test_agent_and_frontend_cannot_become_authorities(self):
        constraints = self.policy["constraints"]
        self.assertFalse(constraints["agent_may_elevate_permissions"])
        self.assertFalse(constraints["frontend_is_authoritative"])
        self.assertFalse(constraints["infrastructure_actions_available_to_agent"])
        self.assertTrue(constraints["destructive_actions_require_fresh_confirmation"])

    def test_validator_rejects_privilege_regression(self):
        broken = copy.deepcopy(self.policy)
        broken["roles"]["admin"].remove("agent.propose")
        import json
        import tempfile

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "policy.json"
            path.write_text(json.dumps(broken), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "remove permissões"):
                load_identity_policy(path)


if __name__ == "__main__":
    unittest.main()
