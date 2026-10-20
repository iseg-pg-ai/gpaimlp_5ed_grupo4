"""Discover literal UI strings independently of JSX line wrapping."""
import json
import re
from pathlib import Path


def literal_sources(code: str) -> dict[str, str]:
    sources = {text: "en" for text in re.findall(r'placeholder="([^"]+)"', code)}
    for text, language in re.findall(r'<T\s+text="([^"]+)"(?:\s+source="(pt|en)")?', code):
        sources[text] = language or "en"
    return sources


def collect_sources(root: Path) -> dict[str, str]:
    # Explicit seeds cover labels selected dynamically from domain data.
    sources = json.loads((root / "translations/ui_sources.json").read_text(encoding="utf-8"))
    for file in (root / "dmc-workspace/src").rglob("*.tsx"):
        sources.update(literal_sources(file.read_text(encoding="utf-8")))
    code = (root / "dmc-workspace/src/lib/brief-options.ts").read_text(encoding="utf-8")
    names = ["interestOptions", "mobilityOptions", "dietaryOptions", "exclusionOptions",
             "effortLevels", "diningPaces", "morningPaces", "paceOptions", "accommodationOptions"]
    for name in names:
        match = re.search(r"const " + name + r"[^=]*=\s*\[(.*?)\];", code, re.S)
        if match:
            sources.update({text: "en" for text in re.findall(r'"([^"]+)"', match[1])})
    return sources
