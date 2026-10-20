#!/usr/bin/env python3
"""Build release ZIPs from an explicit list of Inkstone project files."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path, PurePosixPath
import re
import sys
import tempfile
import zipfile


ROOT = Path(__file__).resolve().parent.parent
THEME_FILES = (
    "theme.css",
    "manifest.json",
    "README.md",
    "INSTALL.md",
    "LICENSE",
    "VALIDATION.md",
    "preview.png",
    "preview-details.png",
    "preview-annotations.png",
    "preview-highlights.png",
    "preview-monochrome.png",
    "preview-workspace.png",
    "preview-live-preview.png",
    "preview-reading-settings.png",
    "examples/阅读与排版示例.md",
    "examples/划线与备注示例.md",
)
PLUGIN_FILES = (
    "main.js",
    "styles.css",
    "manifest.json",
    "README.md",
    "LICENSE",
    "examples/划线与备注示例.md",
)
INSTALLER_FILE = "scripts/install.py"
SOURCE_URL = "https://github.com/bufan1024/obsidian-inkstone/blob/main/"
AI_INSTALL_URL = SOURCE_URL + "README.md#用-codex--ai-安装"
RELEASE_DOC_LINKS = {
    "annotations/README.md": SOURCE_URL + "annotations/README.md",
    "scripts/install.py": SOURCE_URL + "scripts/install.py",
    "scripts/package.py": SOURCE_URL + "scripts/package.py",
    "tests/native/README.md": SOURCE_URL + "tests/native/README.md",
    "README.md#用-codex--ai-安装": AI_INSTALL_URL,
}
VERSION_PATTERN = re.compile(
    r"[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?"
)


def read_project_file(relative: str) -> bytes:
    """Read only regular, non-symlink files inside this source checkout."""
    parts = PurePosixPath(relative).parts
    if not parts or any(part in ("..", ".qa", ".git", "dist") for part in parts):
        raise ValueError(f"Disallowed source path: {relative}")
    candidate = ROOT.joinpath(*parts)
    if PurePosixPath(relative).is_absolute():
        raise ValueError(f"Absolute source path is not allowed: {relative}")
    current = candidate
    while current != ROOT:
        if current.is_symlink():
            raise ValueError(f"Symlinks are not allowed in release files: {relative}")
        current = current.parent
    if not candidate.is_file():
        raise ValueError(f"Required release file is missing: {relative}")
    if ROOT not in candidate.resolve().parents:
        raise ValueError(f"Source file is outside the project: {relative}")
    return candidate.read_bytes()


def manifest_version(data: bytes, label: str) -> str:
    manifest = json.loads(data)
    version = manifest.get("version", "")
    if not isinstance(version, str) or not VERSION_PATTERN.fullmatch(version):
        raise ValueError(f"Invalid {label} manifest version: {version!r}")
    return version


def release_markdown(data: bytes, replacements: dict[str, str]) -> bytes:
    """Keep bundled links local and point source-only links to GitHub."""
    text = data.decode("utf-8")
    for relative, destination in replacements.items():
        text = text.replace(f"]({relative})", f"]({destination})")
    return text.encode("utf-8")


def kit_readme(theme_version: str, plugin_version: str) -> bytes:
    return f"""# 墨读 Inkstone 阅读与标注合集

主题版本 {theme_version}，标注插件版本 {plugin_version}。本包已包含运行所需文件，无需 Node.js 或构建步骤。

## 首次安装

1. 关闭 Obsidian，解压整个合集，并确保电脑已安装 Python 3。
2. 在解压后的目录打开终端，将下方路径替换为你的笔记库绝对路径后运行：

   ```sh
   python3 scripts/install.py --vault "/你的笔记库路径"
   ```

   Windows 可使用 `py -3` 替换 `python3`。可以先加 `--dry-run` 查看计划。
3. 重新打开 Obsidian。在「设置 → 第三方插件」关闭受限模式，并手动启用「墨读标注 Inkstone Annotations」。安装程序不会自动启用第三方插件。
4. 选中普通文字，使用快捷标注条、右键「墨读：标注与备注…」或同名命令添加标注。

首次完整安装会选用 Inkstone 浅色主题并开启可读行宽。只安装主题可添加 `--theme-only`；只安装插件可添加 `--plugin-only`，不会切换主题、配色或行宽。使用自定义配置文件夹时添加 `--config-dir "配置文件夹名"`。

## 更新已有安装

获取新版合集并解压，关闭 Obsidian 后运行：

```sh
# 更新主题与插件运行文件，保留个人偏好
python3 scripts/install.py --vault "/你的笔记库路径" --update

# 只更新标注插件
python3 scripts/install.py --vault "/你的笔记库路径" --update --plugin-only

# 只更新主题
python3 scripts/install.py --vault "/你的笔记库路径" --update --theme-only
```

可先加 `--dry-run` 查看计划。`--update` 不读取或改写 `appearance.json`、`app.json`，保留当前主题、配色和可读行宽偏好；`--plugin-only` 无论是否配合 `--update`，都只处理插件的三个运行文件。`--theme-only` 和 `--plugin-only` 不能同时使用。

内容不同的旧文件会先备份，终端会打印备份位置。插件 `data.json`、已启用插件列表和笔记正文会保留。已有用户请使用 `--update`；再次运行首次完整安装命令会重新选用 Inkstone、浅色配色和可读行宽。脚本完成后请重启 Obsidian，脚本不会自动启用插件。

完整安装、备份与恢复说明见 [INSTALL.md](INSTALL.md)，Codex / AI 助手完整提示词见 [在线 README]({AI_INSTALL_URL})。主题功能与截图见 [主题说明](themes/Inkstone/README.md)，标注使用说明见 [插件说明](plugins/inkstone-annotations/README.md)。

## 手动安装

将 `themes/Inkstone` 复制到笔记库的 `.obsidian/themes/`，将 `plugins/inkstone-annotations` 复制到 `.obsidian/plugins/`。重新打开 Obsidian 后，在「设置 → 外观」选择 Inkstone 和浅色配色，并手动启用插件。使用自定义配置文件夹时，将 `.obsidian` 替换为实际文件夹名。

将 [划线与备注示例](examples/划线与备注示例.md) 复制到笔记库可体验彩色高亮、灰阶线型和脚注备注。
""".encode("utf-8")


def verify_zip(path: Path, expected: dict[str, bytes]) -> None:
    with zipfile.ZipFile(path) as archive:
        if archive.testzip() is not None:
            raise ValueError(f"ZIP integrity check failed: {path.name}")
        if archive.namelist() != sorted(expected):
            raise ValueError(f"ZIP file list does not match its allowlist: {path.name}")
        for name, content in expected.items():
            if archive.read(name) != content:
                raise ValueError(f"ZIP content mismatch: {path.name}: {name}")


def write_zip(path: Path, files: dict[str, bytes]) -> None:
    """Write deterministic ZIP contents, verify them, then replace the old ZIP."""
    with tempfile.NamedTemporaryFile(
        prefix=f".{path.name}.", suffix=".tmp", dir=path.parent, delete=False
    ) as temporary:
        temporary_path = Path(temporary.name)
    try:
        with zipfile.ZipFile(
            temporary_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9
        ) as archive:
            for name in sorted(files):
                archive_path = PurePosixPath(name)
                if archive_path.is_absolute() or any(
                    part in ("..", ".qa", ".git", "dist")
                    for part in archive_path.parts
                ):
                    raise ValueError(f"Unsafe ZIP entry: {name}")
                entry = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
                entry.create_system = 3
                entry.external_attr = 0o100644 << 16
                entry.compress_type = zipfile.ZIP_DEFLATED
                archive.writestr(entry, files[name], compresslevel=9)
        verify_zip(temporary_path, files)
        os.replace(temporary_path, path)
    finally:
        temporary_path.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=ROOT / "dist",
        help="Release ZIP destination (default: project dist/).",
    )
    args = parser.parse_args()

    try:
        # Read a fixed whitelist once so every package uses the same file bytes.
        theme = {name: read_project_file(name) for name in THEME_FILES}
        plugin = {
            name: read_project_file(f"annotations/{name}") for name in PLUGIN_FILES
        }
        installer = read_project_file(INSTALLER_FILE)
        theme_version = manifest_version(theme["manifest.json"], "theme")
        plugin_version = manifest_version(plugin["manifest.json"], "plugin")
        for name in ("README.md", "INSTALL.md", "VALIDATION.md"):
            theme[name] = release_markdown(theme[name], RELEASE_DOC_LINKS)

        theme_package = {f"Inkstone/{name}": data for name, data in theme.items()}
        plugin_package = {
            f"inkstone-annotations/{name}": data for name, data in plugin.items()
        }
        kit_package = {
            f"themes/Inkstone/{name}": data for name, data in theme.items()
        }
        kit_package.update(
            {f"plugins/inkstone-annotations/{name}": data for name, data in plugin.items()}
        )
        kit_package.update(
            {
                "README.md": kit_readme(theme_version, plugin_version),
                "INSTALL.md": release_markdown(
                    theme["INSTALL.md"],
                    {
                        "examples/阅读与排版示例.md": SOURCE_URL
                        + "examples/阅读与排版示例.md",
                        "VALIDATION.md": "themes/Inkstone/VALIDATION.md",
                    },
                ),
                INSTALLER_FILE: installer,
                "examples/划线与备注示例.md": theme["examples/划线与备注示例.md"],
            }
        )

        destination = args.output_dir.resolve()
        destination.mkdir(parents=True, exist_ok=True)
        releases = (
            (f"Inkstone-{theme_version}.zip", theme_package),
            (f"Inkstone-Annotations-{plugin_version}.zip", plugin_package),
            (f"Inkstone-Reading-Kit-{theme_version}.zip", kit_package),
        )
        for name, files in releases:
            output = destination / name
            write_zip(output, files)
            print(f"Created {output.name}: {len(files)} files, {output.stat().st_size} bytes")
        print(f"Verified all ZIP entries and package bytes. Output: {destination}")
        return 0
    except (OSError, ValueError, zipfile.BadZipFile) as error:
        print(f"Packaging failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
