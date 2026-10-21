"""Run with: python3 -m unittest discover -s scripts -p 'test_*.py'."""

import contextlib
import io
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest
from unittest import mock
from urllib.parse import unquote, urlsplit

import export_plugin


PROJECT = Path(__file__).resolve().parent.parent


class PluginExportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "source"
        for relative in export_plugin.SOURCE_FILES:
            target = self.source / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(PROJECT / relative, target)
        for relative in (".qa/private.md", ".git/config", "annotations/data.json", "personal-note.md"):
            target = self.source / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text("Must never be exported", encoding="utf-8")
        self.output = self.root / "detached" / "plugin"
        patch = mock.patch.object(export_plugin, "ROOT", self.source)
        patch.start()
        self.addCleanup(patch.stop)

    def run_export(self):
        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            status = export_plugin.main(["--output-dir", str(self.output)])
        return status, stdout.getvalue(), stderr.getvalue()

    def test_exports_only_plugin_sources_and_distribution_files(self):
        status, _, error = self.run_export()
        self.assertEqual(status, 0, error)
        files = {path.relative_to(self.output).as_posix() for path in self.output.rglob("*") if path.is_file()}
        self.assertTrue({"README.md", "README.zh-CN.md", "LICENSE", "manifest.json", "main.js", "styles.css", "build.mjs", "package.json", "versions.json", ".github/workflows/check.yml", "src/plugin.cjs", "src/annotation-menu.cjs", "tests/plugin.test.cjs", "examples/划线与备注示例.md", "assets/annotate.gif", "assets/review-export.gif"} <= files)
        self.assertFalse(any(set(Path(name).parts) & {".qa", ".git", "node_modules", "dist"} for name in files))
        self.assertFalse(any(name.endswith("data.json") or "personal-note" in name for name in files))
        self.assertNotIn("theme.css", files)
        manifest = json.loads((self.output / "manifest.json").read_text())
        package = json.loads((self.output / "package.json").read_text())
        self.assertEqual(package["version"], manifest["version"])
        self.assertEqual(package["name"], manifest["id"])
        self.assertTrue(package["private"])
        self.assertNotIn("dependencies", package)
        self.assertEqual(package["scripts"]["build"], "node build.mjs")
        self.assertEqual(json.loads((self.output / "versions.json").read_text()), {manifest["version"]: manifest["minAppVersion"]})
        self.assertEqual((self.output / "LICENSE").read_bytes(), (self.source / "annotations/LICENSE").read_bytes())
        for name in ("main.js", "styles.css", "manifest.json"):
            self.assertEqual((self.output / name).read_bytes(), (self.source / "annotations" / name).read_bytes())

    def test_refuses_nonempty_output_without_touching_it(self):
        self.output.mkdir(parents=True)
        marker = self.output / "keep.txt"
        marker.write_bytes(b"Existing checkout must be preserved")
        status, _, error = self.run_export()
        self.assertEqual(status, 1)
        self.assertIn("not empty", error)
        self.assertEqual(list(self.output.iterdir()), [marker])
        self.assertEqual(marker.read_bytes(), b"Existing checkout must be preserved")

    def test_allows_an_existing_empty_output_directory(self):
        self.output.mkdir(parents=True)
        status, _, error = self.run_export()
        self.assertEqual(status, 0, error)
        self.assertTrue((self.output / "main.js").is_file())

    def test_refuses_output_and_source_symlinks(self):
        outside = self.root / "outside"
        outside.mkdir()
        self.output.parent.mkdir(parents=True)
        self.output.symlink_to(outside, target_is_directory=True)
        status, _, _ = self.run_export()
        self.assertEqual(status, 1)
        self.assertEqual(list(outside.iterdir()), [])
        self.output.unlink()
        source = self.source / "annotations/src/core.cjs"
        source.unlink()
        secret = outside / "secret.cjs"
        secret.write_text("This is not plugin source", encoding="utf-8")
        source.symlink_to(secret)
        status, _, _ = self.run_export()
        self.assertEqual(status, 1)
        self.assertFalse(self.output.exists())
        self.assertEqual(secret.read_text(), "This is not plugin source")

    def test_missing_source_fails_before_creating_output(self):
        (self.source / "annotations/src/core.cjs").unlink()
        status, _, _ = self.run_export()
        self.assertEqual(status, 1)
        self.assertFalse(self.output.exists())

    def test_readmes_have_local_language_demos_and_resolvable_links(self):
        market_status = {
            "annotations/README.en.md": ("## Install and update", "Community listing status: published, review pending."),
            "annotations/README.md": ("## 安装与更新", "社区目录状态：条目已公开，审核待完成。"),
        }
        for name, (heading, status_text) in market_status.items():
            source = self.source / name
            source.write_text(source.read_text().replace(heading, f"{status_text}\n\n{heading}", 1), encoding="utf-8")
        status, _, error = self.run_export()
        self.assertEqual(status, 0, error)
        english = (self.output / "README.md").read_text()
        chinese = (self.output / "README.zh-CN.md").read_text()
        self.assertIn("[简体中文](README.zh-CN.md)", english)
        self.assertIn("[English](README.md)", chinese)
        self.assertEqual(english.count(market_status["annotations/README.en.md"][1]), 1)
        self.assertEqual(chinese.count(market_status["annotations/README.md"][1]), 1)
        self.assertFalse("The plugin is not yet confirmed as listed" in english, "The exporter must not add its own English market status")
        self.assertFalse("当前尚未确认上架" in chinese, "The exporter must not add its own Chinese market status")
        for name, text in (("README.md", english), ("README.zh-CN.md", chinese)):
            self.assertIn("](assets/annotate.gif)", text)
            self.assertIn("](assets/review-export.gif)", text)
            self.assertIn("node build.mjs", text)
            self.assertIn("node --test tests/*.test.cjs", text)
            self.assertNotIn("node annotations/build.mjs", text)
            self.assertNotIn("node --test annotations/tests/", text)
            self.assertIn("https://github.com/bufan1024/obsidian-inkstone", text)
            for target in re.findall(r"!?\[[^\]]*\]\(([^)]+)\)", text):
                url = urlsplit(target)
                if url.scheme or url.netloc:
                    continue
                linked = self.output / unquote(url.path) if url.path else self.output / name
                self.assertTrue(linked.is_file(), (name, target))
                if url.fragment and linked.suffix == ".md":
                    headings = re.findall(r"^#{1,6}\s+(.+)$", linked.read_text(), flags=re.M)
                    slugs = {re.sub(r"[^\w\s-]", "", heading.lower()).replace(" ", "-") for heading in headings}
                    self.assertIn(unquote(url.fragment), slugs, (name, target))

    def test_cross_repo_links_and_release_downloads_use_the_correct_repository(self):
        source = self.source / "annotations/README.en.md"
        source.write_text(source.read_text().replace("## Development and license", "[Upstream install](../INSTALL.md#手动安装)\n\n## Development and license"), encoding="utf-8")
        repository = "https://github.com/example/annotation-distribution"
        export_plugin.export(self.output, repository)
        for name in ("README.md", "README.zh-CN.md"):
            text = (self.output / name).read_text()
            self.assertIn(f"]({repository}/releases/latest)", text)
            for runtime in ("main.js", "manifest.json", "styles.css"):
                self.assertIn(f"]({repository}/releases/latest/download/{runtime})", text)
            self.assertNotIn("](../INSTALL.md", text)
        english = (self.output / "README.md").read_text()
        self.assertIn("](https://github.com/bufan1024/obsidian-inkstone/blob/main/INSTALL.md#手动安装)", english)
        self.assertIn("not included here", english)

    @unittest.skipUnless(shutil.which("node"), "Node.js is needed to verify independent builds")
    def test_detached_build_reproduces_runtime_and_runs_its_own_tests(self):
        # Build the expected bytes with the original monorepo entry point in a fixture.
        for relative in ("annotations/build.mjs", "theme.css", "examples/划线与备注示例.md"):
            target = self.source / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(PROJECT / relative, target)
        subprocess.run(["node", str(self.source / "annotations/build.mjs")], check=True, capture_output=True, text=True)
        status, _, error = self.run_export()
        self.assertEqual(status, 0, error)
        expected = {name: (self.output / name).read_bytes() for name in ("main.js", "styles.css")}
        self.assertFalse((self.output.parent / "theme.css").exists())
        self.assertFalse((self.output.parent / "examples").exists())
        subprocess.run(["node", "build.mjs"], cwd=self.output, check=True, capture_output=True, text=True)
        self.assertEqual(expected, {name: (self.output / name).read_bytes() for name in expected})
        self.assertFalse((self.output.parent / "theme.css").exists())
        tests = sorted(str(path.relative_to(self.output)) for path in (self.output / "tests").glob("*.test.cjs"))
        subprocess.run(["node", "--test", *tests], cwd=self.output, check=True, capture_output=True, text=True)


if __name__ == "__main__":
    unittest.main()
