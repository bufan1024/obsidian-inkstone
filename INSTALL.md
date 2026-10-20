# 安装 Inkstone 墨读

Inkstone 包含一个纯 CSS 主题和一个可选标注插件。主题可单独安装；下划线、四色高亮和备注的操作入口需要启用插件。当前通过 GitHub Release 或本仓库安装，尚未上架 Obsidian 社区目录。

安装前关闭目标笔记库或退出 Obsidian，避免应用退出时覆盖刚更新的配置。请先用 Obsidian 打开过该笔记库，使配置目录存在。以下路径都指**笔记库目录**，不是 Obsidian 应用程序目录。

## 用 Codex 或其他 AI 安装

在能访问本机文件和运行命令的 AI 编程助手中，复制 [README 中的完整安装提示词](README.md#用-codex--ai-安装)，将笔记库路径替换为自己的绝对路径。AI 会下载本仓库并运行本地安装脚本。

这段提示词没有调用 AI API，也不要求配置 API Key。安装依赖本机已有的 Git 与 Python 3；若下载的是 Release 合集，则只需要 Python 3。仅能聊天、不能访问本机文件的 AI 无法直接替你安装。

## 脚本安装

### 1. 获取文件

推荐下载 [最新 Release](https://github.com/bufan1024/obsidian-inkstone/releases/latest) 中的 `Inkstone-Reading-Kit-1.2.0.zip`，解压后进入其中含有 `scripts/` 的目录。

也可以克隆源码：

```sh
git clone https://github.com/bufan1024/obsidian-inkstone.git
cd obsidian-inkstone
```

### 2. 确定笔记库和配置目录

例如，你的笔记保存在 `/Users/你的名字/Documents/笔记库`，就将这个完整路径作为 `--vault`。Windows 示例为 `D:\笔记库`。路径含空格或中文时保留引号。

默认配置目录是笔记库内的隐藏文件夹 `.obsidian`。可在「设置 → 文件与链接 → 覆盖配置文件夹（Override config folder）」确认实际名称。如果更改过配置文件夹，请在命令中使用 `--config-dir "实际文件夹名"`，不能指向另一个笔记库或外部目录。

### 3. 预览并安装

在源码或合集目录中运行：

```sh
# 只显示将要修改的文件，不写入
python3 scripts/install.py --vault "/你的笔记库路径" --dry-run

# 执行安装
python3 scripts/install.py --vault "/你的笔记库路径"
```

Windows 可将 `python3` 换成 `py -3`：

```powershell
py -3 scripts/install.py --vault "D:\笔记库"
```

只安装主题，或指定自定义配置文件夹：

```sh
python3 scripts/install.py --vault "/你的笔记库路径" --theme-only
python3 scripts/install.py --vault "/你的笔记库路径" --config-dir ".obsidian-custom"
```

脚本会：

- 安装主题的 `theme.css` 与 `manifest.json`。
- 默认安装插件的 `main.js`、`styles.css` 与 `manifest.json`，`--theme-only` 时跳过。
- 在 `appearance.json` 中选择 Inkstone 和浅色模式，在 `app.json` 中开启可读行宽，保留其他设置项。
- 将内容不同的旧文件备份到配置目录中的 `inkstone-backups/时间标识/`，并打印实际位置。相同内容不重复写入或备份。

脚本不修改笔记正文，不删除旧文件，不覆盖插件的 `data.json`，不修改其他插件的启用列表，也不会关闭受限模式。遇到损坏的配置 JSON 会停止，不会用默认值覆盖它。

### 4. 启用插件

重新打开 Obsidian：

1. 在「设置 → 外观」确认主题为 `Inkstone`、基础配色为浅色。
2. 如安装了标注插件，进入「设置 → 第三方插件」，关闭「受限模式」，启用「墨读标注 Inkstone Annotations」。只使用主题时不需要此步骤。
3. 选中文字，右键选择「墨读：标注与备注…」，或在命令面板搜索这个命令。

首次启用插件是 Obsidian 内的手动步骤，脚本完成不代表插件已经运行。

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

合集的 `themes/Inkstone/` 对应 `.obsidian/themes/Inkstone/`，`plugins/inkstone-annotations/` 对应 `.obsidian/plugins/inkstone-annotations/`。不要再嵌套一层同名目录。

也可以单独下载主题 ZIP 或插件 ZIP。独立主题包只有 CSS、清单与说明，没有 JavaScript。使用 GitHub 的源码 ZIP 时，主题文件在根目录，插件文件在 `annotations/`，按上面的路径复制即可，无需先构建。

手动更新前，备份已有的同名文件。插件只替换以上三个文件，保留原来的 `data.json`。自定义配置文件夹时，将 `.obsidian` 替换为实际文件夹名。

安装后，在「设置 → 外观」选择 `Inkstone`、浅色模式，在「设置 → 编辑器」开启「可读行宽」。需要标注时按上一节启用插件。

## 检查效果

将仓库的 [阅读与排版示例](examples/阅读与排版示例.md) 与 [划线与备注示例](examples/划线与备注示例.md)复制到笔记库的任意普通文件夹。安装脚本不会自动把示例写入你的笔记目录。

- 阅读、实时预览和源码模式中的正文应更易阅读。
- 选中未标注的普通文字，右键应有「墨读：标注与备注…」。
- 保存带备注的标记后，正文会出现脚注编号，备注在当前文件文末。
- 开启「墨水屏显示」后，四色背景统一为灰色，底线线型仍有区别。

阅读视图的标注入口目前支持原文为单行的纯文本段落。含链接、加粗、脚注或已有标记的段落，请切换编辑视图，选中普通文字操作。编辑视图可能显示保存的 HTML 标签，详情见[插件说明](annotations/README.md)。

## 恢复与卸载

关闭 Obsidian，找到安装脚本打印的备份目录。备份中的文件路径相对于配置目录，例如：

```text
.obsidian/inkstone-backups/某次安装/
├── appearance.json
├── app.json
├── themes/Inkstone/theme.css
└── plugins/inkstone-annotations/main.js
```

只会备份实际被替换且内容不同的旧文件。把需要恢复的文件复制回配置目录中的原位置即可；不要将整个备份目录覆盖到笔记库根目录。恢复配置 JSON 会回到备份时的设置，如果安装后已调整其他设置，请先比较文件。

若想卸载，在外观中换回其他主题、在第三方插件中禁用墨读标注，再删除 `.obsidian/themes/Inkstone/` 和 `.obsidian/plugins/inkstone-annotations/`。笔记中已保存的标记与脚注会保留；其他主题未必提供相同的标注颜色。

## 常见问题

**找不到 `.obsidian`？** 它是隐藏目录。macOS Finder 可按 `Cmd+Shift+.` 显示；Windows 文件资源管理器可开启「显示隐藏的项目」。也请确认选择的是笔记库目录，并曾用 Obsidian 打开过。

**主题或插件没有出现在设置中？** 重启 Obsidian，检查目录是否多嵌套一层、文件名是否正确，以及安装到了当前库实际使用的配置目录。

**右键没有标注入口？** 只安装主题不会添加菜单。请确认插件已启用、Obsidian 版本至少为清单声明的 1.10.6，再在普通文字上选择同一行内的内容。

**安装脚本提示找不到 Python？** 安装 Python 3，或按手动安装步骤复制文件；主题和插件运行本身不需要 Python。手机上请按手动路径放置文件，原生手机端尚未实测。

**配置 JSON 损坏？** 先修复错误或从自己的备份恢复后再安装。脚本不会删除配置文件来绕过错误。

官方说明：[配置文件夹](https://obsidian.md/help/configuration-folder)、[手动部署主题与插件](https://obsidian.md/help/teams/deploy)、[本地数据存储](https://obsidian.md/help/data-storage)。Codex 的本地目录能力见 [OpenAI 官方项目说明](https://learn.chatgpt.com/docs/projects#choose-a-project-or-chat-without-one)。
