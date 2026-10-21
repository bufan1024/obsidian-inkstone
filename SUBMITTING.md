# Community directory submission

[简体中文项目说明](README.md) · [English project guide](README.en.md)

The annotation plugin and the Inkstone theme are separate entries in Obsidian's community directory. This document describes the plugin submission. A GitHub release is available before a directory listing is approved; do not describe a release or local test as directory approval.

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

Use the plugin manifest's version as the release tag: **`1.1.7`**, without a `v` prefix. Attach **`main.js`**, **`manifest.json`**, and **`styles.css`** directly to the published release. A source archive or ZIP alone does not satisfy installation requirements. The theme-and-reading-kit repository retains its separate `v1.3.7` release convention.

The plugin ID remains `inkstone-annotations`, including for existing manual installations. The directory display name is **Inkstone Annotations**; commands and controls currently use Chinese. Both README languages explain these labels. Annotations are stored in the note as HTML and native footnotes. The plugin has no network calls, telemetry, paid features, required accounts, or runtime Node.js/Electron dependency. Mobile apps and physical e-ink devices have not been tested.

## Submit through Obsidian Community

1. Open [Obsidian Community](https://community.obsidian.md), sign in with an Obsidian account, and connect the owning GitHub account. The documented connection reads public profile information to verify repository ownership.
2. Open **Your plugins → New plugin**. Use `https://github.com/bufan1024/obsidian-inkstone-annotations` as the repository URL and select the correct owner.
3. Read the developer policies and the maintenance commitment shown by the form. The owner must confirm that they agree and will keep the plugin working, or remove or transfer it if they stop maintaining it.
4. Submit, inspect the automated review, and address any reported errors. For code fixes, increment the plugin version and publish a new release with the direct runtime attachments. Approval or availability is determined by the community platform, not by this repository's CI.

After publication, updates use new version releases in the same distribution repository; do not create a new directory entry for every update. Update both README languages with the verified listing URL and installation instructions once the listing exists.

## Official references

- [Submit a plugin](https://docs.obsidian.md/plugins/releasing/submit-plugin)
- [Account setup and repository ownership](https://docs.obsidian.md/community-directory/set-up-and-claim)
- [Plugin submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins)
- [Manifest reference](https://docs.obsidian.md/Reference/Manifest)
- [Developer policies](https://docs.obsidian.md/community-directory/developer-policies)
- [Directory FAQ and automated review](https://docs.obsidian.md/community-directory/faq)

Requirements last checked against the official documentation on 2026-10-21. Theme submission has its own [official flow](https://docs.obsidian.md/themes/app-themes/submit-theme).
