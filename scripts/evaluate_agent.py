"""Avaliação explícita com casos sintéticos; listar nunca chama o Bedrock."""
import argparse
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]


def evaluate(result, expected):
    from blu_ai.planner import validate_plan
    try:
        plan = validate_plan(result["plan"])
        normalize = lambda groups: sorted(
            (group["dayNumber"], group["itemId"], tuple(sorted(group["catalogIds"]))) for group in groups
        )
        text = json.dumps(plan, ensure_ascii=False).casefold()
        return (plan["actions"] == expected["actions"]
                and normalize(plan.get("alternatives", [])) == normalize(expected.get("alternatives", []))
                and all(marker.casefold() not in text for marker in expected.get("forbiddenText", [])))
    except (KeyError, TypeError, ValueError):
        return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true", help="Requer autorização prévia das chamadas pagas da fase real.")
    parser.add_argument("--list", action="store_true", help="Listar cenários sem fornecedores externos.")
    parser.add_argument("--case", action="append", dest="names", help="Selecionar um cenário; pode repetir-se.")
    parser.add_argument("--model", help="Perfil Bedrock a avaliar, sem fallback.")
    args = parser.parse_args()
    cases = json.loads((ROOT / "tests/agent_cases.json").read_text(encoding="utf-8"))
    if args.names:
        unknown = set(args.names) - {case["name"] for case in cases}
        if unknown:
            parser.error("Casos desconhecidos: " + ", ".join(sorted(unknown)))
        cases = [case for case in cases if case["name"] in args.names]
    if args.list:
        print(json.dumps([{key: case[key] for key in ("name", "category", "operation", "language")} for case in cases], ensure_ascii=False))
        return 0
    if not args.live:
        parser.error("A avaliação real exige --live e aprovação da fase com custos AWS.")
    if args.model:
        os.environ["BEDROCK_MODEL_ID"] = args.model
    sys.path.insert(0, str(ROOT / "src"))
    from blu_ai.planner import AgentResponseError, failure_code, plan_actions
    from blu_ai.providers import ProviderResponseError
    results = []
    for case in cases:
        metadata = {key: case[key] for key in ("name", "category", "operation", "language")}
        try:
            result = plan_actions(case["request"])
            passed = evaluate(result, case["expected"])
            results.append({**metadata, "passed": passed,
                            **({"diagnosticPlan": result["plan"]} if not passed else {}),
                            **{key: result[key] for key in ("provider", "modelId", "latencyMs", "inputTokens", "outputTokens")}})
        except Exception as error:
            results.append({**metadata, "passed": False, "code": failure_code(error),
                            **({"diagnostic": str(error.__cause__ or error)}
                               if isinstance(error, (AgentResponseError, ProviderResponseError))
                               else {})})
    print(json.dumps(results, ensure_ascii=False))
    return 0 if all(result["passed"] for result in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
