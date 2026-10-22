# Translation guidance

Translation is optional local infrastructure layered onto the DMC workspace.

- `worker.py` is a JSON-lines subprocess using separately installed Python
  dependencies and local models; `npm ci` installs neither.
- Keep translation offline at runtime. Model installation is the only expected
  network step and requires explicit approval.
- Preserve numeric content, source language, deterministic cache keys, and
  sanitized error categories. Never log traveler text.
- `ui_sources.json` and `ui_overrides.json` are inputs;
  `dmc-workspace/src/i18n/messages.json` is generated output.
- Branch `origin/fix/pdf-export-translation-setup` commit `0c1ba50` contains
  unmerged setup diagnostics and tests. Verify whether it has landed before
  changing failure handling.

Validation from the repository root:

```powershell
.\.venv\Scripts\python.exe -B -m unittest translations.test_worker -v
cd dmc-workspace
npm.cmd test
```

Inspect rendered localized PDFs for every affected language and configure a CJK
font/face before accepting Chinese output.
