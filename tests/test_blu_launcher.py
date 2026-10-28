"""Regressões do protocolo sem serviços, dados operacionais nem chamadas externas."""
from pathlib import Path
import os
import re
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "scripts/just_blu_it.sh").read_text()


class BluLauncherTest(unittest.TestCase):
    def test_first_browser_failure_stops_the_remaining_checks(self):
        match = re.search(r'run_task "11\.[^"]+" bash (.*?) -c \'(.*?)\n\'', SOURCE, re.S)
        self.assertIsNotNone(match)
        options, block = match.groups()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            marker = root / "presentation-ran"
            command = root / "node"
            command.write_text('#!/bin/bash\nif [[ "$1" == monitoring/* ]]; then exit 9; fi\n: > "$MARKER"\n')
            command.chmod(0o755)
            result = subprocess.run(["bash", *options.split(), "-c", block], cwd=root,
                env={**os.environ, "PATH": f"{root}:{os.environ['PATH']}", "MARKER": str(marker)},
                capture_output=True, text=True)
            self.assertEqual(result.returncode, 9)
            self.assertFalse(marker.exists())

    def test_browser_deferred_is_distinct_from_service_failure_and_open_success(self):
        function = SOURCE[SOURCE.index("open_service_pages() {"):SOURCE.index("\nwait_http()")]
        for status in (0, 1, 3):
            with self.subTest(status=status):
                command = f'''set -euo pipefail
GREEN= RESET= GOLD=
python3() {{ return {status}; }}
{function}
open_service_pages
printf 'END\\n'
'''
                result = subprocess.run(["bash", "-c", command], capture_output=True, text=True)
                self.assertEqual(result.returncode, 1 if status == 1 else 0)
                if status == 0:
                    self.assertIn("5 interfaces abertas", result.stdout)
                elif status == 3:
                    self.assertIn("abertura no navegador pendente", result.stdout)
                    self.assertNotIn("5 interfaces abertas", result.stdout)
                else:
                    self.assertNotIn("END", result.stdout)

    def test_test_stage_disables_external_notifications_only_in_its_subshell(self):
        match = re.search(r'run_task "6\.[^"]+" bash (.*?) -c \'(.*?)\n\'', SOURCE, re.S)
        self.assertIsNotNone(match)
        options, block = match.groups()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            python = root / ".venv/bin/python"
            python.parent.mkdir(parents=True)
            python.write_text('#!/bin/bash\nprintf "%s\\n" "$BLU_MONITORING_NOTIFICATIONS_ENABLED" >> "$MARKER"\n')
            python.chmod(0o755)
            marker = root / "test-environments"
            environment = {**os.environ, "BLU_MONITORING_NOTIFICATIONS_ENABLED": "true", "MARKER": str(marker)}
            result = subprocess.run(["bash", *options.split(), "-c", block], cwd=root,
                                    env=environment, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(marker.read_text().splitlines(), ["false"] * 3)
            self.assertEqual(environment["BLU_MONITORING_NOTIFICATIONS_ENABLED"], "true")
