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

覆盖连续标注、实体与 emoji、已有标注管理、Live Preview 与源码切换、侧栏、摘录导出、字号和阅读预设、按屏翻页，以及新版工具条的文字动作、色点、延迟事件、备注焦点、窄屏避让和键盘操作。复制用例只 mock 专用测试页的 Clipboard API，不读写真实系统剪贴板。输出逐项 PASS/FAIL，任何失败都会返回非零退出状态。

这些检查使用桌面原生应用。390px 布局和合成触控事件不代表手机原生应用或实体墨水屏实测。测试中使用的 Obsidian 内部接口仅用于验收，不打包进插件。
