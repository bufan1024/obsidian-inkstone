"""Run with: python3 -m unittest discover -s scripts -p 'test_*.py'."""

import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

import install


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.repo = self.root / "source"
        self.repo.mkdir()
        self.write_sources(self.repo, self.repo / "annotations")
        self.vault = self.root / "我的笔记"
        self.vault.mkdir()
        self.config = self.vault / ".obsidian"
        self.config.mkdir()
        (self.vault / "阅读.md").write_text("这篇笔记不能被修改。\n", encoding="utf-8")
        self.patch = mock.patch.object(install, "ROOT", self.repo)
        self.patch.start()
        self.addCleanup(self.patch.stop)

    @staticmethod
    def write_sources(theme, plugin):
        theme.mkdir(parents=True, exist_ok=True)
        plugin.mkdir(parents=True, exist_ok=True)
        (theme / "theme.css").write_text("/* 墨读 */ body { color: #202020; }\n", encoding="utf-8")
        (theme / "manifest.json").write_text('{"name":"Inkstone","version":"1.2.0"}\n', encoding="utf-8")
        for name, text in {
            "main.js": "module.exports = {};\n",
            "styles.css": ".inkstone-highlight { color: black; }\n",
            "manifest.json": '{"id":"inkstone-annotations","version":"1.0.0"}\n',
        }.items():
            (plugin / name).write_text(text, encoding="utf-8")

    def run_install(self, **kwargs):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            changes = install.install(self.vault, **kwargs)
        return changes, output.getvalue()

    @staticmethod
    def snapshot(path):
        return {
            str(item.relative_to(path)): (
                ("symlink", str(item.readlink())) if item.is_symlink()
                else ("file", item.read_bytes()) if item.is_file()
                else ("dir",)
            )
            for item in path.rglob("*")
        }

    def test_first_install_copies_runtime_and_sets_appearance(self):
        changes, output = self.run_install()
        self.assertEqual(changes, 7)
        self.assertEqual((self.config / "themes/Inkstone/theme.css").read_bytes(), (self.repo / "theme.css").read_bytes())
        for name in ("main.js", "styles.css", "manifest.json"):
            self.assertEqual((self.config / "plugins/inkstone-annotations" / name).read_bytes(), (self.repo / "annotations" / name).read_bytes())
        self.assertEqual(json.loads((self.config / "appearance.json").read_text(encoding="utf-8")), {"cssTheme": "Inkstone", "theme": "moonstone"})
        self.assertEqual(json.loads((self.config / "app.json").read_text(encoding="utf-8")), {"readableLineLength": True})
        self.assertFalse((self.config / "community-plugins.json").exists())
        self.assertFalse((self.config / "inkstone-backups").exists())
        self.assertEqual((self.vault / "阅读.md").read_text(encoding="utf-8"), "这篇笔记不能被修改。\n")
        self.assertIn("重启", output)
        self.assertIn("手动", output)

    def test_second_install_has_no_changes_or_backup(self):
        self.run_install()
        before = self.snapshot(self.vault)
        changes, output = self.run_install()
        self.assertEqual(changes, 0)
        self.assertEqual(self.snapshot(self.vault), before)
        self.assertIn("无需修改", output)

    def test_changed_files_backed_up_and_other_settings_preserved(self):
        self.run_install()
        old_css = b"old theme\n"
        css = self.config / "themes/Inkstone/theme.css"
        css.write_bytes(old_css)
        appearance = self.config / "appearance.json"
        old_appearance = b'{"cssTheme":"Other","theme":"obsidian","baseFontSize":21,"custom":{"enabled":true}}\n'
        appearance.write_bytes(old_appearance)
        (self.config / "app.json").write_text('{"readableLineLength":false,"alwaysUpdateLinks":true}\n')
        plugin_data = self.config / "plugins/inkstone-annotations/data.json"
        plugin_data.write_text('{"monochrome":true}\n')
        other_plugin_file = plugin_data.with_name("personal.txt")
        other_plugin_file.write_text("keep me\n")
        enabled = self.config / "community-plugins.json"
        enabled.write_text('["existing-plugin"]\n')
        changes, _ = self.run_install()
        self.assertEqual(changes, 3)
        backups = list((self.config / "inkstone-backups").iterdir())
        self.assertEqual(len(backups), 1)
        self.assertEqual((backups[0] / "themes/Inkstone/theme.css").read_bytes(), old_css)
        self.assertEqual((backups[0] / "appearance.json").read_bytes(), old_appearance)
        self.assertFalse((backups[0] / "plugins").exists())
        settings = json.loads(appearance.read_text(encoding="utf-8"))
        self.assertEqual(settings["custom"], {"enabled": True})
        self.assertEqual(settings["baseFontSize"], 21)
        self.assertEqual(json.loads((self.config / "app.json").read_text(encoding="utf-8"))["alwaysUpdateLinks"], True)
        self.assertEqual(plugin_data.read_text(encoding="utf-8"), '{"monochrome":true}\n')
        self.assertEqual(other_plugin_file.read_text(encoding="utf-8"), "keep me\n")
        self.assertEqual(enabled.read_text(encoding="utf-8"), '["existing-plugin"]\n')

    def test_update_replaces_runtime_and_preserves_personal_preferences(self):
        self.run_install()
        preferences = {
            "appearance.json": b'{ "cssTheme": "Other", "theme": "obsidian", "baseFontSize": 23 }\n',
            "app.json": b'{ "readableLineLength": false, "alwaysUpdateLinks": true }\n',
            "community-plugins.json": b'["existing-plugin", "inkstone-annotations"]\n',
            "plugins/inkstone-annotations/data.json": b'{"monochrome":true,"readingWidth":"wide"}\n',
        }
        for relative, content in preferences.items():
            (self.config / relative).write_bytes(content)
        runtime = (
            "themes/Inkstone/theme.css", "themes/Inkstone/manifest.json",
            "plugins/inkstone-annotations/main.js", "plugins/inkstone-annotations/styles.css",
            "plugins/inkstone-annotations/manifest.json",
        )
        for relative in runtime:
            (self.config / relative).write_bytes(b"old runtime\n")

        changes, output = self.run_install(update=True)

        self.assertEqual(changes, 5)
        self.assertIn("更新完成", output)
        for relative, content in preferences.items():
            self.assertEqual((self.config / relative).read_bytes(), content)
        self.assertEqual((self.config / "themes/Inkstone/theme.css").read_bytes(), (self.repo / "theme.css").read_bytes())
        for name in ("main.js", "styles.css", "manifest.json"):
            self.assertEqual((self.config / "plugins/inkstone-annotations" / name).read_bytes(), (self.repo / "annotations" / name).read_bytes())
        backups = list((self.config / "inkstone-backups").iterdir())
        self.assertEqual(len(backups), 1)
        self.assertEqual({path.relative_to(backups[0]).as_posix() for path in backups[0].rglob("*") if path.is_file()}, set(runtime))
        for relative in runtime:
            self.assertEqual((backups[0] / relative).read_bytes(), b"old runtime\n")

    def test_update_does_not_create_preference_files(self):
        changes, _ = self.run_install(update=True)
        self.assertEqual(changes, 5)
        self.assertFalse((self.config / "appearance.json").exists())
        self.assertFalse((self.config / "app.json").exists())
        self.assertFalse((self.config / "community-plugins.json").exists())

    def test_failed_update_reports_backup_and_completed_files(self):
        self.run_install()
        theme = self.config / "themes/Inkstone/theme.css"
        plugin = self.config / "plugins/inkstone-annotations/main.js"
        theme.write_bytes(b"old theme\n")
        plugin.write_bytes(b"old plugin\n")
        preferences = self.config / "appearance.json"
        preferences.write_bytes(b'{ "cssTheme": "Other", "theme": "obsidian" }\n')
        replace = install.os.replace

        def fail_plugin(source, target):
            if Path(target) == plugin.resolve():
                raise OSError("simulated runtime write failure")
            return replace(source, target)

        output, errors = io.StringIO(), io.StringIO()
        with mock.patch.object(install.os, "replace", side_effect=fail_plugin), contextlib.redirect_stdout(output), contextlib.redirect_stderr(errors):
            status = install.main(["--vault", str(self.vault), "--update"])

        self.assertEqual(status, 1)
        self.assertEqual(theme.read_bytes(), (self.repo / "theme.css").read_bytes())
        self.assertEqual(plugin.read_bytes(), b"old plugin\n")
        self.assertEqual(preferences.read_bytes(), b'{ "cssTheme": "Other", "theme": "obsidian" }\n')
        self.assertEqual((self.vault / "阅读.md").read_text(encoding="utf-8"), "这篇笔记不能被修改。\n")
        backup = next((self.config / "inkstone-backups").iterdir())
        self.assertEqual((backup / "themes/Inkstone/theme.css").read_bytes(), b"old theme\n")
        self.assertEqual((backup / "plugins/inkstone-annotations/main.js").read_bytes(), b"old plugin\n")
        self.assertIn(str(backup.resolve()), errors.getvalue())
        self.assertIn("  themes/Inkstone/theme.css\n", errors.getvalue())
        self.assertNotIn("  plugins/inkstone-annotations/main.js\n", errors.getvalue())
        self.assertIn("关闭 Obsidian", errors.getvalue())
        self.assertIn("复制回", errors.getvalue())
        self.assertIn("simulated runtime write failure", errors.getvalue())
        self.assertNotIn("更新完成", output.getvalue())

    def test_failed_first_install_reports_completed_files_without_backup(self):
        plugin = self.config / "plugins/inkstone-annotations/main.js"
        failure = OSError("simulated first install failure")
        replace = install.os.replace

        def fail_plugin(source, target):
            if Path(target) == plugin.resolve():
                raise failure
            return replace(source, target)

        errors = io.StringIO()
        with mock.patch.object(install.os, "replace", side_effect=fail_plugin), contextlib.redirect_stderr(errors):
            with self.assertRaises(OSError) as caught:
                install.install(self.vault)

        self.assertIs(caught.exception, failure)
        self.assertTrue((self.config / "themes/Inkstone/theme.css").is_file())
        self.assertFalse(plugin.exists())
        self.assertFalse((self.config / "inkstone-backups").exists())
        self.assertFalse((self.config / "appearance.json").exists())
        self.assertIn("  themes/Inkstone/theme.css\n", errors.getvalue())
        self.assertIn("  themes/Inkstone/manifest.json\n", errors.getvalue())
        self.assertIn("没有旧文件备份", errors.getvalue())
        self.assertIn("重新运行", errors.getvalue())
        self.assertNotIn("原文件备份：", errors.getvalue())

    def test_failed_backup_reports_no_installed_files_were_replaced(self):
        self.run_install()
        theme = self.config / "themes/Inkstone/theme.css"
        plugin = self.config / "plugins/inkstone-annotations/main.js"
        theme.write_bytes(b"old theme\n")
        plugin.write_bytes(b"old plugin\n")
        replace = install.os.replace

        def fail_plugin_backup(source, target):
            relative = Path(target).relative_to(self.config.resolve())
            if relative.parts[0] == "inkstone-backups" and relative.parts[-3:] == ("plugins", "inkstone-annotations", "main.js"):
                raise OSError("simulated backup write failure")
            return replace(source, target)

        errors = io.StringIO()
        with mock.patch.object(install.os, "replace", side_effect=fail_plugin_backup), contextlib.redirect_stderr(errors):
            status = install.main(["--vault", str(self.vault), "--update"])

        self.assertEqual(status, 1)
        self.assertEqual(theme.read_bytes(), b"old theme\n")
        self.assertEqual(plugin.read_bytes(), b"old plugin\n")
        backup = next((self.config / "inkstone-backups").iterdir())
        self.assertEqual((backup / "themes/Inkstone/theme.css").read_bytes(), b"old theme\n")
        self.assertFalse((backup / "plugins/inkstone-annotations/main.js").exists())
        self.assertIn("备份未完成", errors.getvalue())
        self.assertIn("尚未替换任何安装文件", errors.getvalue())
        self.assertIn("simulated backup write failure", errors.getvalue())
        self.assertNotIn("原文件备份：", errors.getvalue())
        self.assertNotIn("复制回", errors.getvalue())

    def test_update_ignores_invalid_unrelated_preference_json(self):
        preferences = {"appearance.json": b"{invalid", "app.json": b"\xffnot UTF-8 JSON"}
        for relative, content in preferences.items():
            (self.config / relative).write_bytes(content)
        changes, _ = self.run_install(update=True)
        self.assertEqual(changes, 5)
        for relative, content in preferences.items():
            self.assertEqual((self.config / relative).read_bytes(), content)

    def test_update_theme_only_changes_only_theme_runtime(self):
        (self.config / "appearance.json").write_bytes(b'{"cssTheme":"Other","theme":"obsidian"}')
        (self.config / "app.json").write_bytes(b'{"readableLineLength":false}')
        (self.repo / "annotations/main.js").unlink()
        changes, _ = self.run_install(update=True, theme_only=True)
        self.assertEqual(changes, 2)
        self.assertEqual((self.config / "appearance.json").read_bytes(), b'{"cssTheme":"Other","theme":"obsidian"}')
        self.assertEqual((self.config / "app.json").read_bytes(), b'{"readableLineLength":false}')
        self.assertFalse((self.config / "plugins").exists())

    def test_plugin_only_preserves_theme_preferences_and_plugin_data(self):
        self.run_install()
        (self.repo / "theme.css").unlink()
        (self.repo / "manifest.json").unlink()
        preserved = {
            "themes/Inkstone/theme.css": b"custom theme\n",
            "themes/Inkstone/manifest.json": b"custom manifest\n",
            "appearance.json": b'{"cssTheme":"Other","theme":"obsidian"}',
            "app.json": b"{invalid",
            "community-plugins.json": b'["existing-plugin"]',
            "plugins/inkstone-annotations/data.json": b'{"monochrome":true}',
        }
        for relative, content in preserved.items():
            (self.config / relative).write_bytes(content)
        for name in ("main.js", "styles.css", "manifest.json"):
            (self.config / "plugins/inkstone-annotations" / name).write_bytes(b"old plugin\n")

        changes, output = self.run_install(plugin_only=True)

        self.assertEqual(changes, 3)
        self.assertIn("安装完成", output)
        for relative, content in preserved.items():
            self.assertEqual((self.config / relative).read_bytes(), content)
        for name in ("main.js", "styles.css", "manifest.json"):
            self.assertEqual((self.config / "plugins/inkstone-annotations" / name).read_bytes(), (self.repo / "annotations" / name).read_bytes())
        backup = next((self.config / "inkstone-backups").iterdir())
        self.assertEqual({path.relative_to(backup).as_posix() for path in backup.rglob("*") if path.is_file()}, {
            "plugins/inkstone-annotations/main.js", "plugins/inkstone-annotations/styles.css",
            "plugins/inkstone-annotations/manifest.json",
        })

    def test_update_plugin_only_does_not_create_theme_or_preferences(self):
        changes, _ = self.run_install(update=True, plugin_only=True)
        self.assertEqual(changes, 3)
        self.assertFalse((self.config / "themes").exists())
        self.assertFalse((self.config / "appearance.json").exists())
        self.assertFalse((self.config / "app.json").exists())

    def test_update_dry_run_preserves_all_files(self):
        self.run_install()
        (self.config / "appearance.json").write_bytes(b"{invalid")
        (self.config / "app.json").write_bytes(b'{"readableLineLength":false}')
        (self.config / "plugins/inkstone-annotations/main.js").write_bytes(b"old plugin\n")
        before = self.snapshot(self.vault)
        changes, output = self.run_install(update=True, dry_run=True)
        self.assertEqual(changes, 1)
        self.assertIn("更新预览", output)
        self.assertEqual(self.snapshot(self.vault), before)

    def test_theme_only_and_plugin_only_refuse_before_any_write(self):
        before = self.snapshot(self.vault)
        for update in (False, True):
            for operation in (install.create_plan, install.install):
                with self.subTest(update=update, operation=operation.__name__):
                    with self.assertRaises(install.InstallError):
                        operation(self.vault, theme_only=True, plugin_only=True, update=update)
        self.assertEqual(self.snapshot(self.vault), before)

    def test_cli_update_and_plugin_only_preserve_preferences(self):
        (self.config / "appearance.json").write_bytes(b'{"cssTheme":"Other"}')
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            status = install.main(["--vault", str(self.vault), "--update", "--plugin-only"])
        self.assertEqual(status, 0)
        self.assertIn("更新完成", output.getvalue())
        self.assertEqual((self.config / "appearance.json").read_bytes(), b'{"cssTheme":"Other"}')
        self.assertFalse((self.config / "themes").exists())
        self.assertTrue((self.config / "plugins/inkstone-annotations/main.js").is_file())

    def test_cli_theme_only_and_plugin_only_are_mutually_exclusive(self):
        before = self.snapshot(self.vault)
        for extra in ([], ["--update"]):
            with self.subTest(extra=extra), contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as raised:
                    install.main(["--vault", str(self.vault), "--theme-only", "--plugin-only"] + extra)
                self.assertEqual(raised.exception.code, 2)
        self.assertEqual(self.snapshot(self.vault), before)

    def test_existing_correct_settings_keep_original_bytes(self):
        appearance = self.config / "appearance.json"
        original = b'{ "theme": "moonstone", "cssTheme": "Inkstone", "baseFontSize": 20 }'
        appearance.write_bytes(original)
        self.run_install()
        self.assertEqual(appearance.read_bytes(), original)
        self.assertFalse((self.config / "inkstone-backups").exists())

    def test_invalid_json_refuses_before_any_write(self):
        for name, content in (("appearance.json", "{invalid"), ("app.json", "[]"), ("app.json", "null"),
                              ("app.json", '{"custom":NaN}')):
            with self.subTest(name=name, content=content):
                target = self.config / name
                target.write_text(content)
                before = self.snapshot(self.vault)
                with self.assertRaises(install.InstallError):
                    self.run_install()
                self.assertEqual(self.snapshot(self.vault), before)
                target.unlink()

    def test_dry_run_leaves_all_files_untouched(self):
        (self.config / "appearance.json").write_text('{"cssTheme":"Old"}')
        before = self.snapshot(self.vault)
        changes, output = self.run_install(dry_run=True)
        self.assertEqual(changes, 7)
        self.assertIn("预览", output)
        self.assertEqual(self.snapshot(self.vault), before)

    def test_custom_config_and_theme_only(self):
        custom = self.vault / ".obsidian-ink"
        custom.mkdir()
        changes, _ = self.run_install(config_dir=".obsidian-ink", theme_only=True)
        self.assertEqual(changes, 4)
        self.assertTrue((custom / "themes/Inkstone/theme.css").is_file())
        self.assertFalse((custom / "plugins").exists())
        self.assertEqual(list(self.config.iterdir()), [])

    def test_reading_kit_layout(self):
        kit = self.root / "kit"
        self.write_sources(kit / "themes/Inkstone", kit / "plugins/inkstone-annotations")
        with mock.patch.object(install, "ROOT", kit):
            changes, _ = self.run_install()
        self.assertEqual(changes, 7)
        self.assertEqual((self.config / "themes/Inkstone/theme.css").read_bytes(), (kit / "themes/Inkstone/theme.css").read_bytes())
        self.assertEqual((self.config / "plugins/inkstone-annotations/main.js").read_bytes(), (kit / "plugins/inkstone-annotations/main.js").read_bytes())

    def test_symlink_directory_escape_refuses_before_any_write(self):
        outside = self.root / "outside"
        outside.mkdir()
        (self.config / "plugins").symlink_to(outside, target_is_directory=True)
        before = self.snapshot(self.vault)
        with self.assertRaises(install.InstallError):
            self.run_install()
        self.assertEqual(self.snapshot(self.vault), before)
        self.assertEqual(list(outside.iterdir()), [])

    def test_config_root_symlink_escape_refuses_before_any_write(self):
        outside = self.root / "outside-config"
        outside.mkdir()
        (outside / "appearance.json").write_text('{"baseFontSize":22}')
        self.config.rmdir()
        self.config.symlink_to(outside, target_is_directory=True)
        vault_before = self.snapshot(self.vault)
        outside_before = self.snapshot(outside)
        with self.assertRaises(install.InstallError):
            self.run_install()
        self.assertEqual(self.snapshot(self.vault), vault_before)
        self.assertEqual(self.snapshot(outside), outside_before)

    def test_symlink_file_escape_refuses_even_when_bytes_match(self):
        outside = self.root / "outside.css"
        outside.write_bytes((self.repo / "theme.css").read_bytes())
        destination = self.config / "themes/Inkstone"
        destination.mkdir(parents=True)
        (destination / "theme.css").symlink_to(outside)
        before = self.snapshot(self.vault)
        with self.assertRaises(install.InstallError):
            self.run_install()
        self.assertEqual(self.snapshot(self.vault), before)

    def test_backup_symlink_escape_refuses_before_any_write(self):
        self.run_install()
        (self.config / "theme-unused.css").write_text("untouched")
        (self.config / "themes/Inkstone/theme.css").write_text("old")
        outside = self.root / "outside-backup"
        outside.mkdir()
        (self.config / "inkstone-backups").symlink_to(outside, target_is_directory=True)
        before = self.snapshot(self.vault)
        with self.assertRaises(install.InstallError):
            self.run_install()
        self.assertEqual(self.snapshot(self.vault), before)
        self.assertEqual(list(outside.iterdir()), [])

    def test_missing_vault_or_config_refuses(self):
        with self.assertRaises(install.InstallError):
            install.install(self.root / "missing")
        self.config.rmdir()
        before = self.snapshot(self.vault)
        with self.assertRaises(install.InstallError):
            self.run_install()
        self.assertEqual(self.snapshot(self.vault), before)

    def test_config_name_must_be_one_relative_folder(self):
        for name in ("", ".", "..", "../outside", "a/b", "a\\b", "/tmp", "C:config"):
            with self.subTest(name=name), self.assertRaises(install.InstallError):
                self.run_install(config_dir=name)

    def test_missing_source_refuses_before_any_write(self):
        (self.repo / "annotations/main.js").unlink()
        before = self.snapshot(self.vault)
        with self.assertRaises(install.InstallError):
            self.run_install()
        self.assertEqual(self.snapshot(self.vault), before)

    def test_file_at_directory_target_refuses_before_any_write(self):
        (self.config / "themes").write_text("not a directory")
        before = self.snapshot(self.vault)
        with self.assertRaises(install.InstallError):
            self.run_install()
        self.assertEqual(self.snapshot(self.vault), before)

    def test_settings_changed_after_planning_refuses_before_any_write(self):
        plan = install.create_plan(self.vault)
        (self.config / "appearance.json").write_text('{"baseFontSize":24}')
        before = self.snapshot(self.vault)
        with self.assertRaises(install.InstallError):
            install.apply_plan(plan)
        self.assertEqual(self.snapshot(self.vault), before)


if __name__ == "__main__":
    unittest.main()
