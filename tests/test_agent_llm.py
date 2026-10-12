import unittest
from unittest.mock import patch, MagicMock

from blu_ai.llm import get_llm


class AgentLlmTest(unittest.TestCase):
    @patch("langchain_aws.ChatBedrockConverse")
    @patch("blu_ai.llm.boto3.Session")
    def test_uses_default_iam_credentials_and_converse_tools(self, session, model):
        session.return_value.get_credentials.return_value = MagicMock()
        client = session.return_value.client.return_value
        result = get_llm(model_id="eu.amazon.nova-lite-v1:0", temperature=0.1)
        self.assertIs(result, model.return_value)
        self.assertEqual(model.call_args.kwargs["client"], client)
        self.assertEqual(model.call_args.kwargs["temperature"], 0.1)
        self.assertNotIn("aws_access_key_id", session.return_value.client.call_args.kwargs)

    @patch("blu_ai.llm.OPENAI_API_KEY", None)
    @patch("blu_ai.llm.boto3.Session")
    def test_missing_credentials_reports_failure_instead_of_fake_success(self, session):
        session.return_value.get_credentials.return_value = None
        with self.assertRaisesRegex(RuntimeError, "Modelo de IA indisponível"):
            get_llm()
