# 原生 Obsidian 验收

`verify-upgrade.cjs` 连接独立 Obsidian 测试实例，实际操作编辑器、阅读视图、标注面板和侧栏。它会创建测试笔记、修改测试库配置、重载插件，因此只应连接专用测试库。

## 准备

1. 新建一个名为 **Inkstone Upgrade Preview** 的空测试库。不要使用日常笔记库或同步目录。
2. 构建本项目，并用安装器将主题与插件装入该测试库；在测试库中选择 Inkstone、浅色模式、可读行宽并启用标注插件。
3. 使用独立的 Obsidian 用户配置目录启动应用，并只对本机开放 Electron 调试端口。macOS 示例（将路径替换为实际位置）：

   ```sh
   /Applications/Obsidian.app/Contents/MacOS/Obsidian \
     --user-data-dir="/绝对路径/inkstone-qa-profile" \
     --remote-debugging-address=127.0.0.1 \
     --remote-debugging-port=19227
   ```

   在该实例中打开测试库。不要对日常 Obsidian 进程开放调试端口。
4. 准备 Node.js 与 Playwright。可使用已有 Playwright 安装，并通过 `INKSTONE_PLAYWRIGHT` 指定其模块绝对路径；测试通过 CDP 连接现有应用，无需下载浏览器。

## 运行

```sh
node annotations/build.mjs
node --test annotations/tests/*.test.cjs
python3 -m unittest discover -s scripts -p 'test_*.py'
INKSTONE_CDP=http://127.0.0.1:19227 node tests/native/verify-upgrade.cjs
```

也可在脚本后添加单个用例名，如 `reading-entities-and-embeds`。脚本会拒绝操作名称不同的笔记库；测试完成后退出测试实例。构建后需先将新运行文件更新到测试库，才能验证新版本。

覆盖连续标注、实体与 emoji、已有标注小菜单（直接改色、删除、浮层内想法、键盘与过期快照保护）、Live Preview 与源码切换、侧栏、摘录导出、字号和阅读预设、按屏翻页，以及选区「写想法」的小浮层、取消/空白零写入、三种模式下的选区准确性和单次事务，想法浮层内的样式草稿与保存后一起生效，以及新版工具条的文字动作、色点、延迟事件、备注焦点、窄屏避让和键盘操作。复制用例只 mock 专用测试页的 Clipboard API，不读写真实系统剪贴板。输出逐项 PASS/FAIL，任何失败都会返回非零退出状态。

侧栏另有 `sidebar-responsive-layout`、`sidebar-empty-states`、`sidebar-refresh-scroll-and-stale-actions` 三组回归，覆盖 240／280／360／480px 宽度下的长路径与内容、固定顶部与列表滚动、原生按钮样式与焦点、粗指针尺寸、三种空态、刷新和删除后保留滚动位置，以及旧按钮的快照保护。

`sidebar-edit-compact-menu` 与 `sidebar-edit-anchor-keyboard-and-safety` 检查侧栏编辑在三种 Markdown 模式下使用小菜单、首次点击、改色与想法保存／取消、键盘焦点、滚动关闭、窄视口定位及过期内容拒写。测试读值与事务计数使用当前笔记视图，不调用会激活另一个标签页的叶节点获取操作。

这些检查使用桌面原生应用。390px 布局和合成触控事件不代表手机原生应用或实体墨水屏实测。测试中使用的 Obsidian 内部接口仅用于验收，不打包进插件。
