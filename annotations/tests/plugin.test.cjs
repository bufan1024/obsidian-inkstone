const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../src/core.cjs');
class MarkdownView {}
function pluginFixture(text = '<u class="inkstone-underline">宿主原文</u>') {
  const notices = [], openedModals = [], builtMenus = [];
  const sandbox = { module: { exports: {} }, annotationCore: core, annotationViews: { VIEW_TYPE: 'inkstone-annotations-list' },
    annotationMenu: { createAnnotationMenu(options) {
      builtMenus.push(options);
      return { ownerDocument: options.doc, isConnected: true, addEventListener() {}, remove() { this.isConnected = false; } };
    } },
    require(name) { assert.equal(name, 'obsidian'); return { Plugin: class {}, Modal: class { open() { openedModals.push(this); } }, PluginSettingTab: class {}, MarkdownView, Notice: class { constructor(message) { notices.push(message); } } }; } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/plugin.cjs'), 'utf8'), sandbox);
  const plugin = Object.create(sandbox.module.exports.prototype), events = {};
  const styles = new Map();
  const doc = { body: { appendChild() {}, style: { getPropertyValue: name => styles.get(name) || '', getPropertyPriority: () => '', setProperty: (name, value) => styles.set(name, value), removeProperty: name => styles.delete(name) }, classList: { toggle() {} } }, getSelection: () => ({ isCollapsed: true }) };
  const view = Object.assign(new MarkdownView(), { file: { path: 'host.md', basename: 'host', parent: {path: '/'} }, getMode: () => 'preview', getViewData: () => text,
    contentEl: { contains: () => true }, containerEl: { ownerDocument: doc } });
  view.leaf = { view }; view.editor = { getValue: () => text };
  plugin.app = { workspace: { activeLeaf: view.leaf, getActiveViewOfType: Type => view instanceof Type ? view : null, getLeavesOfType: () => [view.leaf] } };
  Object.assign(plugin, { active: true, settings: {monochrome: false, toolbar: false}, sections: new WeakMap(), readingTargets: new WeakMap(), readingRefreshes: new WeakMap(), recordCache: new Map(), documents: new Set(), readingOriginals: new Map(), toolbars: new Map(), toolbarStates: new WeakMap(), toolbarTimers: new Map(), modals: new Set() });
  plugin.registerDomEvent = (_doc, name, callback) => { events[name] = callback; };
  plugin.bindDocument(doc);
  const calls = []; plugin.editAnnotation = (...args) => calls.push(args); plugin.showAnnotationMenu = (...args) => calls.push(args);
  const node = { ownerDocument: doc, isConnected: true, getBoundingClientRect: () => ({}), dataset: {}, textContent: '宿主原文', setAttribute() {}, closest: () => node };
  const element = { querySelectorAll: () => [node], parentElement: view.contentEl };
  node.parentElement = element;
  const render = (sourcePath, snapshot) => { node.textContent = core.parseAnnotations(snapshot)[0].text; plugin.processReadingSection(element, {sourcePath, getSectionInfo: () => ({text:snapshot,lineStart:0,lineEnd:0})}); };
  const click = () => events.click({target:node,preventDefault(){}});
  const openMenu = () => {
    node.textContent = core.parseAnnotations(text)[0].text;
    plugin.positionToolbar = () => {};
    Object.getPrototypeOf(plugin).showAnnotationMenu.call(plugin, 0, plugin.getAnnotationContext(), node);
    assert.equal(builtMenus.length, 1);
    return builtMenus[0];
  };
  const openIdea = (from = 0, to = text.length) => {
    plugin.positionToolbar = () => {};
    const context = plugin.getAnnotationContext();
    const annotation = context.records.find(record => from >= record.contentFrom && to <= record.contentTo);
    plugin.showSelectionIdea({...context,editor:view.editor,from,to,annotation,reading:false}, {}, text.slice(from,to));
    assert.equal(builtMenus.length, 1);
    return builtMenus[0];
  };
  return {plugin, view, node, render, click, calls, notices, openedModals, openMenu, openIdea, setText: value => { text = value; }};
}

test('clicking an annotation embedded from another note never edits the host note', () => {
  const fixture=pluginFixture();
  fixture.render('embedded.md','<u class="inkstone-underline">嵌入原文</u>');
  fixture.click();
  assert.equal(fixture.calls.length,0);
  assert(fixture.notices.some(message=>/原笔记|来源|嵌入/.test(message)));
});

test('clicking stale reading DOM refuses the old offset in a new snapshot', () => {
  const fixture=pluginFixture();
  fixture.render('host.md','<u class="inkstone-underline">宿主原文</u>');
  fixture.setText('<u class="inkstone-underline">新内容</u>');
  fixture.click();
  assert.equal(fixture.calls.length,0);
  assert(fixture.notices.some(message=>/变化|更新/.test(message)));
});

test('clicking a current annotation passes its rendered file and full snapshot', () => {
  const fixture=pluginFixture(); const snapshot='<u class="inkstone-underline">宿主原文</u>';
  fixture.render('host.md',snapshot); fixture.click();
  assert.equal(fixture.calls.length,1);
  assert.equal(fixture.calls[0][0],0);
  assert.equal(fixture.calls[0][1]?.snapshot,snapshot);
  assert.equal(fixture.calls[0][1]?.filePath,'host.md');
});

test('an empty tab cannot target the last opened note through a stale selection', () => {
  const fixture=pluginFixture();
  fixture.plugin.lastMarkdownView=fixture.view;
  fixture.plugin.app.workspace.getActiveViewOfType=()=>null;
  fixture.plugin.app.workspace.activeLeaf={view:{getViewType:()=> 'empty'}};
  assert.throws(()=>fixture.plugin.currentView(),/打开.*笔记/);
});

test('export keeps literal HTML and Markdown as quoted text in a unique new note', async () => {
  const fixture=pluginFixture(); const original='<u class="inkstone-underline">&lt;img src=&quot;https://example.com/probe.png&quot;&gt; **字面量** 与 &amp;copy; 以及 &amp;lt;img&amp;gt;</u>';
  fixture.setText(original);
  const created=[]; let opened;
  fixture.plugin.app.vault={ getAbstractFileByPath: name=> name==='host-墨读摘录.md' ? {path:name}:null,
    async create(name,text){created.push({name,text});return {path:name};} };
  fixture.plugin.app.fileManager={generateMarkdownLink:()=>'[[host|原文]]'};
  fixture.plugin.app.workspace.getLeaf=()=>({openFile:async file=>{opened=file.path;}});
  await fixture.plugin.exportAnnotations();
  assert.equal(created.length,1);
  assert.equal(created[0].name,'host-墨读摘录-2.md');
  assert.equal(opened,created[0].name);
  assert(!created[0].text.includes('> <img'));
  assert(!created[0].text.includes('**字面量**'));
  assert(created[0].text.includes('\\&copy;'));
  assert(created[0].text.includes('\\&lt;img\\&gt;'));
  assert(created[0].text.includes('[[host|原文]]'));
  assert.equal(fixture.view.getViewData(),original);
});


test('editing only the note of an uncolored legacy highlight preserves its appearance', async () => {
  const fixture = pluginFixture('<mark class="inkstone-highlight">旧高亮</mark>');
  fixture.plugin.settings.lastColor = 'blue';
  const annotation = core.parseAnnotations(fixture.view.getViewData())[0];
  fixture.plugin.openAnnotation({ annotation, snapshot: fixture.view.getViewData() });
  const modal = fixture.openedModals[0];
  let result;
  fixture.plugin.commit = async (_capture, options) => {
    const plan = core.buildEditAnnotationPlan({ document: fixture.view.getViewData(), from: annotation.from, ...options });
    result = core.applyChanges(fixture.view.getViewData(), plan.changes);
  };
  modal.note = '补充备注';
  modal.perform = work => work();
  await modal.submit();
  assert.equal(core.parseAnnotations(result)[0].color, null);
  assert.equal(core.parseAnnotations(result)[0].note, '补充备注');
});

test('sidebar locate skips an embedded annotation at the same source offset', async () => {
  const snapshot = '![[b]]\n\n<u class="inkstone-underline">宿主正文</u>';
  const fixture = pluginFixture(snapshot), calls = [];
  const embedded = {textContent:'嵌入正文',scrollIntoView(){calls.push('embedded');},focus(){} };
  const own = {textContent:'宿主正文',scrollIntoView(){calls.push('host');},focus(){} };
  fixture.plugin.readingTargets.set(embedded,{filePath:'b.md',snapshot:'12345678<u class="inkstone-underline">嵌入正文</u>',from:8,text:'嵌入正文'});
  fixture.plugin.readingTargets.set(own,{filePath:'host.md',snapshot,from:8,text:'宿主正文'});
  fixture.view.contentEl.querySelector = () => embedded;
  fixture.view.contentEl.querySelectorAll = () => [embedded,own];
  fixture.plugin.app.workspace.setActiveLeaf = () => {};
  await fixture.plugin.revealAnnotation(8,fixture.plugin.getAnnotationContext());
  assert.deepEqual(calls,['host']);
});

test('the note shortcut preserves the style of an existing highlight', async () => {
  const fixture = pluginFixture('<mark class="inkstone-highlight inkstone-green">已有观点</mark>');
  const annotation = core.parseAnnotations(fixture.view.getViewData())[0];
  fixture.plugin.openAnnotation({annotation,snapshot:fixture.view.getViewData()},'note');
  const modal = fixture.openedModals[0];
  let result;
  fixture.plugin.commit = async (_capture,options) => {
    result=core.applyChanges(fixture.view.getViewData(),core.buildEditAnnotationPlan({document:fixture.view.getViewData(),from:annotation.from,...options}).changes);
  };
  modal.note='新增备注';modal.perform=work=>work();
  await modal.submit();
  const updated=core.parseAnnotations(result)[0];
  assert.equal(updated.kind,'highlight');
  assert.equal(updated.color,'green');
  assert.equal(updated.note,'新增备注');
});

test('copy uses the captured visible text without modifying the note', async () => {
  const fixture=pluginFixture(), copied=[];
  const context=fixture.plugin.getAnnotationContext();
  await fixture.plugin.copySelection(context,'宿主原文',{defaultView:{navigator:{clipboard:{writeText:async text=>copied.push(text)}}}});
  assert.deepEqual(copied,['宿主原文']);
  assert.equal(fixture.view.getViewData(),context.snapshot);
});

test('copy refuses a stale selection before invoking the clipboard API', async () => {
  const fixture=pluginFixture(), copied=[];
  const context=fixture.plugin.getAnnotationContext();fixture.setText('选区已变化');
  await assert.rejects(()=>fixture.plugin.copySelection(context,'宿主原文',{defaultView:{navigator:{clipboard:{writeText:async text=>copied.push(text)}}}}),/变化/);
  assert.deepEqual(copied,[]);
});

test('repeated events for the same selection retain the open toolbar node', () => {
  const fixture=pluginFixture(), plugin=fixture.plugin, doc=fixture.view.containerEl.ownerDocument;
  const capture={...plugin.getAnnotationContext(),from:0,to:2};
  doc.querySelector=()=>null;plugin.settings.toolbar=true;plugin.capture=()=>({...capture});
  const toolbar={isConnected:true,remove(){throw new Error('Open styles must not be discarded');}};
  plugin.toolbarStates.set(doc,{capture,dismissed:false});plugin.toolbars.set(doc,toolbar);
  plugin.showToolbar(doc);
  assert.equal(plugin.toolbars.get(doc),toolbar);
});

test('dismissed selection stays closed until the user makes a new selection', () => {
  const fixture=pluginFixture(), plugin=fixture.plugin, doc=fixture.view.containerEl.ownerDocument;
  const capture={...plugin.getAnnotationContext(),from:0,to:2};
  doc.querySelector=()=>null;plugin.settings.toolbar=true;plugin.capture=()=>({...capture});
  plugin.toolbarStates.set(doc,{capture,dismissed:false});
  plugin.dismissToolbar(doc);plugin.showToolbar(doc);
  assert.equal(plugin.toolbars.size,0);
  assert.equal(plugin.toolbarStates.get(doc).dismissed,true);
});

test('clicking an existing mark opens an anchored menu instead of the full editor', () => {
  const fixture=pluginFixture(), menus=[];
  fixture.plugin.showAnnotationMenu=(...args)=>menus.push(args);
  fixture.render('host.md',fixture.view.getViewData());fixture.click();
  assert.equal(menus.length,1);
  assert.equal(menus[0][2],fixture.node);
  assert.equal(fixture.calls.length,0);
  assert.equal(fixture.openedModals.length,0);
});

test('all existing-menu writes reject a changed note before invoking mutation helpers', async () => {
  const fixture = pluginFixture(), options = fixture.openMenu(), writes = [];
  fixture.plugin.commit = async () => writes.push('commit');
  fixture.plugin.removeAnnotation = async () => writes.push('remove');
  fixture.setText('原文已被用户修改');
  await assert.rejects(() => options.onStyle({kind:'highlight',color:'blue'}), /变化/);
  await assert.rejects(() => options.onSaveNote('新的想法'), /变化/);
  await assert.rejects(() => options.onDelete(), /变化/);
  assert.deepEqual(writes, []);
});

test('saving an idea through the small menu keeps an uncolored legacy highlight', async () => {
  const fixture = pluginFixture('<mark class="inkstone-highlight">旧高亮</mark>');
  fixture.plugin.settings.lastColor = 'blue';
  const options = fixture.openMenu();
  let result;
  fixture.plugin.commit = async (capture, changes) => {
    result = core.applyChanges(capture.snapshot, core.buildEditAnnotationPlan({document:capture.snapshot,from:capture.annotation.from,...changes}).changes);
  };
  await options.onSaveNote('补充想法');
  const updated = core.parseAnnotations(result)[0];
  assert.equal(updated.kind, 'highlight');
  assert.equal(updated.color, null);
  assert.equal(updated.note, '补充想法');
  assert.equal(fixture.plugin.toolbars.size, 0);
  assert.equal(fixture.openedModals.length, 0);
});

test('a reused reading paragraph receives the committed footnote snapshot only from its current source section', () => {
  const before = '<u class="inkstone-underline">宿主原文</u>[^inkstone-1]\n\n[^inkstone-1]: 原想法';
  const after = before.replace('原想法','更新想法');
  const fixture = pluginFixture(before), {plugin, view, node} = fixture;
  const element = node.parentElement;
  let sectionText = before;
  const context = {sourcePath:'host.md',getSectionInfo:()=>({text:sectionText,lineStart:0,lineEnd:0})};
  plugin.processReadingSection(element, context);
  view.contentEl.querySelectorAll = () => [node];
  fixture.setText(after);
  plugin.readingRefreshes.set(view, {filePath:'host.md',before,after});
  plugin.refreshReadingTargets(view, after);
  assert.throws(() => plugin.readingAnnotationContext(node, view), /更新/);
  sectionText = after;
  context.sourcePath = 'embedded.md';
  plugin.refreshReadingTargets(view, after);
  assert.throws(() => plugin.readingAnnotationContext(node, view), /更新/);
  context.sourcePath = 'host.md';
  const getInfo = context.getSectionInfo;
  context.getSectionInfo = () => { throw new Error('section detached'); };
  assert.doesNotThrow(() => plugin.refreshReadingTargets(view, after));
  assert.throws(() => plugin.readingAnnotationContext(node, view), /更新/);
  context.getSectionInfo = getInfo;
  assert.equal(plugin.readingAnnotationContext(node, view).snapshot, after);
  assert.equal(plugin.readingAnnotationContext(node, view).records[0].note, '更新想法');
  fixture.setText(before);
  sectionText = before;
  assert.throws(() => plugin.readingAnnotationContext(node, view), /更新/);
  plugin.readingRefreshes.set(view, {filePath:'host.md',before:after,after:before});
  assert.equal(plugin.readingAnnotationContext(node, view).snapshot, before);
});

test('selection ideas open directly in the small composer and add one underline with a footnote', async () => {
  const fixture = pluginFixture('首段，选中的文字，末段。');
  const options = fixture.openIdea(3,8);
  assert.equal(options.startComposer, true);
  assert.equal(options.record.text, '选中的文字');
  assert.equal(fixture.openedModals.length, 0);
  let result;
  fixture.plugin.commit = async (capture, changes) => {
    result = core.applyChanges(capture.snapshot, core.buildAnnotationPlan({document:capture.snapshot,from:capture.from,to:capture.to,...changes}).changes);
  };
  await options.onSaveNote('可以试一试');
  const records = core.parseAnnotations(result);
  assert.equal(records.length,1);
  assert.equal(records[0].kind,'underline');
  assert.equal(records[0].text,'选中的文字');
  assert.equal(records[0].note,'可以试一试');
  assert(result.startsWith('首段，'));
  assert(result.includes('，末段。'));
});

test('a new selection idea rejects empty input and cancel never writes a mark', async () => {
  const fixture = pluginFixture('先读再想'), options = fixture.openIdea(), writes=[];
  fixture.plugin.commit = async () => writes.push('commit');
  await assert.rejects(() => options.onSaveNote(' \n '),/想法/);
  assert.deepEqual(writes,[]);
  assert.equal(fixture.plugin.toolbars.size,1);
  options.onCancel();
  assert.deepEqual(writes,[]);
  assert.equal(fixture.plugin.toolbars.size,0);
  assert.equal(fixture.view.getViewData(),'先读再想');
});

test('a selection idea refuses an updated snapshot before a write helper runs', async () => {
  const fixture=pluginFixture('先读再想'), options=fixture.openIdea(), writes=[];
  fixture.plugin.commit=async()=>writes.push('commit');
  fixture.setText('另一人已经修改原文');
  await assert.rejects(()=>options.onSaveNote('不能写回旧位置'),/变化/);
  assert.deepEqual(writes,[]);
});

test('a selection inside a legacy highlight keeps its existing style when saving an idea', async () => {
  const fixture=pluginFixture('<mark class="inkstone-highlight">已有观点</mark>');
  const annotation=core.parseAnnotations(fixture.view.getViewData())[0];
  const options=fixture.openIdea(annotation.contentFrom,annotation.contentTo);
  let result;
  fixture.plugin.commit=async(capture,changes)=>{
    result=core.applyChanges(capture.snapshot,core.buildEditAnnotationPlan({document:capture.snapshot,from:capture.annotation.from,...changes}).changes);
  };
  await options.onSaveNote('保留原来的样式');
  const updated=core.parseAnnotations(result)[0];
  assert.equal(updated.kind,'highlight');
  assert.equal(updated.color,null);
  assert.equal(updated.note,'保留原来的样式');
});
