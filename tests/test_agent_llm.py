import unittest
from unittest.mock import patch, MagicMock

from blu_ai.llm import get_llm


class AgentLlmTest(unittest.TestCase):
    def test_agent_graph_runs_with_declared_dependencies_without_provider_calls(self):
        from langchain_core.language_models.fake_chat_models import FakeListChatModel
        from blu_ai.agents.curator_agent import build_curator_agent

        class ToolCapableFakeModel(FakeListChatModel):
            def bind_tools(self, tools, **kwargs):
                return self

        model = ToolCapableFakeModel(responses=["Resposta controlada"])
        with patch("blu_ai.agents.curator_agent.get_llm", return_value=model):
            graph = build_curator_agent()
            result = graph.invoke({"messages": [("user", "Teste sem fornecedores externos")]})
        self.assertEqual(result["messages"][-1].content, "Resposta controlada")

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


class AgentWeatherTest(unittest.TestCase):
    @patch("blu_ai.tools.weather_tools.fetch_day_weather")
    def test_tool_reuses_portal_weather_and_labels_historical_data(self, weather):
        from blu_ai.tools.weather_tools import get_weather_forecast
        weather.return_value = {"status": "available", "weather": {
            "maxTemp": 27, "minTemp": 17, "isRainy": False, "isHistorical": True,
            "sourceUrl": "https://archive-api.open-meteo.com/v1/archive"}}
        result = get_weather_forecast.invoke({"city": "Évora", "date": "2027-06-15"})
        weather.assert_called_once_with({"date": "2027-06-15", "location": "Évora"})
        self.assertTrue(result["is_historical"])
        self.assertEqual(result["temp_max_c"], 27)
        self.assertNotIn("precipitation_probability", result)
        self.assertIn("não previsão", result["recommendation"])

    @patch("blu_ai.tools.weather_tools.fetch_day_weather")
    def test_unavailable_weather_does_not_invent_temperatures_or_dry_conditions(self, weather):
        from blu_ai.tools.weather_tools import get_weather_forecast
        weather.return_value = {"status": "unavailable", "messagePt": "Indisponível", "messageEn": "Unavailable"}
        result = get_weather_forecast.invoke({"city": "Porto", "date": "2027-06-15"})
        self.assertEqual(result["status"], "unavailable")
        self.assertNotIn("temp_max_c", result)
        self.assertNotIn("is_rainy", result)
        self.assertNotIn("is_climatological_estimate", result)
