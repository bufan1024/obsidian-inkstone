# Inkstone reading upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 实现六项阅读/标注优化与四项阅读整理功能，逐项 comment，完成发布与本机升级。

**Architecture:** 纯文本核心负责语法保护、标注扫描和原子修改计划；Obsidian 插件连接编辑器、阅读渲染、侧栏和选择工具条。独立主题保持 CSS；安装器更新模式只替换运行文件。

**Tech Stack:** JavaScript CommonJS、Obsidian 公共 API、内置 CodeMirror 6、CSS、Python 3 标准库、Node test。

**Spec:** ../specs/2026-10-20-reading-upgrade.md

## Global Constraints

- 当前 checkout，不创建 worktree；不触及无关项目。
- 保留旧版标记与脚注，所有编辑先验证上下文，单事务可撤销。
- 不引入联网、账户和字体下载；仅使用 app 自带的 CodeMirror 模块。
- 每项经测试或原生验收后发 commentary；未验证的硬件能力不声称实测。
- 主题1.3.0、插件1.1.0、最低Obsidian1.10.6。

## Review Focus

- 选中 HTML 属性、链接目标、行内公式、缩进代码时必须零写入。
- 重复文字、HTML 实体、emoji、同段多个标注的源位置必须正确。
- 已有/共享/多行脚注的更新与删除不能误删其他内容。
- 模态框打开后切文件或改原文，任何新增/修改/删除都必须拒绝。
- 插件卸载应移除工具条、编辑器装饰、侧栏监听与显示覆盖；更新保留用户后续偏好。

## Tasks

- [x] 1. 选区保护（core.cjs + core.test.cjs）：先写四类上下文回归并验证失败，实现保护后全套通过。
- [x] 2. 同段连续标注（core projection + plugin reading capture）：源段落逐字符映射，原生验证重复文字、实体与已有脚注。
- [x] 3. 标注管理（core CRUD + modal）：先测改色/备注/删除/共享脚注；原生验证点击编辑、撤销与过期保护。
- [x] 4. Live Preview（editor.cjs + build）：先建立原生失败用例；非活动范围 widget，活动范围源码；验证源码模式与卸载。
- [x] 5. 字号与阅读参数（theme.css + settings）：原生字号立即生效，行高/行宽预设与复位，插件停用恢复主题行为。
- [x] 6. 保留偏好的更新（install.py + test_install.py）：先测更新保留/仅插件，保持首次安装、备份、dry-run不退化。
- [x] 7. 标注侧栏（views.cjs + plugin）：先测试当前笔记列表/筛选/跳转/编辑/删除与随输入刷新。
- [x] 8. Markdown 摘录导出（plugin + tests）：验证原文/备注/来源，唯一新文件和原笔记不变。
- [x] 9. 快捷工具条（plugin + ui.css）：先验收选区保持、记住样式、关闭偏好、窄屏触控入口和键盘操作。
- [x] 10. 按屏翻页（plugin + ui.css）：先验证前后页命令、少量重叠、活动内容容器和边界。
- [x] 11. 集成发布（docs/examples/manifests/build/package/CI）：全套测试、独立原生回归、截图、审查、发布ZIP/校验和，升级 biji 并验证已启用。

## Execution ledger

- 2026-10-20：用户明确批准执行全部优化并开启 goal。采用分工并行实现、根代理集成与原生检查。旧版基线 3725d3b，工作树干净。
- Ruling: 不在每项后请求批准；用户已批准目标和持续执行。每项完成 comment 汇报证据，最后统一发布。

- 任务1完成：核心28/28通过，新增上下文保护用例已先red再green；根代理复查diff并重跑通过。

- 任务6完成：27/27安装测试通过，独立复核无问题；新增update/plugin-only，保留偏好原字节。

- 任务2/3/4/7完成：原生同段重复添加、点击编辑改色/备注/移除、Live Preview显示/活动源码/source模式、侧栏显示通过。组件测试覆盖筛选、原快照动作与事件清理。
- 复核修复：嵌入笔记与旧DOM标注保留来源路径/渲染快照；导出原文按字面转义；空白标签页拒用旧笔记选区，5个新增回归先red后green。JS67/Python27通过。

- 任务5/8/9完成：原生字号与CSS覆盖、行高行宽重载/停用恢复；安全摘录新文件；窄屏工具条、合成触控与上次样式跨重载验证通过。旧版无色高亮仅编辑备注保留颜色，新增回归先red后green。

- 任务10完成：原生阅读/编辑上下屏重叠、回到首屏、上下边界通过。原生11/11；实体与emoji连续标注重复15/15。修正测试误命中隐藏CM标注的等待条件，不放宽生产快照保护。独立复核发现侧栏同offset嵌入定位，按来源/快照筛选DOM并新增回归。

- 1.14.4复验发现原生新变量--font-preferred-size在body提前解析，CSS字号覆盖实际未生效；保留失败断言，在笔记范围同步该变量后重跑原生。

- 任务11完成：最终JavaScript72/Python27通过，构建4个生成物逐字节复现；1.14.4原生11/11、原有主题63项、既有绿色标记快捷添加备注保样式通过。截图3张1440×1000，独立测试进程已停止。
- 发布：2665ca16de255517f0f99f3162440cfcadc9cd51 已推送main并标记v1.3.0；该SHA两次GitHub Actions均成功。三ZIP分别16/6/26文件，46个包内相对链接可达；解压合集安装/更新/重复更新通过。
- 公开核验：Release三包与SHA256SUMS、三新截图、manifest和README匿名下载后均与本地逐字节一致，公开README展示截图及AI安装锚点。
- 本机升级：通过保留偏好的--update替换5个运行文件并备份；重启原生Obsidian1.14.4后确认Inkstone、插件1.1.0、新阅读设置及新增命令。4个偏好/启用列表/插件数据文件的哈希在升级与重启后保持一致。没有使用日常笔记做功能测试。
- 硬件边界：未实测手机原生应用或实体墨水屏；390px布局与合成触控事件仅为桌面验证。
