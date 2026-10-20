#!/usr/bin/env python3
"""Install Inkstone into an existing Obsidian vault using Python's standard library."""

import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
import tempfile
import uuid


ROOT = Path(__file__).resolve().parents[1]


class InstallError(Exception):
    """An invalid source, vault or configuration that must not be overwritten."""


@dataclass(frozen=True)
class Change:
    relative: Path
    content: bytes
    previous: object  # bytes for an existing file; None for a new file.


@dataclass(frozen=True)
class Plan:
    config: Path
    changes: tuple
    theme_only: bool


def checked_file(config, relative):
    """Reject escaped symlinks and file/directory collisions before any write."""
    target = config / relative
    try:
        target.resolve().relative_to(config)
    except (ValueError, RuntimeError, OSError) as exc:
        raise InstallError("目标路径或符号链接越出配置目录：{}".format(target)) from exc
    for parent in target.parents:
        if parent == config:
            break
        if parent.exists() and not parent.is_dir():
            raise InstallError("应为目录的位置已有文件：{}".format(parent))
    if target.exists() and not target.is_file():
        raise InstallError("应为文件的位置已有目录或其他对象：{}".format(target))
    if target.is_symlink() and not target.exists():
        raise InstallError("目标是失效的符号链接：{}".format(target))
    return target


def read_existing(config, relative):
    target = checked_file(config, relative)
    return target.read_bytes() if target.exists() else None


def reject_json_constant(value):
    raise ValueError("不支持的 JSON 常量：{}".format(value))


def setting_bytes(config, relative, updates):
    previous = read_existing(config, relative)
    try:
        settings = json.loads(previous.decode("utf-8-sig"), parse_constant=reject_json_constant) if previous is not None else {}
    except (ValueError, UnicodeError) as exc:
        raise InstallError("配置文件不是有效的 UTF-8 JSON，未修改任何文件：{}".format(config / relative)) from exc
    if not isinstance(settings, dict):
        raise InstallError("配置文件必须是 JSON 对象，未修改任何文件：{}".format(config / relative))
    if previous is not None and all(key in settings and type(settings[key]) is type(value) and settings[key] == value
                                    for key, value in updates.items()):
        return previous, previous
    settings.update(updates)
    return previous, (json.dumps(settings, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def create_plan(vault, config_dir=".obsidian", theme_only=False):
    if not config_dir or config_dir in (".", "..") or any(char in config_dir for char in "/\\:"):
        raise InstallError("--config-dir 必须是单个相对文件夹名，例如 .obsidian。")
    vault = Path(vault).expanduser()
    if not vault.is_absolute():
        raise InstallError("--vault 请使用笔记库的绝对路径。")
    if not vault.is_dir():
        raise InstallError("笔记库不存在或不是目录：{}".format(vault))
    config = vault / config_dir
    if not config.is_dir():
        raise InstallError("配置目录不存在：{}。请先用 Obsidian 打开此笔记库一次。".format(config))
    config = config.resolve()
    try:
        config.relative_to(vault.resolve())
    except ValueError as exc:
        raise InstallError("配置目录的符号链接指向笔记库外部，未修改任何文件：{}".format(config)) from exc

    kit_theme = ROOT / "themes/Inkstone"
    theme_source = kit_theme if kit_theme.is_dir() else ROOT
    plugin_source = ROOT / "plugins/inkstone-annotations" if kit_theme.is_dir() else ROOT / "annotations"
    files = [(theme_source / name, Path("themes/Inkstone") / name) for name in ("theme.css", "manifest.json")]
    if not theme_only:
        files += [(plugin_source / name, Path("plugins/inkstone-annotations") / name)
                  for name in ("main.js", "styles.css", "manifest.json")]

    desired = []
    for source, relative in files:
        if not source.is_file():
            raise InstallError("安装源文件缺失：{}。请使用完整源码或安装合集。".format(source))
        desired.append(Change(relative, source.read_bytes(), read_existing(config, relative)))
    # Validate both JSON files before creating even a target directory.
    for relative, updates in (
        (Path("appearance.json"), {"cssTheme": "Inkstone", "theme": "moonstone"}),
        (Path("app.json"), {"readableLineLength": True}),
    ):
        previous, content = setting_bytes(config, relative, updates)
        desired.append(Change(relative, content, previous))

    changes = [change for change in desired if change.previous != change.content]
    if any(change.previous is not None for change in changes):
        # This also checks an existing backup-root symlink before any write.
        checked_file(config, Path("inkstone-backups/.preflight-check"))
    return Plan(config, tuple(changes), theme_only)


def atomic_write(config, relative, content):
    target = checked_file(config, relative)
    target.parent.mkdir(parents=True, exist_ok=True)
    target = checked_file(config, relative)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(prefix=".inkstone-", dir=str(target.parent), delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(str(temporary), str(target))
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def apply_plan(plan):
    # Recheck all targets before backups or writes if a plan was held in memory.
    for change in plan.changes:
        if read_existing(plan.config, change.relative) != change.previous:
            raise InstallError("规划后文件发生变化，请关闭 Obsidian 后重新运行：{}".format(plan.config / change.relative))
    existing = [change for change in plan.changes if change.previous is not None]
    backup = None
    if existing:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
        backup = Path("inkstone-backups") / (stamp + "-" + uuid.uuid4().hex[:8])
        for change in existing:
            checked_file(plan.config, backup / change.relative)
        # Back up every replaced file before changing any installed file.
        for change in existing:
            atomic_write(plan.config, backup / change.relative, change.previous)
    for change in plan.changes:
        atomic_write(plan.config, change.relative, change.content)
    return plan.config / backup if backup is not None else None


def install(vault, config_dir=".obsidian", theme_only=False, dry_run=False):
    plan = create_plan(vault, config_dir, theme_only)
    if dry_run:
        print("安装预览（未写入任何文件）：{}".format(plan.config))
        for change in plan.changes:
            print("  {} {}".format("更新并备份" if change.previous is not None else "新增", change.relative))
        if not plan.changes:
            print("文件与设置已是最新，无需修改。")
        return len(plan.changes)

    backup = apply_plan(plan)
    if plan.changes:
        print("安装完成，已更新 {} 个文件：{}".format(len(plan.changes), plan.config))
    else:
        print("文件与设置已是最新，无需修改。")
    if backup is not None:
        print("原文件备份：{}".format(backup))
    print("请关闭并重启 Obsidian，使主题和设置生效；建议运行脚本前先关闭 Obsidian，避免设置被覆盖。")
    if not theme_only:
        print("首次安装还需在「设置 → 第三方插件」手动关闭受限模式，并启用「墨读标注 Inkstone Annotations」。")
        print("脚本不会修改已启用的插件列表或受限模式，也不会改动笔记、插件 data.json 或其他文件。")
    return len(plan.changes)


def main(argv=None):
    parser = argparse.ArgumentParser(description="安装墨读主题和可选标注插件（不联网）。请先关闭 Obsidian。")
    parser.add_argument("--vault", required=True, help="已用 Obsidian 打开过的笔记库绝对路径")
    parser.add_argument("--config-dir", default=".obsidian", help="配置文件夹名，默认 .obsidian")
    parser.add_argument("--theme-only", action="store_true", help="只安装主题")
    parser.add_argument("--dry-run", action="store_true", help="校验并列出变更，不写入文件")
    args = parser.parse_args(argv)
    try:
        install(args.vault, args.config_dir, args.theme_only, args.dry_run)
    except (InstallError, OSError) as exc:
        print("安装未完成：{}".format(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
