"""Avaliação explícita do Bedrock com casos sintéticos; não executa alterações."""
import argparse
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]


def evaluate(result, expected):
    plan = result["plan"]
    groups = plan.get("alternatives", [])
    return (plan["actions"] == expected["actions"] and len(groups) == 1
            and groups[0]["itemId"] == expected["targetItemId"]
            and set(groups[0]["catalogIds"]) == set(expected["catalogIds"]))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true", help="Autorizar chamadas pagas apenas com os casos sintéticos versionados.")
    parser.add_argument("--model", help="Perfil Bedrock a avaliar.")
    args = parser.parse_args()
    if not args.live:
        parser.error("A avaliação real exige --live e autorização para os custos AWS.")
    if args.model:
        os.environ["BEDROCK_MODEL_ID"] = args.model
    sys.path.insert(0, str(ROOT / "src"))
    from blu_ai.planner import plan_actions, failure_code

    cases = json.loads((ROOT / "tests/agent_cases.json").read_text(encoding="utf-8"))
    results = []
    for case in cases:
        try:
            result = plan_actions(case["request"])
            results.append({"case": case["name"], "passed": evaluate(result, case["expected"]),
                            **{key: result[key] for key in ("modelId", "latencyMs", "inputTokens", "outputTokens")}})
        except Exception as error:
            results.append({"case": case["name"], "passed": False, "code": failure_code(error)})
    print(json.dumps(results, ensure_ascii=False))
    return 0 if all(item["passed"] for item in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
