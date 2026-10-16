"""Generate checked-in portal translations with the installed offline models."""
import json
from ui_catalogue_sources import collect_sources


def main():
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
