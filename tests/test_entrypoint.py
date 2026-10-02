import os
import pathlib
import subprocess
import tempfile
import unittest

ENTRYPOINT = pathlib.Path(__file__).resolve().parents[1] / 'entrypoint.sh'

class EntrypointTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        bin_dir = self.root / 'bin'
        bin_dir.mkdir()
        fake = bin_dir / 'gbrain'
        fake.write_text('''#!/bin/bash
printf '%s\\n' "$*" >> "$GBRAIN_HOME/calls"
if [ "$1" = init ]; then printf '{}' > "$GBRAIN_HOME/.gbrain/config.json"; fi
if [ "$1" = apply-migrations ] && [ "${FAIL_MIGRATION:-}" = 1 ]; then exit 7; fi
''')
        fake.chmod(0o755)
        self.env = dict(os.environ, PATH=str(bin_dir)+':'+os.environ['PATH'],
            OPENAI_API_KEY='fixture', ANTHROPIC_API_KEY='fixture',
            ALPHACLAW_ROOT_DIR=str(self.root), GBRAIN_HOME=str(self.root), GBRAIN_RELEASE='release-2')

    def run_entry(self):
        return subprocess.run(['bash', str(ENTRYPOINT), 'true'], env=self.env, capture_output=True)

    def existing_brain(self):
        brain = self.root / '.gbrain'
        brain.mkdir()
        (brain/'config.json').write_text('{}')
        (brain/'fact.txt').write_text('keep this memory')
        return brain

    def test_fresh_boot_and_restart_do_not_migrate_again(self):
        self.assertEqual(self.run_entry().returncode, 0)
        self.assertEqual(self.run_entry().returncode, 0)
        self.assertEqual((self.root/'calls').read_text().splitlines(), ['init --pglite --non-interactive'])

    def test_upgrade_preserves_memory_before_migration(self):
        brain = self.existing_brain()
        self.assertEqual(self.run_entry().returncode, 0)
        backup = self.root/'backups/gbrain-before-release-2'
        self.assertEqual((backup/'fact.txt').read_text(), 'keep this memory')
        self.assertEqual((brain/'.container-release').read_text().strip(), 'release-2')
        self.assertEqual(self.run_entry().returncode, 0)
        self.assertEqual(len((self.root/'calls').read_text().splitlines()), 2)

    def test_failed_migration_does_not_mark_complete_or_overwrite_backup(self):
        brain = self.existing_brain()
        self.env['FAIL_MIGRATION'] = '1'
        self.assertEqual(self.run_entry().returncode, 7)
        self.assertFalse((brain/'.container-release').exists())
        (brain/'fact.txt').write_text('partially changed')
        self.env.pop('FAIL_MIGRATION')
        self.assertEqual(self.run_entry().returncode, 0)
        self.assertEqual((self.root/'backups/gbrain-before-release-2/fact.txt').read_text(), 'keep this memory')

if __name__ == '__main__': unittest.main()
