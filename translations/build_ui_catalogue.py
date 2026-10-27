"""Generate checked-in portal translations with the installed offline models."""
import json
import argparse
from pathlib import Path
from ui_catalogue_sources import collect_sources


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--overrides-only", action="store_true", help="Atualizar traduções explícitas sem executar modelos.")
    args = parser.parse_args()
    if args.overrides_only:
        root = Path(__file__).resolve().parents[1]
        overrides = json.loads((root / "translations/ui_overrides.json").read_text(encoding="utf-8"))
        target = root / "dmc-workspace/src/i18n/messages.json"
        catalogue = json.loads(target.read_text(encoding="utf-8"))
        for text, values in overrides.items():
            catalogue.setdefault(text, {}).update(values)
        target.write_text(json.dumps(catalogue, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("Catálogo atualizado a partir das traduções explícitas.")
        return
    from worker import translate, ROOT

    sources = collect_sources(ROOT)
    overrides = json.loads((ROOT / "translations/ui_overrides.json").read_text(encoding="utf-8"))
    for text in overrides:
        sources.setdefault(text, "en")
    items = [{"text": text, "source": source} for text, source in sources.items()]
    result = {text: {} for text in sources}
    for target in ["pt", "en", "es", "fr", "de", "zh"]:
        values = translate(items, target)
        for text, value in zip(sources, values):
            result[text][target] = value
        for text, values_by_locale in overrides.items():
            result[text].update(values_by_locale)
        print(target, len(values), flush=True)
        (ROOT / "dmc-workspace/src/i18n/messages.json").write_text(
            json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )


if __name__ == "__main__":
    main()
