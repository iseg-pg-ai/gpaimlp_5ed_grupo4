"""Generate checked-in portal translations with the installed offline models."""
import json,re
from pathlib import Path
from worker import translate, ROOT
sources=json.loads((ROOT/"translations/ui_sources.json").read_text(encoding="utf-8"))
for file in (ROOT/"dmc-workspace/src").rglob("*.tsx"):
    code=file.read_text(encoding="utf-8")
    for text in re.findall(r'placeholder="([^"]+)"',code):sources[text]="en"
    for text,source in re.findall(r'<T text="([^"]+)" source="(pt|en)"',code):sources[text]=source
file=ROOT/"dmc-workspace/src/lib/brief-options.ts"
code=file.read_text(encoding="utf-8")
for name in ["interestOptions","mobilityOptions","dietaryOptions","exclusionOptions","effortLevels","diningPaces","morningPaces","paceOptions","accommodationOptions"]:
    match=re.search(r"const "+name+r"[^=]*=\s*\[(.*?)\];",code,re.S)
    if match:
        for text in re.findall(r'"([^"]+)"',match[1]):sources[text]="en"
code=(ROOT/"dmc-workspace/src/components/GenerationModal.tsx").read_text(encoding="utf-8")
for text in re.findall(r'"(0[1-5] [^"]+)"',code):sources[text]="en"
overrides=json.loads((ROOT/"translations/ui_overrides.json").read_text(encoding="utf-8"))
for text in overrides:sources.setdefault(text,"en")
items=[{"text":text,"source":source} for text,source in sources.items()]
result={text:{} for text in sources}
for target in ["pt","en","es","fr","de","zh"]:
    values=translate(items,target)
    for text,value in zip(sources,values):result[text][target]=value
    for text,values_by_locale in overrides.items():result[text].update(values_by_locale)
    print(target,len(values),flush=True)
    (ROOT/"dmc-workspace/src/i18n/messages.json").write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
