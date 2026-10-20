'use strict';

const { Plugin, Modal, Setting, Notice, Menu, MarkdownView, PluginSettingTab } = require('obsidian');
const { buildAnnotationPlan, validateSelection, applyChanges } = annotationCore;
const PALETTE = [ ['yellow', '黄色'], ['green', '绿色'], ['blue', '蓝色'], ['rose', '粉色'] ];

class AnnotationModal extends Modal {
  constructor(plugin, capture, kind = 'highlight') {
    super(plugin.app);
    this.plugin = plugin;
    this.capture = capture;
    this.kind = kind;
    this.color = 'yellow';
    this.note = '';
    this.busy = false;
  }

  onOpen() {
    this.plugin.modals.add(this);
    this.modalEl.addClass('inkstone-annotation-modal');
    this.contentEl.createEl('h2', { text: '标注与备注' });
    this.contentEl.createEl('p', { cls: 'inkstone-dialog-description', text: '选择一种标记，可附加备注。点击标记旁的脚注编号即可查看备注。' });
    const selected = this.capture.snapshot.slice(this.capture.from, this.capture.to);
    this.contentEl.createEl('blockquote', { cls: 'inkstone-selection-preview', text: Array.from(selected).slice(0, 200).join('') + (Array.from(selected).length > 200 ? '…' : '') });

    const choices = this.contentEl.createDiv({ cls: 'inkstone-annotation-choices', attr: { 'aria-label': '标注样式', role: 'group' } });
    this.choiceButtons = [];
    const addChoice = (kind, color, label) => {
      const button = choices.createEl('button', { cls: 'inkstone-annotation-choice', attr: { type: 'button', 'aria-label': label } });
      button.createSpan({ cls: kind === 'highlight' ? `inkstone-annotation-swatch inkstone-swatch-${color}` : 'inkstone-annotation-underline-swatch', text: kind === 'highlight' ? '' : 'Aa' });
      button.createSpan({ text: label });
      this.choiceButtons.push({ button, kind, color });
      button.addEventListener('click', () => { this.kind = kind; this.color = color; this.refreshChoices(); });
    };
    addChoice('underline', 'yellow', '下划线');
    for (const [color, label] of PALETTE) addChoice('highlight', color, label);
    this.refreshChoices();

    new Setting(this.contentEl).setName('备注').setDesc(this.kind === 'note' ? '填写备注后保存。' : '可选，备注将保存在当前笔记的文末。')
      .addTextArea(input => {
        input.setPlaceholder('写下你的想法…').onChange(value => { this.note = value; });
        input.inputEl.setAttribute('aria-label', '备注内容');
        this.noteInput = input.inputEl;
      });
    new Setting(this.contentEl).setName('墨水屏显示').setDesc('使用灰底和不同线型区分颜色。')
      .addToggle(toggle => toggle.setValue(this.plugin.settings.monochrome).onChange(value => this.plugin.setMonochrome(value)));
    this.errorEl = this.contentEl.createDiv({ cls: 'inkstone-annotation-error', attr: { role: 'alert' } });
    const actions = this.contentEl.createDiv({ cls: 'inkstone-annotation-actions' });
    const cancel = actions.createEl('button', { text: '取消', attr: { type: 'button' } });
    cancel.addEventListener('click', () => this.close());
    this.saveButton = actions.createEl('button', { text: '保存标注', cls: 'mod-cta', attr: { type: 'button' } });
    this.saveButton.addEventListener('click', () => this.submit());
    this.contentEl.createEl('p', { cls: 'inkstone-dialog-hint', text: '可在命令面板中使用「墨读：撤销上次标注」。编辑视图也可使用系统撤销。' });
    this.scope.register(['Mod'], 'Enter', event => { event.preventDefault(); void this.submit(); return false; });
    if (this.kind === 'note') this.noteInput.focus();
  }

  refreshChoices() {
    for (const choice of this.choiceButtons) {
      const selected = choice.kind === (this.kind === 'note' ? 'underline' : this.kind) && (choice.kind === 'underline' || choice.color === this.color);
      choice.button.classList.toggle('is-selected', selected);
      choice.button.setAttribute('aria-pressed', String(selected));
    }
  }

  async submit() {
    if (this.busy) return;
    this.busy = true;
    this.saveButton.disabled = true;
    this.errorEl.setText('');
    try {
      await this.plugin.commit(this.capture, { kind: this.kind, color: this.color, note: this.note });
      this.close();
    } catch (error) {
      this.errorEl.setText(error.message || '未能保存标注，请重新选择文字。');
    } finally {
      this.busy = false;
      this.saveButton.disabled = false;
    }
  }

  onClose() { this.plugin.modals.delete(this); this.contentEl.empty(); }
}

class AnnotationSettings extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    this.containerEl.empty();
    this.containerEl.createEl('h2', { text: '墨读标注' });
    new Setting(this.containerEl).setName('墨水屏显示').setDesc('关闭时显示四色高亮；开启后使用灰底及实线、双线、点线、虚线。')
      .addToggle(toggle => toggle.setValue(this.plugin.settings.monochrome).onChange(value => this.plugin.setMonochrome(value)));
  }
}

module.exports = class InkstoneAnnotations extends Plugin {
  async onload() {
    const saved = await this.loadData();
    this.settings = { monochrome: Boolean(saved?.monochrome) };
    this.active = true;
    this.modals = new Set();
    this.documents = new Set();
    this.sections = new WeakMap();
    this.lastAction = null;
    this.registerMarkdownPostProcessor((element, context) => {
      this.sections.set(element, { context, element });
    });
    this.app.workspace.onLayoutReady(() => {
      if (!this.active) return;
      this.app.workspace.iterateAllLeaves(leaf => {
        if (leaf.view instanceof MarkdownView && leaf.view.getMode() === 'preview') leaf.view.previewMode.rerender(true);
      });
    });
    this.bindDocument(document);
    this.registerEvent(this.app.workspace.on('window-open', (_window, win) => this.bindDocument(win.document)));
    this.addSettingTab(new AnnotationSettings(this.app, this));
    this.addRibbonIcon('highlighter', '墨读：标注与备注', () => this.openAnnotation());
    this.addCommand({ id: 'annotate', name: '墨读：标注与备注', callback: () => this.openAnnotation() });
    this.addCommand({ id: 'underline', name: '墨读：添加下划线', callback: () => this.quickUnderline() });
    this.addCommand({ id: 'add-note', name: '墨读：添加备注', callback: () => this.openAnnotation(null, 'note') });
    for (const [color, label] of PALETTE) {
      this.addCommand({ id: `highlight-${color}`, name: `墨读：${label}高亮`, callback: () => this.quickHighlight(color) });
    }
    this.addCommand({ id: 'toggle-monochrome', name: '墨读：切换彩色／灰阶标注', callback: () => this.setMonochrome(!this.settings.monochrome) });
    this.addCommand({ id: 'undo-annotation', name: '墨读：撤销上次标注', checkCallback: checking => {
      const available = !!this.lastAction;
      if (!checking && available) void this.undoAnnotation();
      return available;
    } });
    this.registerEvent(this.app.workspace.on('editor-menu', (menu, editor, info) => {
      if (!editor.somethingSelected()) return;
      menu.addSeparator();
      menu.addItem(item => item.setTitle('墨读：标注与备注…').setIcon('highlighter').onClick(() => {
        try { this.openAnnotation(this.captureEditor(editor, info)); } catch (error) { new Notice(error.message); }
      }));
      menu.addItem(item => item.setTitle('墨读：添加下划线').setIcon('underline').onClick(() => {
        try { void this.quickUnderline(this.captureEditor(editor, info)); } catch (error) { new Notice(error.message); }
      }));
    }));
  }

  onunload() {
    this.active = false;
    for (const modal of this.modals) modal.close();
    for (const doc of this.documents) doc.body.classList.remove('inkstone-annotations-monochrome');
    this.lastAction = null;
  }

  bindDocument(doc) {
    if (this.documents.has(doc)) return;
    this.documents.add(doc);
    doc.body.classList.toggle('inkstone-annotations-monochrome', this.settings.monochrome);
    this.registerDomEvent(doc, 'contextmenu', event => {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view || view.getMode() !== 'preview' || !view.contentEl.contains(event.target)) return;
      const selected = doc.getSelection();
      if (!selected || selected.isCollapsed || !view.contentEl.contains(selected.anchorNode) || !view.contentEl.contains(selected.focusNode)) return;
      // Capture before the menu takes focus, using the renderer's source section.
      let capture;
      try { capture = this.captureReading(view); } catch (error) { new Notice(error.message); return; }
      event.preventDefault();
      event.stopPropagation();
      const menu = new Menu();
      menu.addItem(item => item.setTitle('墨读：标注与备注…').setIcon('highlighter').onClick(() => this.openAnnotation(capture)));
      menu.addItem(item => item.setTitle('墨读：添加下划线').setIcon('underline').onClick(() => this.quickUnderline(capture)));
      menu.showAtMouseEvent(event);
    }, true);
  }

  async setMonochrome(value) {
    this.settings.monochrome = value;
    for (const doc of this.documents) doc.body.classList.toggle('inkstone-annotations-monochrome', value);
    await this.saveData(this.settings);
  }

  currentView() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) throw new Error('请先打开一篇 Markdown 笔记。');
    return view;
  }

  captureEditor(editor, info) {
    const view = this.currentView();
    if (view.editor !== editor || view.file.path !== info.file?.path) throw new Error('请在当前笔记中重新选择文字。');
    if (editor.listSelections().length !== 1) throw new Error('请一次只选择一段文字。');
    const snapshot = editor.getValue();
    const from = editor.posToOffset(editor.getCursor('from'));
    const to = editor.posToOffset(editor.getCursor('to'));
    validateSelection({ document: snapshot, from, to });
    return { view, editor, filePath: view.file.path, snapshot, from, to, reading: false };
  }

  captureReading(view) {
    const selection = view.containerEl.ownerDocument.getSelection();
    if (!selection || selection.isCollapsed || !view.contentEl.contains(selection.anchorNode) || !view.contentEl.contains(selection.focusNode)) throw new Error('请先选中笔记中的普通文字，再右键添加标注。');
    const help = '阅读视图请只选择纯文本段落；含有格式的段落请切换到编辑视图后标注。';
    const node = selection.anchorNode;
    const paragraph = node.parentElement?.closest('p');
    if (node.nodeType !== 3 || node !== selection.focusNode || paragraph?.childNodes.length !== 1 || paragraph.firstChild !== node) throw new Error(help);
    let section = paragraph;
    while (section && section !== view.contentEl && !this.sections.has(section)) section = section.parentElement;
    const mapped = this.sections.get(section);
    const info = mapped?.context.getSectionInfo(mapped.element);
    if (!mapped || mapped.context.sourcePath !== view.file.path || !info || info.lineStart !== info.lineEnd || !section.classList.contains('el-p')) throw new Error(help);
    const snapshot = view.getViewData();
    if (info.text !== snapshot) throw new Error('笔记正在更新，请重新选择文字后标注。');
    const lines = snapshot.split('\n');
    const raw = lines[info.lineStart]?.replace(/\r$/, '');
    // Exact whole-paragraph equality excludes entities, escapes and rendered Markdown.
    if (raw !== node.nodeValue) throw new Error(help);
    const lineOffset = lines.slice(0, info.lineStart).reduce((offset, line) => offset + line.length + 1, 0);
    const from = lineOffset + Math.min(selection.anchorOffset, selection.focusOffset);
    const to = lineOffset + Math.max(selection.anchorOffset, selection.focusOffset);
    validateSelection({ document: snapshot, from, to });
    return { view, editor: view.editor, filePath: view.file.path, snapshot, from, to, reading: true };
  }

  capture() {
    const view = this.currentView();
    return view.getMode() === 'preview' ? this.captureReading(view) : this.captureEditor(view.editor, view);
  }

  openAnnotation(capture = null, kind = 'highlight') {
    try { new AnnotationModal(this, capture || this.capture(), kind).open(); }
    catch (error) { new Notice(error.message); }
  }

  async quickUnderline(capture = null) {
    try { await this.commit(capture || this.capture(), { kind: 'underline' }); }
    catch (error) { new Notice(error.message); }
  }

  async quickHighlight(color) {
    try { await this.commit(this.capture(), { kind: 'highlight', color }); }
    catch (error) { new Notice(error.message); }
  }

  assertCurrent(capture) {
    if (!this.active) throw new Error('标注插件已关闭。');
    if (this.app.workspace.getActiveViewOfType(MarkdownView) !== capture.view || capture.view.file?.path !== capture.filePath) throw new Error('当前笔记已切换，请关闭面板后重新选择文字。');
    const text = capture.view.getMode() === 'preview' ? capture.view.getViewData() : capture.view.editor.getValue();
    if (text !== capture.snapshot) throw new Error('笔记已发生变化，请关闭面板后重新选择文字。');
  }

  async inEditor(view, work) {
    const state = view.leaf.getViewState();
    const reading = view.getMode() === 'preview';
    if (reading) await view.leaf.setViewState({ ...state, state: { ...state.state, mode: 'source' } });
    try { return await work(view.editor); }
    finally {
      if (reading && view.file?.path === state.state?.file) await view.leaf.setViewState(state);
    }
  }

  async commit(capture, options) {
    this.assertCurrent(capture);
    const plan = buildAnnotationPlan({ document: capture.snapshot, from: capture.from, to: capture.to, ...options });
    const after = applyChanges(capture.snapshot, plan.changes);
    await this.inEditor(capture.view, editor => {
      this.assertCurrent(capture);
      if (editor.getValue() !== capture.snapshot) throw new Error('笔记已发生变化，请重新选择文字。');
      const changes = plan.changes.map(change => ({ from: editor.offsetToPos(change.from), to: editor.offsetToPos(change.to), text: change.text }));
      editor.transaction({ changes }, 'inkstone-annotation');
      editor.setCursor(editor.offsetToPos(plan.caretOffset));
      this.lastAction = { view: capture.view, filePath: capture.filePath, before: capture.snapshot, after };
    });
  }

  async undoAnnotation() {
    const action = this.lastAction;
    if (!action) return;
    try {
      if (this.currentView() !== action.view || action.view.file?.path !== action.filePath) throw new Error('请先打开刚才标注的笔记。');
      const current = action.view.getMode() === 'preview' ? action.view.getViewData() : action.view.editor.getValue();
      if (current !== action.after) throw new Error('笔记已发生其他修改，请使用编辑器的系统撤销。');
      await this.inEditor(action.view, editor => {
        this.assertCurrent({ view: action.view, filePath: action.filePath, snapshot: action.after });
        editor.undo();
        if (editor.getValue() !== action.before) throw new Error('撤销历史已变化，请在编辑视图中检查撤销结果。');
      });
      this.lastAction = null;
    } catch (error) { new Notice(error.message); }
  }
};
