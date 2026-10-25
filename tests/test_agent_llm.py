"""Regressões do percurso único do agente."""

import unittest

from blu_ai.agents import curator_agent


class AgentAuthorityTest(unittest.TestCase):
    def test_legacy_langgraph_builder_is_not_exposed(self):
        self.assertFalse(hasattr(curator_agent, "build_curator_agent"))

    def test_autonomous_generation_is_rejected(self):
        with self.assertRaisesRegex(RuntimeError, "descontinuada"):
            curator_agent.curate_itinerary({})


if __name__ == "__main__":
    unittest.main()
