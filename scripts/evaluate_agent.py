"""Avaliação explícita do Bedrock com casos sintéticos; não executa alterações."""
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
        groups = plan.get("alternatives", [])
        wanted = expected.get("alternatives", [])
        # A ordem das opções é livre; dias, alvos e duplicados não são.
        normalize = lambda values: sorted(
            (g["dayNumber"], g["itemId"], tuple(sorted(g["catalogIds"]))) for g in values)
        forbidden = expected.get("forbiddenText", [])
        public_text = json.dumps(plan, ensure_ascii=False).casefold()
        return (plan["actions"] == expected["actions"]
                and normalize(groups) == normalize(wanted)
                and plan.get("ranking", []) == expected.get("ranking", [])
                and all(text.casefold() not in public_text for text in forbidden))
    except (KeyError, TypeError, ValueError):
        return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true", help="Autorizar chamadas pagas apenas com os casos sintéticos versionados.")
    parser.add_argument("--model", help="Perfil Bedrock a avaliar.")
    parser.add_argument("--list", action="store_true", help="Listar casos sem chamar a AWS.")
    parser.add_argument("--case", action="append", dest="names", help="Selecionar um caso; pode repetir-se.")
    args = parser.parse_args()
    cases = json.loads((ROOT / "tests/agent_cases.json").read_text(encoding="utf-8"))
    if args.names:
        unknown = set(args.names) - {case["name"] for case in cases}
        if unknown:
            parser.error("Casos desconhecidos: " + ", ".join(sorted(unknown)))
        cases = [case for case in cases if case["name"] in args.names]
    if args.list:
        print(json.dumps([{"case": case["name"], "category": case["category"]}
                          for case in cases], ensure_ascii=False))
        return 0
    if not args.live:
        parser.error("A avaliação real exige --live e autorização para os custos AWS.")
    if args.model:
        os.environ["BEDROCK_MODEL_ID"] = args.model
    sys.path.insert(0, str(ROOT / "src"))
    from blu_ai.planner import plan_actions, failure_code

    results = []
    for case in cases:
        try:
            result = plan_actions(case["request"])
            results.append({"case": case["name"], "category": case["category"], "passed": evaluate(result, case["expected"]),
                            **{key: result[key] for key in ("modelId", "latencyMs", "inputTokens", "outputTokens")}})
        except Exception as error:
            results.append({"case": case["name"], "passed": False, "code": failure_code(error)})
    print(json.dumps(results, ensure_ascii=False))
    return 0 if all(item["passed"] for item in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
