# 原生 Obsidian 验收

`verify-upgrade.cjs`、`verify-theme.cjs` 与 `verify-reading-workflow.cjs` 连接独立 Obsidian 测试实例，实际操作编辑器、阅读视图、标注面板、侧栏与主题界面。它们会创建测试笔记、修改测试库配置；交互脚本还会重载插件，因此只应连接专用测试库。主题 **1.3.8／插件 1.1.8** 的历史验证，以及 **2026-10-23 三项修复候选的完整原生复验**，见根目录 [VALIDATION.md](../../VALIDATION.md)。

## 准备

1. 新建一个名为 **Inkstone Upgrade Preview** 的空测试库。不要使用日常笔记库或同步目录。
2. 构建本项目，并用安装器将主题与插件装入该测试库；在测试库中选择 Inkstone、浅色模式、可读行宽并启用标注插件。
3. 使用独立的 Obsidian 用户配置目录启动应用，并只对本机开放 Electron 调试端口。macOS 示例（将路径替换为实际位置）：

   ```sh
   /Applications/Obsidian.app/Contents/MacOS/Obsidian \
     --user-data-dir="/绝对路径/inkstone-qa-profile" \
     --remote-debugging-address=127.0.0.1 \
     --remote-debugging-port=19227 \
     --disable-background-timer-throttling \
     --disable-renderer-backgrounding \
     --disable-backgrounding-occluded-windows
   ```

   在该实例中打开测试库。不要对日常 Obsidian 进程开放调试端口。后三个参数仅用于避免独立测试窗口被遮挡时降到每秒一帧，导致滚动事件延迟送达；不会写入笔记库设置。
4. 准备 Node.js 与 Playwright。可使用已有 Playwright 安装，并通过 `INKSTONE_PLAYWRIGHT` 指定其模块绝对路径；测试通过 CDP 连接现有应用，无需下载浏览器。

## 运行

```sh
node annotations/build.mjs
node --test annotations/tests/*.test.cjs
python3 -m unittest discover -s scripts -p 'test_*.py'
INKSTONE_CDP=http://127.0.0.1:19227 node tests/native/verify-upgrade.cjs
INKSTONE_CDP=http://127.0.0.1:19227 node tests/native/verify-theme.cjs
INKSTONE_CDP=http://127.0.0.1:19227 node tests/native/verify-reading-workflow.cjs
```

也可在脚本后添加单个用例名，如交互脚本的 `reading-entities-and-embeds`、主题脚本的 `notice-cta-contrast`。主题脚本还可按前缀运行一组用例，例如 `pane-padding` 或 `native-font`：

```sh
INKSTONE_CDP=http://127.0.0.1:19227 node tests/native/verify-theme.cjs pane-padding
```

脚本会拒绝操作名称不同的笔记库；测试完成后断开调试连接，保留独立应用窗口。构建后需先将新运行文件更新到测试库，才能验证新版本。交互脚本兼容 Obsidian 1.12／1.14 的键盘作用域布局；检查 DOM 菜单前会临时将专用库的 `nativeMenus` 设为 `false`，退出时恢复原值。

覆盖连续标注、实体与 emoji、已有标注小菜单（直接改色、删除、浮层内想法、键盘与过期快照保护）、Live Preview 与源码切换、侧栏、摘录导出、字号和阅读预设、按屏翻页，以及选区「写想法」的小浮层、取消/空白零写入、三种模式下的选区准确性和单次事务，想法浮层内的样式草稿与保存后一起生效，以及新版工具条的文字动作、色点、延迟事件、备注焦点、窄屏避让和键盘操作。复制用例只 mock 专用测试页的 Clipboard API，不读写真实系统剪贴板。输出逐项 PASS/FAIL，任何失败都会返回非零退出状态。

侧栏另有 `sidebar-responsive-layout`、`sidebar-empty-states`、`sidebar-refresh-scroll-and-stale-actions` 三组回归，覆盖 240／280／360／480px 宽度下的长路径与内容、固定顶部与列表滚动、原生按钮样式与焦点、粗指针尺寸、三种空态、刷新和删除后保留滚动位置，以及旧按钮的快照保护。

当前侧栏回归还检查同一来源刷新时保留筛选控件与焦点、内容未变化时保留卡片。`sidebar-filtered-export-all` 验证「导出全部」包含被筛选隐藏的标注和想法。

`sidebar-edit-compact-menu` 与 `sidebar-edit-anchor-keyboard-and-safety` 检查侧栏编辑在三种 Markdown 模式下使用小菜单、首次点击、改色与想法保存／取消、键盘焦点、滚动关闭、窄视口定位及过期内容拒写。测试读值与事务计数使用当前笔记视图，不调用会激活另一个标签页的叶节点获取操作。

`thought-command-shares-composer` 检查原 `add-note` 命令使用与快捷条相同的小浮层；`thought-draft-incidental-dismissal` 与 `sidebar-dirty-thought-source-reactivation` 检查修改过的想法文字或样式能在意外点击、滚动及同源重新激活后保留，取消和 `Esc` 不写入并恢复键盘作用域。未编辑的菜单仍会正常收起，`selection-idea-stale-draft-protection` 继续检查原文变化后的拒写。

主题脚本覆盖原生通知文字与操作对比度、可见的静态加载提示、明确的嵌入图片高度、三种 Markdown 模式的窄分栏页边距、原生字号和显式 CSS 字号优先级、内部链接与标注下划线的区分，以及粗指针下的快捷条和侧栏控件尺寸。新增 `native-motion-scope` 检查普通第三方控件保留自身动画、原生界面保持静态和 `node-insert-event` 例外；`overflow` 在 320／600px 阅读与 Live Preview 面板检查宽表格、长代码和公式；`keyboard-focus-reading` 使用 Tab 检查真实链接焦点；`print-multipage-styles` 用多页长度的临时笔记检查打印字号、换行、表格宽度与分页样式。打印样式通过不代表 PDF 已导出或每页均已目视检查。

主题脚本会恢复临时布局、样式、测试文件、媒体模式和视口；无法模拟粗指针等情况会单独报告 SKIP，不能算作通过。

实际 PDF 验收应记录输出方法、渲染引擎、页数、文本完整性以及首／中／末页截图。若 Electron 不提供 CDP PDF 输出，可用原生阅读 DOM 与已加载样式在独立 Chromium 中生成作为排版验证；必须标明此回退方法，不能记为 Obsidian 自身 PDF 导出通过。

这些检查使用桌面原生应用。390px 布局和合成触控事件不代表手机原生应用或实体墨水屏实测。测试中使用的 Obsidian 内部接口仅用于验收，不打包进插件。

## 平台与版本证据边界

每次原生验收应记录系统与硬件型号、Obsidian 版本、主题／插件版本、Git 提交、输入方式和 PASS／FAIL／SKIP；附失败步骤、日志、截图或导出的 PDF。仅对记录中的组合成立。当前 macOS 原生实跑版本、提交与结果以 [VALIDATION.md](../../VALIDATION.md) 为准。

| 平台或版本 | 自动检查范围 | 原生界面与真机状态 |
| --- | --- | --- |
| macOS 桌面 | 独立 Obsidian 测试库的原生脚本 | 以 VALIDATION 中该次实跑记录为准 |
| Windows 桌面 | `windows-installer` CI job 运行完整安装器测试；结果以对应提交的 job 为准 | Obsidian 界面、键盘与打印待验证 |
| Linux 桌面 | Ubuntu CI 构建、单元测试、runner 与发行包检查 | Obsidian 界面待验证 |
| iOS／iPadOS | 桌面窄视口和粗指针仅提供布局线索 | 原生应用、触摸选区与软键盘未验证 |
| Android | 桌面合成触控仅提供交互线索 | 原生应用、触摸选区与软键盘未验证 |
| 实体墨水屏 | 桌面灰阶和静态样式仅提供视觉线索 | 刷新残影、实体按键、翻页与触控未验证 |
| manifest 声明的最低 Obsidian 版本 | 版本声明不是兼容性测试 | 需与当前版本分别运行以下检查，未记录即为待验证 |

Windows job 使用 Python 3.11 和 `python -m unittest discover -s scripts -p 'test_install.py' -v`，涵盖中文路径、安装／更新、原文件备份、偏好保留、预览零写入、符号链接越界拒绝与失败恢复报告。不会跳过符号链接安全检查，也不启动 Obsidian；脚本 CI 通过不能算作 Windows 界面通过。

## 最小手动兼容检查表

在专用测试库中运行；最低声明版本与当前 Obsidian 版本各留一份记录。更新测试应从上一发行版开始，保留一篇有标注的原有笔记和个人阅读偏好。

- [ ] 安装与桌面命令：首次安装后手动启用插件，重启并确认主题；运行命令面板中的标注、侧栏、上一条／下一条和阅读翻页命令，检查无标注时的提示与边界。更新后检查原笔记、标注、其他插件与阅读偏好仍保留。
- [ ] 选区：阅读、Live Preview、源码三种模式分别选择中文、混排、实体与 emoji；连续高亮／下划线，写想法并保存、取消。对代码、公式或跨段选区检查拒绝提示；原文变化后的旧菜单不能写入。
- [ ] 键盘：用 Tab／Shift+Tab 遍历工具条、侧栏筛选和阅读链接；焦点轮廓可见，Enter／Space 可操作，Esc 收起菜单并归还焦点。打开想法输入框、切换笔记再返回，检查草稿恢复后重新选择原文的流程。
- [ ] 触控真机：长按选择文字，拖动选区手柄，点击颜色与想法，打开软键盘后保存／取消；检查工具条不遮挡选区、控件可点、滚动与双指缩放不误写。分别在 iOS 和 Android 记录，桌面触控模拟不能代替。
- [ ] 阅读布局与第三方控件：窄分栏及宽窗口中查看长 URL、宽表格、长代码、公式和图片；横向滚动只发生在内容区域。启用实际使用的第三方插件，操作其按钮、输入框与有功能用途的动画；检查原生加载条静态时仍可见。
- [ ] 打印：导出至少三页 PDF，正文加入开头与结尾标记，含宽表格、长代码、标题、短 callout、标注与脚注。逐页检查文本无缺失／重叠／裁切，首中尾页与标记完整，记录页数并保留 PDF；检查灰阶下的标注线型与脚注仍可分辨。
- [ ] 实体墨水屏：在设备上连续翻页、选区和保存想法，观察局部刷新、残影、静态加载反馈与实体翻页键；记录设备、刷新模式和输入方式。没有设备结果时保留未验证。

## 阅读工作流回归

`verify-reading-workflow.cjs` 检查摘录和想法搜索、组合筛选与完整导出、编辑／阅读视图的标注导航、会话草稿复制和明确放弃、章节来源与手动汇总、英文与自定义颜色名称、长名称布局，并测量 500／2000 条侧栏和 2000 标题的实际摘录导出。它只对专用库创建的测试文件做清理，结束后恢复设置与工作区；复制检查替换的是专用页面的 `writeText` 方法，不读取或改写系统剪贴板。单用例名必须完整匹配，零匹配返回非零。

## 不连接应用的 runner 回归

`node --test tests/native/*.test.cjs` 使用隔离的 Playwright 边界桩运行真实验收脚本，检查未知用例非零退出并报告名称、有效单用例的成功与失败汇总，以及默认／`all` 的失败汇总。此项不连接 Obsidian、不修改笔记库，已加入 CI；不能代替上面的原生应用验收。交互脚本的用例名必须完整匹配，零匹配会失败。
