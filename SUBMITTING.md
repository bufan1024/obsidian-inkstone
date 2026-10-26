# Community directory submission

[简体中文项目说明](README.md) · [English project guide](README.en.md)

The annotation plugin and the Inkstone theme require separate community directory submissions. This document covers their repositories, releases, and submission states. A GitHub release or local test does not establish directory approval.

## Current status (2026-10-26)

Plugin **1.2.0** is published in the [standalone distribution repository](https://github.com/bufan1024/obsidian-inkstone-annotations/releases/tag/1.2.0). Theme **1.5.0** and `Inkstone-Reading-Kit-1.5.0.zip` are published in the [theme repository](https://github.com/bufan1024/obsidian-inkstone/releases/tag/1.5.0). The reading kit contains theme **1.5.0** and plugin **1.2.0**.

The earlier automated review for plugin **1.1.8** completed on **2026-10-22**; that result does not establish approval of **1.2.0**. Check the directory page for the new version's synchronization and review status. At that historical check, its [public directory page](https://community.obsidian.md/plugins/inkstone-annotations) showed **Review Satisfactory** and **Health Excellent**, with **Add to Obsidian** available. Open that page → choose **Add to Obsidian** → follow the prompts in Obsidian to install and enable the plugin. GitHub Releases remain a manual installation alternative.

Non-blocking plugin recommendations and CSS warnings remain; they have not all been addressed.

The theme is listed with **Light only** support. Check its [public theme page](https://community.obsidian.md/themes/inkstone) for the **1.5.0** sync and review status. The earlier **1.3.7** review (commit `701b0a6`) completed on **2026-10-21**; that result does not establish approval of 1.5.0. Open the theme page → choose **Add to Obsidian** → follow the prompts in Obsidian to use or select Inkstone. GitHub installation remains an alternative.

The earlier theme review included non-blocking README-language and CSS warnings.

## Repository and release

The source of truth is `annotations/` in [obsidian-inkstone](https://github.com/bufan1024/obsidian-inkstone). The directory distribution repository is [obsidian-inkstone-annotations](https://github.com/bufan1024/obsidian-inkstone-annotations). Its default branch has the plugin's own `manifest.json`, English `README.md`, Chinese `README.zh-CN.md`, MIT `LICENSE`, readable source, tests, and a self-contained build at the root.

Export a new version from a clean, verified source checkout into a new or empty directory:

```sh
node annotations/build.mjs
node --test annotations/tests/*.test.cjs
python3 -m unittest discover -s scripts -p 'test_*.py'
python3 scripts/export_plugin.py --output-dir "/absolute/path/to/empty/plugin-export"
```

In that exported directory, run `npm run build` and `npm test`. The generated `main.js` and `styles.css` must match the source repository byte for byte. Keep source changes in the upstream `annotations/` directory, then export a fresh candidate; do not maintain a separate implementation in the distribution repository.

Use the plugin manifest's version as the release tag: **`1.2.0`**, without a `v` prefix. Attach **`main.js`**, **`manifest.json`**, and **`styles.css`** directly to the published release. A source archive or ZIP alone does not satisfy installation requirements.

The plugin ID remains `inkstone-annotations`, including for existing manual installations. The directory display name is **Inkstone Annotations**; commands and controls default to Chinese, with an explicit English setting. Restart the plugin after changing language to refresh command names. Both README languages explain these labels. Annotations are stored in the note as HTML and native footnotes. The plugin has no network calls, telemetry, paid features, required accounts, or runtime Node.js/Electron dependency. Mobile apps and physical e-ink devices have not been tested.

### Theme release and submission

The theme uses [obsidian-inkstone](https://github.com/bufan1024/obsidian-inkstone), with `preview.png` as its submission screenshot and **Light only** as the supported color scheme. The latest published theme is **`1.5.0`**, using the bare manifest-version tag and direct **`theme.css`** and **`manifest.json`** release attachments. The same release also provides theme, plugin, and reading-kit ZIPs with a checksum file.

The historical `1.3.7` release uses the same commit (`701b0a6`) and runtime files as the retained `v1.3.7` tag. Its reading kit contains theme **1.3.7** and plugin **1.1.7**. Keep those old tags and download assets unchanged; use the **1.5.0** kit for current installations.

## Submit through Obsidian Community

1. Open [Obsidian Community](https://community.obsidian.md), sign in with an Obsidian account, and connect the owning GitHub account. The documented connection reads public profile information to verify repository ownership.
2. Open **Your plugins → New plugin**. Use `https://github.com/bufan1024/obsidian-inkstone-annotations` as the repository URL and select the correct owner.
3. Read the developer policies and the maintenance commitment shown by the form. The owner must confirm that they agree and will keep the plugin working, or remove or transfer it if they stop maintaining it.
4. Submit, inspect the automated review, and address any reported errors. For code fixes, increment the plugin version and publish a new release with the direct runtime attachments. Approval or availability is determined by the community platform, not by this repository's CI.

After publication, updates use new version releases in the same distribution repository; do not create a new directory entry for every update. Keep both README languages current with the public page, verified review status, and installation instructions.

## Official references

- [Submit a plugin](https://docs.obsidian.md/plugins/releasing/submit-plugin)
- [Account setup and repository ownership](https://docs.obsidian.md/community-directory/set-up-and-claim)
- [Plugin submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins)
- [Manifest reference](https://docs.obsidian.md/Reference/Manifest)
- [Developer policies](https://docs.obsidian.md/community-directory/developer-policies)
- [Directory FAQ and automated review](https://docs.obsidian.md/community-directory/faq)

Requirements last checked against the official documentation on 2026-10-26. Theme submission has its own [official flow](https://docs.obsidian.md/themes/app-themes/submit-theme).
