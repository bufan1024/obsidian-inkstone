# Inkstone · 墨读

适合中文长文阅读和墨水屏的 Obsidian 浅色主题，附带可选的划线、高亮与备注插件。

当前版本为**主题 1.3.0、标注插件 1.1.0**。白底、深灰正文，默认 **1.75 倍行高、40em 行宽**，字号与字体跟随 Obsidian「设置 → 外观」。主题使用设备已有字体，不下载外部资源；插件只在本地处理笔记。

**[下载主题＋标注合集](https://github.com/bufan1024/obsidian-inkstone/releases/latest)** · **[安装与更新教程](INSTALL.md)** · **[标注使用说明](annotations/README.md)**

## 效果截图

新的阅读、实时预览和设置截图来自 macOS Obsidian 1.14.4；彩色、灰阶与排版细节图来自此前的 1.12.4，内容均为仓库附带的示例笔记。

### 阅读与当前笔记标注

在右侧查看当前笔记的标注，按颜色筛选，定位原文、编辑或删除，也可以导出为新的摘录笔记。

![墨读阅读视图与当前笔记标注侧栏](preview-workspace.png)

### 实时预览

未在编辑的标注显示高亮或下划线；光标或选区进入标注范围时显示源码，方便直接编辑。源码模式保持原样。

![墨读实时预览中的高亮、下划线与脚注](preview-live-preview.png)

### 阅读设置

字号使用 Obsidian 原生设置，插件提供行高、行宽预设，以及快捷标注条和墨水屏显示开关。

![墨读阅读与标注设置](preview-reading-settings.png)

### 彩色与墨水屏显示

开启「墨水屏显示」后，四色统一为浅灰底，用实线、双线、点线、虚线保留区别；切换显示不会改写笔记中保存的颜色。

| 彩色高亮 | 灰阶与不同线型 |
| --- | --- |
| ![四色高亮效果](preview-highlights.png) | ![墨水屏灰阶标注效果](preview-monochrome.png) |

<details>
<summary>查看标注面板与排版细节</summary>

![墨读标注面板：下划线、四色高亮与备注](preview-annotations.png)

![提示框、代码和灰阶边框细节](preview-details.png)

</details>

## 用 Codex / AI 安装

先关闭要安装或更新的 Obsidian 笔记库，再将下面的提示词复制给**能执行命令、访问本机文件**的 Codex 或其他 AI 编程助手。把路径替换为自己的笔记库绝对路径；如果只使用在线聊天，按[手动安装教程](INSTALL.md#手动安装)操作。

```text
请将 Inkstone 墨读主题和配套标注插件安装或更新到我的 Obsidian 笔记库：
/替换为你的笔记库绝对路径
配置文件夹：.obsidian（如已自定义，请先替换为实际名称）

仓库：https://github.com/bufan1024/obsidian-inkstone

请直接执行：
1. 读取仓库的 README.md 和 INSTALL.md，将仓库克隆到临时目录。
2. 检查上述路径和指定的配置文件夹存在，只检查我指定的笔记库。
   如果路径缺失或配置文件夹不明确，请先向我确认，不要猜测或扫描其他笔记库。
3. 检查指定配置目录中的 themes/Inkstone/ 和 plugins/inkstone-annotations/。
   如果已安装其中任一组件，运行安装脚本时加 --update，保留我的主题、配色和行宽偏好；
   如果两者都未安装，使用首次安装命令。
4. 先运行 python3 scripts/install.py --vault "上述绝对路径" --dry-run，
   再以相同参数去掉 --dry-run 执行。已安装时两次都加 --update；
   自定义配置目录时两次都加 --config-dir "文件夹名"。Windows 可用 py -3 代替 python3。
5. 不要修改笔记正文、删除文件、覆盖插件 data.json 或改动其他插件设置。
   脚本会备份被替换的文件，不要绕过它直接覆盖已有配置。
6. 检查主题和插件运行文件，告诉我安装或更新结果及实际备份位置，并提醒我重启 Obsidian。
   首次安装还需我在「设置 → 第三方插件」关闭受限模式并手动启用
   「墨读标注 Inkstone Annotations」；不要将脚本完成说成插件已经启用。

如果缺少 Git 或 Python 3，请说明缺少什么，并改用 Release 合集的手动安装方式。
不要安装到没有指定的笔记库，也不要只给我操作步骤。
```

首次完整安装会选用 Inkstone 浅色主题并开启可读行宽。**`--update` 更新不改主题、配色或行宽偏好**；`--plugin-only` 只处理插件文件，同样保留这些偏好。脚本不会自动启用第三方插件或关闭受限模式。只想阅读时可用 `--theme-only`，无需启用任何插件。

## 命令安装与更新

下载并解压 [Release 合集](https://github.com/bufan1024/obsidian-inkstone/releases/latest)，或克隆本仓库。在解压目录或仓库目录中运行（需要 Python 3，运行前关闭 Obsidian）：

```sh
# 首次安装主题与插件；可先加 --dry-run 查看计划
python3 scripts/install.py --vault "/你的笔记库路径"

# 更新已有安装，保留当前主题、配色和行宽偏好
python3 scripts/install.py --vault "/你的笔记库路径" --update

# 只更新标注插件，保留主题及阅读偏好
python3 scripts/install.py --vault "/你的笔记库路径" --update --plugin-only
```

Windows 可用 `py -3` 代替 `python3`。脚本仅写入指定库的配置目录，替换前备份内容不同的旧文件；保留插件的 `data.json` 和其他插件设置。再次运行首次安装命令会重新选用 Inkstone、浅色配色与可读行宽，已有用户请使用 `--update`。

不用命令行也可安装：将合集中的 `themes/Inkstone/` 和 `plugins/inkstone-annotations/` 分别复制到笔记库的 `.obsidian/themes/` 与 `.obsidian/plugins/`，然后在 Obsidian 中选择主题、手动启用插件。详见[安装、更新与恢复教程](INSTALL.md)。

## 划线、高亮与备注

启用插件后，选中普通文字，使用快捷标注条、右键「墨读：标注与备注…」，或命令面板中的同名命令。

- 下划线、黄／绿／蓝／粉四色高亮，可附多行备注。备注作为原生脚注保存在当前笔记。
- 同一段可继续标注未标记的文字，已有 Inkstone 标记和脚注不会阻止操作。阅读视图仍要求该段原文位于**单个源代码行**；含链接、加粗等复杂 Markdown 时，请切换编辑视图选择普通文字。
- 点击阅读视图或实时预览中的现有标记，可改色、切换样式、修改备注或移除。移除保留原文；被其他位置引用的共享脚注也会保留。
- 有效选区后显示快捷条，保留选区供点击或触控操作；标注面板记住最近使用的样式和颜色。可在插件设置中关闭快捷条。
- 「墨读：打开标注侧栏」显示当前笔记的摘录、颜色和备注，支持筛选、定位、编辑和删除。
- 「墨读：导出当前笔记摘录」在原笔记所在目录新建 Markdown，包含全部标注、备注及来源链接，重名时添加编号，不覆盖已有文件。
- 「墨读：上一屏／下一屏」和状态栏的 ↑／↓ 按钮按视口翻页，保留少量上下文并立即滚动。没有默认快捷键，可自行绑定。
- 编辑视图可用系统撤销；「墨读：撤销上次标注」仅保留本次启用插件以来的最后一次标注操作，后续有其他编辑时须使用系统撤销。

插件会拒绝 HTML 标签或属性、链接目标、代码、公式、属性区和跨源行等不安全选区。面板打开后如切换笔记或正文发生变化，需要重新选择后保存。完整的 13 个命令及适用范围见[插件说明](annotations/README.md)。

主题仍是纯 CSS，可独立使用。关闭插件后，Inkstone 仍可显示已保存的标记与原生脚注。复制[划线与备注示例](examples/划线与备注示例.md)到笔记库即可练习。

## 字体与阅读尺寸

在 Obsidian「设置 → 外观」中调整正文字体和字号。主题默认使用设备已有字体，不下载在线字体。插件的「阅读行高」提供 1.5、1.75、2.0，「阅读行宽」提供 32em、40em、48em；「恢复默认」会回到主题或 CSS 设置，保留原生字号与字体。

也可以在 `.obsidian/snippets/inkstone-reading.css` 中写入以下内容，再在「设置 → 外观 → CSS 代码片段」启用：

```css
body.theme-light {
  --inkstone-line-height: 1.75;
  --inkstone-line-width: 40em;
  /* 可选：显式覆盖原生字号；不需要时删除这一行。 */
  --inkstone-font-size: 20px;
}
```

已有 `--inkstone-font-size` 自定义仍然有效；要恢复原生字号控制，请移除该变量。使用 CSS 设置行高、行宽时，将插件预设选为「跟随主题 / CSS」。请开启「设置 → 编辑器 → 可读行宽」；窄窗口仍以可用宽度为限。

## 兼容与验证

主题与插件最低 Obsidian 版本为 **1.10.6**。本机验证环境为 macOS **1.12.4 与 1.14.4**，覆盖阅读视图、实时预览、源码模式、标注交互、安装更新及打包；测试结果与范围见[验证记录](VALIDATION.md)。宽表格和代码块在各自区域横向滚动。

主要适配浅色模式。窄屏布局和触控事件测试不等于手机原生应用或实体墨水屏验证，这两类设备尚未实测；其他 Obsidian 版本和第三方插件界面也可能需要单独适配。设备刷新和残影由设备与系统决定。

## 开发与打包

使用仓库已构建的文件安装时，无需 Node.js 或额外依赖。插件使用 Obsidian 公开 API，CodeMirror 模块由 Obsidian 提供，用户无需另行安装。修改源码后，用 Node.js 22 或更新版本重新构建和测试：

```sh
node annotations/build.mjs
node --test annotations/tests/*.test.cjs
python3 -m unittest discover -s scripts -p 'test_*.py'
python3 scripts/package.py
```

构建和安装脚本无第三方包依赖，也不联网。发布包生成到 `dist/`，包含独立主题、独立插件、主题与标注合集三种 ZIP。`.qa/` 与 `dist/` 不纳入源码仓库。

## 设计参考与许可

排版与留白参考 OpenDesign 的 [Paper](https://github.com/nexu-io/open-design/blob/main/design-systems/paper/DESIGN.md)、[Editorial](https://github.com/nexu-io/open-design/blob/main/design-systems/editorial/DESIGN.md) 和 [Minimal](https://github.com/nexu-io/open-design/blob/main/design-systems/minimal/DESIGN.md)，主题结构参考 [Obsidian 官方主题开发文档](https://docs.obsidian.md/Themes/App+themes/Build+a+theme)。

[MIT License](LICENSE)。问题反馈请附 Obsidian 版本、系统、使用视图、最小笔记片段及其他 CSS 代码片段情况。
