# 墨读阅读与标注升级规格

用户已要求开启 goal，完成前述六项优化和四项新功能，每完成一项发布 commentary。沿用当前 checkout，保留笔记正文和已有设置；主题仍可独立使用。版本为主题 1.3.0、插件 1.1.0，最低 Obsidian 1.10.6。

## 范围与验收

1. 选区保护：拒绝 HTML 标签/属性、链接目标、缩进代码、行内公式等上下文中的选区，新增回归测试。普通正文、已有受支持标注的正文允许操作。
2. 同段连续标注：阅读视图允许同一源代码行段落内多次添加标注，已有墨读标记和脚注不阻碍其他普通文字；DOM 到源位置由段落源信息和逐字符映射确定，禁止全文猜词位置。
3. 标注管理：点击已有标注修改颜色、样式、备注，或移除；避免嵌套标记；只清理不再被其他引用使用的专属脚注。旧版笔记兼容。
4. Live Preview：非活动标注显示真实高亮/下划线，光标进入标注时可编辑源码；源码模式保持原样，不改写保存格式。
5. 阅读设置：字号尊重 Obsidian 原生控制，插件提供行高、行宽预设及恢复默认；主题不依赖插件。保留已有 CSS 自定义能力。
6. 升级：区分安装与更新，更新保留主题、配色、行宽偏好；支持仅更新插件。保留备份及其他插件数据。
7. 标注侧栏：仅当前笔记，列出摘录/颜色/备注、颜色筛选、定位原文、编辑/删除，随修改刷新。
8. 导出摘录：生成新的 Markdown 笔记，带原文、备注和来源链接，重名时新建唯一文件，不覆盖原笔记。
9. 快捷标注条：有效选区后提供颜色、下划线、备注按钮，保留选区、记住最近样式；触控和键盘入口可用，可关闭。无有效选区时不覆盖界面。
10. 按屏翻页：两个命令与可见入口，以内容视口高度翻页并保留少量上下文，瞬时滚动，不默认占用快捷键。

全部实际写入应保留当前视图/文件与完整快照校验、单次 Editor.transaction、一次 undo/redo 恢复。主题与插件无网络调用，不增加账户或外部字体依赖。使用公开 API 和随 Obsidian 提供的 CodeMirror 模块。

实体墨水屏与手机原生应用不在本机可测试范围；报告必须区分窄屏/触控事件验证和实体设备验证。

## 内部接口

`annotationCore.parseAnnotations(document)` 返回 `{ from, to, contentFrom, contentTo, referenceTo, text, kind, color, noteId, note, raw }[]`；from/to 包围 HTML wrapper（不含紧接的脚注引用）；referenceTo 包含该引用，raw 为从 from 到 referenceTo 的原始字符串。text 为正文单次 HTML 解码结果，kind 为 highlight 或 underline，color 为四种颜色或 null。

`annotationCore.buildAnnotationPlan(options)` 继续原接口；选中已有标注正文时更新该标注，不产生嵌套，未传 note 时保留备注。

`annotationCore.buildEditAnnotationPlan({document,from,kind?,color?,note?})` 与 `buildRemoveAnnotationPlan({document,from})` 返回已有 changes/caretOffset/noteId 形状；from 是 wrapper 起点，过期或不支持结构拒绝。

`annotationCore.projectReadingParagraph(raw)` 返回 `{text, starts, ends}` 或 null。starts/ends 为可见 UTF-16 字符对应的源字符起止偏移，移除支持的 wrapper 和脚注引用，解码实体；未知 HTML 或不安全嵌套返回 null。渲染 DOM 去除脚注节点后的全文必须与 text 精确相等。

`plugin.getAnnotationContext()` 返回 `{view,filePath,snapshot,records}` 或 null，允许侧栏聚焦时引用最后活动且仍挂载的 MarkdownView。所有编辑仍重新校验同一视图、路径与快照。

`plugin.editAnnotation(from, context?)`、`removeAnnotation(from, context?)`、`revealAnnotation(from, context?)` 为 UI 公共入口。`plugin.exportAnnotations()` 负责原生创建新文件。

`annotationEditor.createEditorExtension(plugin)` 返回 CodeMirror extension，`annotationViews.createSidebarClass(plugin)` 返回 ItemView 子类。构建脚本将模块以局部 IIFE 打入 main.js，运行时仅导入 obsidian 与其内置 CodeMirror 模块。
