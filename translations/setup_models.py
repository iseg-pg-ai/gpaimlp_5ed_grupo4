"""Download translation models once. Runtime translation never uses the network."""
import os
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
os.environ["ARGOS_PACKAGES_DIR"] = str(ROOT / ".tools/translation-models")
os.environ["XDG_DATA_HOME"] = str(ROOT / ".tools/translation-data")
os.environ["XDG_CACHE_HOME"] = str(ROOT / ".tools/translation-cache")
from argostranslate import package
package.update_package_index()
available = package.get_available_packages()
installed = {(p.from_code,p.to_code) for p in package.get_installed_packages()}
for source,target in [("pt","en"),("en","pt"),("en","es"),("en","fr"),("en","de"),("en","zh")]:
    if (source,target) in installed:
        print(f"Already installed: {source}->{target}",flush=True)
        continue
    model = next(p for p in available if p.from_code == source and p.to_code == target)
    print(f"Downloading {source}->{target}",flush=True)
    package.install_from_path(model.download())
    print(f"Installed {source}->{target}",flush=True)
