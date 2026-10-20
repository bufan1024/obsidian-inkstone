# 安装与更新 Inkstone 墨读

Inkstone **主题 1.3.3** 是纯 CSS，**标注插件 1.1.3** 为可选组件。主题可单独安装；标注、侧栏、摘录导出、快捷条和按屏翻页需要启用插件。最低 Obsidian 版本为 **1.10.6**。当前通过 GitHub Release 或本仓库安装，尚未上架 Obsidian 社区目录。

操作前关闭目标笔记库或退出 Obsidian，避免应用退出时覆盖刚更新的文件。请先用 Obsidian 打开过该笔记库，使配置目录存在。以下路径都指**笔记库目录**。

## 用 Codex 或其他 AI 安装

在能访问本机文件和运行命令的 AI 编程助手中，复制 [README 中的完整安装提示词](README.md#用-codex--ai-安装)，将笔记库路径替换为自己的绝对路径。提示词会先检查是否已有安装：已有主题或插件时使用 `--update`，保留当前主题、配色和行宽偏好；首次安装才选择 Inkstone、浅色配色并开启可读行宽。

安装脚本不调用 AI API，也不要求 API Key。克隆仓库需要 Git 与 Python 3；下载 Release 合集后，只需 Python 3。仅能聊天、不能访问本机文件的 AI 无法直接替你安装。**首次启用第三方插件仍需在 Obsidian 中手动完成。**

## 脚本安装

### 1. 获取文件

下载 [最新 Release](https://github.com/bufan1024/obsidian-inkstone/releases/latest) 中的主题与标注合集，本版本文件名为 `Inkstone-Reading-Kit-1.3.3.zip`。解压后进入其中含有 `scripts/` 的目录。

也可以克隆源码：

```sh
git clone https://github.com/bufan1024/obsidian-inkstone.git
cd obsidian-inkstone
```

运行已构建的主题与插件不需要 Node.js。插件使用 Obsidian 自带的 CodeMirror，无需用户安装其他依赖。

### 2. 确定笔记库和配置目录

例如，笔记保存在 `/Users/你的名字/Documents/笔记库`，就将这个完整路径作为 `--vault`。Windows 示例为 `D:\笔记库`。路径含空格或中文时保留引号。

默认配置目录是笔记库内的隐藏文件夹 `.obsidian`。可在「设置 → 文件与链接 → 覆盖配置文件夹（Override config folder）」确认实际名称。自定义目录时，在下面所有命令中加 `--config-dir "实际文件夹名"`；它必须是笔记库内的单个文件夹名。

### 3. 首次安装

在源码或合集目录中运行：

```sh
# 校验并显示计划，不写入文件
python3 scripts/install.py --vault "/你的笔记库路径" --dry-run

# 安装主题、插件并选用 Inkstone 浅色主题与可读行宽
python3 scripts/install.py --vault "/你的笔记库路径"
```

Windows 可将 `python3` 换成 `py -3`：

```powershell
py -3 scripts/install.py --vault "D:\笔记库"
```

首次安装还可选择范围：

```sh
# 只安装主题，并选用 Inkstone 浅色主题与可读行宽
python3 scripts/install.py --vault "/你的笔记库路径" --theme-only

# 只安装插件，保留当前主题、配色和行宽偏好
python3 scripts/install.py --vault "/你的笔记库路径" --plugin-only
```

脚本安装主题的 `theme.css`、`manifest.json`，以及插件的 `main.js`、`styles.css`、`manifest.json`。首次完整安装及 `--theme-only` 安装会在 `appearance.json` 中选用 Inkstone 和浅色配色，在 `app.json` 中开启可读行宽，保留其他设置项。`--plugin-only` 不读取或修改这两个偏好文件。

内容不同的旧文件会先备份到配置目录中的 `inkstone-backups/时间标识/`，脚本会打印实际位置。相同内容不重复写入或备份。脚本不修改笔记正文，不删除旧文件，不覆盖插件 `data.json`，不改第三方插件启用列表或受限模式。首次安装遇到无效的配置 JSON 会停止，不会以默认值覆盖。

### 4. 启用插件

重新打开 Obsidian：

1. 首次完整安装后，在「设置 → 外观」确认主题为 `Inkstone`、基础配色为浅色。
2. 如安装了标注插件，进入「设置 → 第三方插件」，关闭「受限模式」，手动启用「墨读标注 Inkstone Annotations」。只使用主题时不需要此步骤。
3. 选中普通文字，使用快捷标注条或右键「墨读：标注与备注…」，也可在命令面板中搜索同名命令。

脚本完成不代表插件已经运行；安装程序不会代替你启用插件。

## 更新已有安装

先获取新版本并关闭 Obsidian，运行：

```sh
# 先预览更新
python3 scripts/install.py --vault "/你的笔记库路径" --update --dry-run

# 更新主题与插件运行文件
python3 scripts/install.py --vault "/你的笔记库路径" --update

# 只更新插件
python3 scripts/install.py --vault "/你的笔记库路径" --update --plugin-only

# 只更新主题
python3 scripts/install.py --vault "/你的笔记库路径" --update --theme-only
```

`--update` **不改 `appearance.json` 或 `app.json`**，保留当前主题、配色和可读行宽偏好；`--plugin-only` 无论是否配合 `--update` 都保留这些偏好。插件 `data.json`、已有 CSS 代码片段及其他插件设置也会保留。更新仍会先备份内容不同的旧运行文件，重启 Obsidian 后生效。

已有用户请使用更新命令。再次运行不带 `--update` 的完整安装命令会重新选用 Inkstone、浅色配色并开启可读行宽。`--theme-only` 和 `--plugin-only` 不能同时使用。

## 手动安装

从 [最新 Release](https://github.com/bufan1024/obsidian-inkstone/releases/latest) 下载并解压合集，将其中两个目录复制到目标位置：

```text
你的笔记库/
└── .obsidian/
    ├── themes/
    │   └── Inkstone/
    │       ├── manifest.json
    │       └── theme.css
    └── plugins/
        └── inkstone-annotations/
            ├── manifest.json
            ├── main.js
            └── styles.css
```

合集的 `themes/Inkstone/` 对应 `.obsidian/themes/Inkstone/`，`plugins/inkstone-annotations/` 对应 `.obsidian/plugins/inkstone-annotations/`，不要再嵌套一层同名目录。自定义配置文件夹时，将 `.obsidian` 替换为实际名称。

也可下载独立主题 ZIP 或插件 ZIP。独立主题包只有 CSS、清单与说明，没有 JavaScript。使用源码 ZIP 时，主题文件在根目录，插件文件在 `annotations/`，无需先构建。

首次安装后，在「设置 → 外观」选择 `Inkstone`、浅色配色，在「设置 → 编辑器」开启「可读行宽」，需要标注时按前文手动启用插件。

手动更新前备份同名文件，然后仅替换主题的两个运行文件或插件的三个运行文件，保留插件 `data.json`。更新文件无需重新选择主题或更改阅读偏好。

## 检查效果

将仓库的 [阅读与排版示例](examples/阅读与排版示例.md) 与 [划线与备注示例](examples/划线与备注示例.md)复制到笔记库的普通文件夹；安装脚本不会自动写入示例笔记。

- 调整「设置 → 外观」字号，正文应随之变化；已有 CSS 显式设置 `--inkstone-font-size` 时，请先移除该变量。
- 选中同一源代码行内的普通文字，快捷条应显示「复制」「划线」「写想法」「更多」；点击划线旁的箭头可选四色高亮或下划线，选择后立即保存。已有标记与脚注的简单段落可以继续标注。
- 点击选区快捷条的「写想法」，应在原文旁的小浮层中显示原文预览与多行输入框。点击「保存想法」或按 `Cmd+Enter` / `Ctrl+Enter`，新普通选区保存为下划线与脚注，已有标注保留原样式；「取消」不写入笔记。命令「墨读：标注与备注」「墨读：添加备注」及右键综合编辑入口仍打开完整面板。
- 点击现有高亮或下划线，应在原文旁弹出小菜单，显示当前样式；点颜色或下划线可立即修改。「写想法／编辑想法」在小菜单内输入并保存备注，「删除标注」保留原文。点击外部、按 `Esc` 或滚动可收起。侧栏「编辑」和右键编辑入口仍打开完整面板。
- 实时预览在光标离开标注后显示实际标记，进入范围时显示源码；源码模式保持原样。
- 执行「墨读：打开标注侧栏」可筛选、定位、编辑或删除当前笔记标注；「导出当前笔记摘录」应新建文件，并带有来源链接。
- 「墨水屏显示」将四色变为灰底与不同线型；插件设置提供行高、行宽预设和快捷条开关。
- 「墨读：上一屏／下一屏」或状态栏 ↑／↓ 可按视口翻页，命令没有默认快捷键。

阅读视图仍只支持原文为单个源代码行的简单段落。含链接、加粗等复杂 Markdown 时，请切换编辑视图选择普通文字。代码、公式、HTML 标签和属性、链接目标等选区受到保护。操作与撤销边界见[插件说明](annotations/README.md)，本机实际测试范围见[验证记录](VALIDATION.md)。窄屏和触控事件验证不代表已在手机原生应用或实体墨水屏上验证。

## 恢复与卸载

关闭 Obsidian，找到脚本打印的备份目录。备份路径相对于配置目录，例如：

```text
.obsidian/inkstone-backups/某次安装/
├── appearance.json
├── app.json
├── themes/Inkstone/theme.css
└── plugins/inkstone-annotations/main.js
```

只会备份实际被替换且内容不同的旧文件。把需要恢复的文件复制回配置目录原位置即可。更新不修改偏好文件，因此更新备份可能没有 `appearance.json` 或 `app.json`。恢复配置 JSON 会回到备份时的设置，如果之后已调整其他设置，请先比较文件。

卸载时，在外观中换回其他主题、在第三方插件中禁用墨读标注，再删除 `.obsidian/themes/Inkstone/` 和 `.obsidian/plugins/inkstone-annotations/`。笔记中已保存的标记、脚注和已导出的摘录都会保留；其他主题未必显示相同的颜色。

## 常见问题

**找不到 `.obsidian`？** 它是隐藏目录。macOS Finder 可按 `Cmd+Shift+.` 显示；Windows 文件资源管理器可开启「显示隐藏的项目」。也请确认选择的是笔记库目录，并曾用 Obsidian 打开过。

**主题或插件没有出现在设置中？** 重启 Obsidian，检查目录是否多嵌套一层、文件名是否正确，以及是否安装到当前库实际使用的配置目录。

**没有标注入口？** 只安装主题不会添加菜单。确认插件已手动启用、Obsidian 版本至少为 1.10.6，再选择同一源代码行内的普通正文。关闭快捷条后仍可使用右键菜单和命令面板。

**调整原生字号没有变化？** 检查 CSS 代码片段是否设置了 `--inkstone-font-size`。保留该变量会显式覆盖原生字号；删除后恢复原生控制。

**找不到 Python？** 使用 Python 3，或按手动步骤复制文件；主题和插件运行本身不需要 Python。手机可按手动目录放置文件，但手机原生应用尚未实测。

**首次安装报告配置 JSON 损坏？** 先修复错误或从自己的备份恢复后再安装。脚本不会删除配置文件来绕过错误；更新和仅安装插件会保留原偏好文件。

官方说明：[配置文件夹](https://obsidian.md/help/configuration-folder)、[手动部署主题与插件](https://obsidian.md/help/teams/deploy)、[本地数据存储](https://obsidian.md/help/data-storage)。
