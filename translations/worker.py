"""Offline JSON-lines worker using local Argos/CTranslate2 models and a disk cache."""
import os, sys, json, sqlite3, hashlib, re
from collections import Counter
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
os.environ["ARGOS_PACKAGES_DIR"] = str(ROOT / ".tools/translation-models")
os.environ["XDG_DATA_HOME"] = str(ROOT / ".tools/translation-data")
os.environ["XDG_CACHE_HOME"] = str(ROOT / ".tools/translation-cache")
try:
    import ctranslate2
    from argostranslate import package
except ImportError:
    if __name__ == "__main__":
        print(json.dumps({"fatal": "TRANSLATION_DEPENDENCIES_MISSING"}), flush=True)
    raise
PACKAGES = {(p.from_code,p.to_code):p for p in package.get_installed_packages()}
MODELS = {}
CACHE_DIR = ROOT / "exports/translations"
CACHE_DIR.mkdir(parents=True,exist_ok=True)
DB = sqlite3.connect(CACHE_DIR / "cache.sqlite")
DB.execute("CREATE TABLE IF NOT EXISTS translations (key TEXT PRIMARY KEY, value TEXT NOT NULL)")

def direct(texts, source, target, protect_numbers=True):
    pkg = PACKAGES.get((source,target))
    if pkg is None:
        raise ValueError(f"Missing local model {source}->{target}. Run translations/setup_models.py")
    if (source,target) not in MODELS:
        MODELS[source,target] = ctranslate2.Translator(str(pkg.package_path / "model"),device="cpu",compute_type="int8",intra_threads=4)
    tokens = [pkg.tokenizer.encode(text) for text in texts]
    if any(len(t)>480 for t in tokens):
        # Translate sentence-sized chunks instead of truncating long descriptions.
        result=[]
        for text in texts:
            chunks=re.split(r"(?<=[.!?])\s+|\n",text)
            if len(chunks)==1 and len(pkg.tokenizer.encode(text))>480:
                chunks=[text[i:i+600] for i in range(0,len(text),600)]
            result.append(" ".join(direct(chunks,source,target)))
        return result
    batches=MODELS[source,target].translate_batch(tokens,target_prefix=[[pkg.target_prefix]]*len(tokens) if pkg.target_prefix else None,replace_unknowns=True,beam_size=4,max_batch_size=32,max_decoding_length=700,length_penalty=0.2)
    values = [pkg.tokenizer.decode(batch.hypotheses[0]).removeprefix(pkg.target_prefix).strip() for batch in batches]
    for index, (original, value) in enumerate(zip(texts, values)):
        pattern = r"\d+(?:[.,:/-]\d+)*"
        if re.search(pattern, original) and Counter(re.findall(pattern, original)) != Counter(re.findall(pattern, value)):
            if not protect_numbers:
                raise ValueError("Translation changed numeric content; export cancelled.")
            # Never let a model change dates, times, prices or passenger counts.
            parts = re.split("(" + pattern + ")", original)
            words = [p for p in parts[::2] if re.search(r"[^\W\d_]", p)]
            translated = iter(direct(words, source, target, False)) if words else iter([])
            def fragment(part):
                value = next(translated)
                return (" " if part.startswith(" ") else "") + value + (" " if part.endswith(" ") else "")
            values[index] = "".join(fragment(p) if i % 2 == 0 and re.search(r"[^\W\d_]", p) else p for i, p in enumerate(parts))
            if Counter(re.findall(pattern, original)) != Counter(re.findall(pattern, values[index])):
                raise ValueError("Translation changed numeric content; export cancelled.")
    return values

def translate(items, target):
    if target not in ["pt","en","es","fr","de","zh"]: raise ValueError("Unsupported language")
    result=[None]*len(items)
    groups={}
    for i,item in enumerate(items):
        source,text=item["source"],item["text"]
        if source not in ["pt","en"] or not isinstance(text,str): raise ValueError("Invalid translation source")
        if source==target or not re.search(r"[^\W\d_]",text):result[i]=text;continue
        key=hashlib.sha256(("argos-1.11-int8-v2|"+source+"|"+target+"|"+text).encode()).hexdigest()
        cached=DB.execute("SELECT value FROM translations WHERE key=?",(key,)).fetchone()
        if cached:result[i]=cached[0]
        else:groups.setdefault(source,[]).append((i,text,key))
    for source,entries in groups.items():
        texts=[e[1] for e in entries]
        if source!="en" and target!="en":
            translated=direct(direct(texts,source,"en"),"en",target)
        else:translated=direct(texts,source,target)
        for (i,text,key),value in zip(entries,translated):
            result[i]=value
            DB.execute("INSERT OR REPLACE INTO translations VALUES (?,?)",(key,value))
    DB.commit()
    return result

if __name__=="__main__":
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    for line in sys.stdin:
        try:
            request=json.loads(line)
            response={"id":request["id"],"texts":translate(request["items"],request["target"])}
        except Exception as error:
            response={"id":request.get("id") if "request" in locals() else None,"error":str(error),"code":"TRANSLATION_MODELS_MISSING" if str(error).startswith("Missing local model ") else "TRANSLATION_FAILED"}
        print(json.dumps(response,ensure_ascii=False),flush=True)
