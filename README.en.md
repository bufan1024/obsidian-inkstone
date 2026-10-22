# Inkstone · 墨读

[简体中文](README.md) · English

A light Obsidian theme for long reading sessions, with an optional plugin for highlights, underlines, thoughts, and Markdown excerpts. Designed with Chinese text and e-ink reading in mind.

**[Marketplace installation and updates (recommended)](#install-or-update)** · **[Theme listing](https://community.obsidian.md/themes/inkstone)** · **[Plugin listing](https://community.obsidian.md/plugins/inkstone-annotations)** · **[Annotation guide](annotations/README.en.md)**

Local source versions: **theme 1.3.8 / annotation plugin 1.1.8 (unreleased)**. Published versions remain **1.3.7 / 1.1.7**; the new interactions described below apply to local source. Requires Obsidian **1.10.6 or later**. The plugin interface is currently in Chinese; this guide keeps its actual labels alongside English explanations. Install the theme and plugin separately from Obsidian's community directory; GitHub Releases and the install script are alternatives.

The theme uses a white background, dark gray text, a default line height of 1.75, and a reading width of 40em. Font and font size follow Obsidian's native Appearance settings. The theme is plain CSS and works without the plugin.

## Two short demos

Earlier interaction recordings from a separate sample vault on macOS with Obsidian 1.14.4; labels may differ. Click a GIF to view it at full size.

### Select text and write a thought

![Select text, write a thought, choose a style, save, and manage an existing annotation](assets/annotate.gif)

1. Select plain text and click **「写想法」 (Write a thought)** in the floating toolbar.
2. Type a thought, choose one of four highlight colors or an underline, then click **「保存想法」 (Save thought)** or press `Cmd+Enter` / `Ctrl+Enter`. Changing styles keeps your draft. The text and style are saved together; **「取消」 (Cancel)** writes nothing.
3. Click an existing annotation to open its small menu. Selecting a color or underline on the menu's first screen applies it immediately. **「写想法」 / 「编辑想法」 (Write / Edit thought)** opens a composer within the same popover, where style and note changes wait until Save.

If the animation does not play, see the [thought composer](preview-selection-idea.png) and [existing annotation menu](preview-annotation-menu.png).

### Edit from the sidebar and export excerpts

![Edit annotations from the sidebar, change colors, write thoughts, filter, and export](assets/review-export.gif)

1. Choose **「更多 → 打开标注侧栏」 (More → Open annotation sidebar)**, or run **「墨读：打开标注侧栏」** from the command palette.
2. Click **「编辑」 (Edit)** below an excerpt. The same small menu opens beside that button. A color or underline selected on its first screen takes effect immediately.
3. Choose **「写想法」 / 「编辑想法」** to write or edit a note in the popover. Save applies the selected style and thought together; Cancel writes nothing.
4. Filter by color or underline, then return to **「全部标注」 (All annotations)**. The list scrolls independently, keeping the filter and export controls visible. Updates to the same note preserve those controls and their keyboard focus.
5. Click **「导出全部」 (Export all)**. The header shows filtered and total counts; the export description also states the total. A new Markdown file opens beside the original note, containing all annotations, thoughts, and a source link. Export ignores the sidebar filter and adds a number if the filename already exists.

See the [sidebar screenshot](preview-workspace.png) or the [sidebar and export guide](annotations/README.en.md#sidebar-and-excerpt-export).

## Install or update

### Recommended: install from Obsidian's community directory

Open the vault you want to use in Obsidian first. Community installation requires no Git, Python, or build tools. The theme and annotation plugin are separate components:

- **Theme:** Open **Settings → Appearance → Themes → Manage**, search for **Inkstone**, and choose **Install and use**. Inkstone supports **Light only**; set the color scheme to light.
- **Plugin:** Open **Settings → Community plugins** and turn off **Restricted mode** if needed on first use. Choose **Browse**, search for **Inkstone Annotations** (plugin ID: `inkstone-annotations`), then select **Install → Enable**. You can also turn on its switch under **Installed plugins** after installation. The plugin can be used without the theme.
- **Check the result:** In a note, select plain text within one source line. The floating toolbar should offer **「划线」 (Mark)** and **「写想法」 (Write a thought)**. Search the command palette for **「墨读：打开标注侧栏」** to open the annotation sidebar.

You can also open the [theme page](https://community.obsidian.md/themes/inkstone) or [plugin page](https://community.obsidian.md/plugins/inkstone-annotations) and choose **Add to Obsidian**, then finish in the target vault. Installing the theme does not install or enable the plugin.

### Update only the theme or plugin

- **Plugin:** Open **Settings → Community plugins → Current plugins → Check for updates**. Under **Installed plugins**, choose **Update** beside **Inkstone Annotations** only, then confirm its switch is still enabled.
- **Theme:** Open **Settings → Appearance → Themes → Manage** and select **Inkstone**. If **Check for updates** is shown, use it first, then choose **Update** when available. Confirm that Inkstone and the Light color scheme remain selected.

New theme and plugin versions are not installed automatically. Update them separately; you do not need **Update all** to update only Inkstone. Try a highlight or thought afterward. If you previously installed from GitHub using `themes/Inkstone/` and `plugins/inkstone-annotations/` with the original plugin ID, check for marketplace updates without uninstalling first; keep plugin `data.json`, saved annotations, and your preferences. See the official [community plugin](https://obsidian.md/help/community-plugins) and [theme](https://obsidian.md/help/themes) guides for the app's installation and update controls.

### Alternative: GitHub Release or install script

Use this method if the marketplace is temporarily unavailable.

Download and extract the [published reading kit](https://github.com/bufan1024/obsidian-inkstone/releases/latest), `Inkstone-Reading-Kit-1.3.7.zip`, or clone this repository. Local source 1.3.8 / 1.1.8 has not been published. Open the target vault in Obsidian at least once so its configuration folder exists, then **quit Obsidian before installing or updating**.

Run these commands from the extracted kit or repository directory. Python 3 is required; Node.js is not required to install the built files.

```sh
# Preview a first installation without writing files
python3 scripts/install.py --vault "/absolute/path/to/your/vault" --dry-run

# First installation: theme and plugin
python3 scripts/install.py --vault "/absolute/path/to/your/vault"

# Update runtime files while keeping your current reading preferences
python3 scripts/install.py --vault "/absolute/path/to/your/vault" --update

# Update only the annotation plugin
python3 scripts/install.py --vault "/absolute/path/to/your/vault" --update --plugin-only
```

On Windows, replace `python3` with `py -3`, for example:

```powershell
py -3 scripts/install.py --vault "D:\Notes" --update
```

| Option | Behavior |
| --- | --- |
| `--vault "/absolute/path"` | Target one existing vault. Keep paths containing spaces in quotes. |
| `--config-dir "folder-name"` | Use a custom configuration folder instead of `.obsidian`. It must be a single folder name inside the vault. |
| `--dry-run` | Validate and show the plan without writing files. |
| `--update` | Replace runtime files without reading or changing `appearance.json` or `app.json`. |
| `--theme-only` | Install only the theme. Combine with `--update` to preserve reading preferences. |
| `--plugin-only` | Install only the plugin; preserve theme, color scheme, and readable-line-width preferences, with or without `--update`. |

`--theme-only` and `--plugin-only` cannot be combined. A first full installation, or a first `--theme-only` installation, selects Inkstone, light mode, and readable line width. Existing users should use `--update`; repeating the first-install command resets those three preferences.

The installer backs up files that differ under `<config-folder>/inkstone-backups/` and prints the actual location. It keeps notes, plugin `data.json`, other plugin settings, and the enabled-plugin list. It does not enable plugins or change Restricted mode.

#### Enable the plugin after script installation

After a first script installation, reopen Obsidian. Confirm Inkstone and light mode under **Settings → Appearance**, then open **Settings → Community plugins**, turn off Restricted mode if needed, and manually enable **Inkstone Annotations**. A successful script run does not mean the plugin is enabled. Skip this step when using only the theme.

### Manual installation

This is another alternative to marketplace installation.

Copy the kit's `themes/Inkstone/` and `plugins/inkstone-annotations/` folders into your vault's configuration folder:

```text
Your vault/
└── .obsidian/
    ├── themes/
    │   └── Inkstone/
    │       ├── theme.css
    │       └── manifest.json
    └── plugins/
        └── inkstone-annotations/
            ├── main.js
            ├── styles.css
            └── manifest.json
```

Replace `.obsidian` if you use a custom configuration folder. Avoid an extra nested folder with the same name. In the source repository, the theme files are at the root and the plugin files are in `annotations/`. Separate theme and plugin ZIPs are also available.

For a first manual installation, select Inkstone and light mode under Appearance, enable **Readable line length** under Editor, and enable the plugin as described above. For an update, quit Obsidian, back up the old runtime files, and replace only the two theme files or three plugin files shown above. Keep plugin `data.json` and your preferences. To restore an installation, quit Obsidian and copy the backed-up files to their original paths; see the [backup and restore reference](INSTALL.md) for details.

## Install with Codex or another AI assistant

Prefer [marketplace installation](#install-or-update). For an AI-assisted script installation, use an assistant that can access local files and run commands. Replace the vault path before sending this prompt. With a chat-only assistant, follow the marketplace steps yourself or use [manual installation](#manual-installation).

<details>
<summary>Copy the installation prompt</summary>

```text
Install or update the Inkstone theme and its annotation plugin in this Obsidian vault:
/replace/with/the/absolute/path/to/my/vault
Configuration folder: .obsidian (replace this if the vault uses a custom folder)

Repository: https://github.com/bufan1024/obsidian-inkstone

Please perform the installation:
1. Clone the repository into a temporary directory and read README.en.md and INSTALL.md.
2. Verify that the specified vault and configuration folder exist. Check only this vault.
   Ask me if the path is missing or the configuration folder is unclear; do not guess
   or scan other vaults. Ask me to quit the target vault before writing files if needed.
3. Check themes/Inkstone/ and plugins/inkstone-annotations/ inside that configuration folder.
   If either component is already installed, use --update to preserve my theme,
   color scheme, and readable-line-width preferences. Otherwise use first installation.
4. Run python3 scripts/install.py --vault "the absolute path above" --dry-run first,
   then run the same command without --dry-run. Add --update to both commands when
   updating, and --config-dir "folder-name" to both when using a custom folder.
   On Windows, use py -3 instead of python3 if appropriate.
5. Do not modify notes, delete files, overwrite plugin data.json, or change other plugins.
   Use the installer's backups rather than bypassing it to overwrite configuration.
6. Check the installed runtime files. Report the result and actual backup location,
   and remind me to restart Obsidian. On first installation, remind me to turn off
   Restricted mode and manually enable “Inkstone Annotations” in Community
   plugins. Do not report the plugin as enabled merely because the script succeeded.

If Git or Python 3 is unavailable, explain what is missing and use the Release kit's
manual installation method. Do not install into any unspecified vault or stop at
giving me instructions without carrying out the authorized installation.
```

</details>

The installer does not call an AI API or require an API key.

## Try it with one note

Copy the [annotation example](examples/划线与备注示例.md) into your vault, or create a note with these separate paragraphs:

```markdown
# Reading practice

A useful annotation helps the next reading session pick up the thought.

After a chapter, write down one small thing to try today.
```

Select a phrase in the first paragraph, choose **「写想法」**, select yellow, type a note, and save. Underline a phrase in the second paragraph using **「划线样式 → 下划线」 (Annotation style → Underline)**. Click the first annotation to try its menu, then open the sidebar and use **「定位原文」 (Locate source)** or **「编辑」 (Edit)**. Export the excerpts to a new file.

After you edit thought text or its draft style, incidental outside clicks, scrolling, and reactivating the same source keep the draft open. **「取消」 (Cancel)** and `Esc` explicitly discard it without writing. Unchanged menus still dismiss on outside click or scroll. Switching notes or changing the source prevents stale saves.

The **「墨读：写想法」 (Write a thought)** command uses the same small composer. **「墨读：标注与想法」 (Annotation and thought)**, the ribbon icon, and the full context-menu entry open the larger panel. Existing command IDs and shortcut bindings are retained.

The sidebar follows the newly opened export. Seeing no annotations there is expected: the export is ordinary Markdown. Switch back to the source note to keep managing annotations. Exports are snapshots and do not synchronize with later edits.

## Reading settings

Use Obsidian **Settings → Appearance** for font and font size. Inkstone uses fonts already installed on your device and downloads no resources. The plugin offers line heights of **1.5 / 1.75 / 2.0** and widths of **32em / 40em / 48em**. Enable **Settings → Editor → Readable line length**. Resetting the presets follows the theme or CSS while keeping native font settings.

Enable **「墨水屏显示」 (E-ink display)** to show all four colors as light gray, distinguished by solid, double, dotted, and dashed underlines. This changes the display without changing colors saved in the note. With the plugin disabled, Inkstone still renders saved annotation markup and native footnotes.

Reading view, Live Preview, and source mode adjust margins to the Markdown pane width, leaving room for text in narrow splits. Resolved internal links use dotted decoration to distinguish them from solid annotation underlines. Images keep explicitly specified heights; automatic proportional sizing applies only when no height is specified. Native notices retain readable text and actions, and loading indicators remain visible without animation.

For CSS customization, create `.obsidian/snippets/inkstone-reading.css` and enable it under Appearance → CSS snippets:

```css
body.theme-light {
  --inkstone-line-height: 1.75;
  --inkstone-line-width: 40em;
  /* Optional. Remove this variable to restore native font-size control. */
  --inkstone-font-size: 20px;
}
```

When controlling width or line height through CSS, set the plugin presets to **「跟随主题 / CSS」 (Follow theme / CSS)**. Narrow windows still limit the reading width; wide tables and code blocks scroll independently.

[Reading and sidebar](preview-workspace.png) · [Live Preview](preview-live-preview.png) · [Reading settings](preview-reading-settings.png) · [Selection toolbar](preview-toolbar.png) · [Full annotation panel](preview-annotations.png)

| Color highlights | E-ink grayscale |
| --- | --- |
| ![Four highlight colors](preview-highlights.png) | ![Grayscale highlights with distinct line patterns](preview-monochrome.png) |

Reading and interaction screenshots use macOS Obsidian 1.14.4. Color, grayscale, and [typography detail](preview-details.png) screenshots were captured with 1.12.4. All content comes from project examples.

## Compatibility and verification

Inkstone primarily targets light mode. Local verification used macOS Obsidian **1.12.4 and 1.14.4**, covering reading view, Live Preview, source mode, annotation interactions, installation, updates, and packaging. See the [validation record](VALIDATION.md). Narrow-window and synthetic touch tests do not establish support on native mobile apps or physical e-ink devices; neither has been tested. Other Obsidian versions and third-party interfaces may need adjustments. Screen refresh and ghosting depend on the device and operating system.

Annotations are processed locally and stored as HTML with native footnotes. Select plain text within a single source line; visual wrapping is fine. Reading view supports simple paragraphs, including adding more annotations beside existing Inkstone marks. For paragraphs containing links, bold text, or other complex Markdown, select plain text in the editor instead. HTML tags and attributes, link targets, code, math, frontmatter, and cross-line selections are protected. If the note changes or you switch files while a menu is open, reselect the text before saving.

In Live Preview, moving the cursor or selection into an annotation reveals its HTML source; moving away restores the rendered mark. Source mode always shows the saved content. Removing an annotation keeps its text and any footnotes still referenced elsewhere.

Use native undo and redo in the editor. **「墨读：撤销上次标注」 (Undo last annotation)** remembers only the last annotation action since the plugin was loaded, in the same unchanged note. It is not a multi-step history and does not remove exported files. **「墨读：上一屏／下一屏」 (Previous / Next screen)** and status-bar ↑ / ↓ scroll one viewport with some overlap. Commands have no default dedicated shortcuts; bind them in Settings → Hotkeys. See the [full command guide](annotations/README.en.md#commands-and-undo).

## Development and packaging

Built files require no Node.js installation. To change the source, use Node.js **22 or later**:

```sh
node annotations/build.mjs
node --test annotations/tests/*.test.cjs
python3 -m unittest discover -s scripts -p 'test_*.py'
python3 scripts/package.py
```

The build and installer have no third-party package dependencies and make no network requests. The plugin uses the [public Obsidian API](https://github.com/obsidianmd/obsidian-api) and CodeMirror modules bundled with Obsidian. Packaging writes standalone theme, standalone plugin, and reading-kit ZIPs under `dist/`. Generated QA files and release ZIPs are excluded from the source repository.

## Obsidian community directory

The [Inkstone theme](https://community.obsidian.md/themes/inkstone) and [Inkstone Annotations plugin](https://community.obsidian.md/plugins/inkstone-annotations) have separate community pages. Plugin releases use the public [obsidian-inkstone-annotations repository](https://github.com/bufan1024/obsidian-inkstone-annotations). See the [submission and release guide](SUBMITTING.md) for repository layout and release details.

## Design references and license

Typography and spacing draw on OpenDesign's [Paper](https://github.com/nexu-io/open-design/blob/main/design-systems/paper/DESIGN.md), [Editorial](https://github.com/nexu-io/open-design/blob/main/design-systems/editorial/DESIGN.md), and [Minimal](https://github.com/nexu-io/open-design/blob/main/design-systems/minimal/DESIGN.md) systems. Whitespace establishes hierarchy, shared spacing organizes menus and the sidebar, and annotation text scales with interface font size. Existing fonts and colors are retained. Structure is informed by the [official Obsidian theme documentation](https://docs.obsidian.md/Themes/App+themes/Build+a+theme). The compact text-action toolbar takes cues from the [WeRead reading interface](https://weread.qq.com/web/reader/33332bf05cbba0333b1efb4) and is adapted to Obsidian.

[MIT License](LICENSE). For bug reports, include your Obsidian version, operating system, view mode, a minimal note example, and any CSS snippets in use.
