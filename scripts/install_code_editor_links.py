"""Instalar a integração local de links BLU sem Marketplace nem dependências externas."""
from pathlib import Path
import json
import shutil
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def install() -> bool:
    code = shutil.which("code")
    if not code:
        return False
    source = ROOT / "tools/code-editor-links"
    package = json.loads((source / "package.json").read_text())
    installed = subprocess.run([code, "--list-extensions", "--show-versions"],
                               capture_output=True, text=True, check=True, timeout=20)
    identity = f"{package['publisher']}.{package['name']}@{package['version']}"
    if identity in installed.stdout.splitlines():
        return True
    target = ROOT / "monitoring/runtime/code-editor-links/blu-workspace-links.vsix"
    target.parent.mkdir(parents=True, exist_ok=True)
    manifest = f'''<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
<Metadata><Identity Language="en-US" Id="{package['name']}" Version="{package['version']}" Publisher="{package['publisher']}"/>
<DisplayName>BLU Workspace Links</DisplayName><Description xml:space="preserve">Interfaces do workspace atual</Description>
<Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="^1.90.0"/><Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="workspace"/></Properties></Metadata>
<Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/>
<Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/></Assets>
</PackageManifest>'''
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("extension.vsixmanifest", manifest)
        archive.writestr("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="json" ContentType="application/json"/><Default Extension="cjs" ContentType="application/javascript"/><Default Extension="vsixmanifest" ContentType="text/xml"/></Types>')
        archive.write(ROOT / "config/workspace_interfaces.json", "extension/interfaces.json")
        for name in ("package.json", "extension.cjs"):
            archive.write(source / name, f"extension/{name}")
    subprocess.run([code, "--install-extension", str(target), "--force"], check=True, timeout=60)
    return True


if __name__ == "__main__":
    if not install():
        raise SystemExit("CLI do Code Editor indisponível; instalar o VSIX na sessão do editor.")
