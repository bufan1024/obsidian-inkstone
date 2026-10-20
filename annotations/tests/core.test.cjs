'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAnnotationPlan, validateSelection, applyChanges } = require('../src/core.cjs');

const select = (document, text) => ({ document, from: document.indexOf(text), to: document.indexOf(text) + text.length });
const planFor = (document, text, options = {}) => buildAnnotationPlan({ ...select(document, text), kind: 'underline', ...options });

test('underline escapes HTML-sensitive text without losing surrounding text', () => {
  const document = '前言：A & B < 3 > 1。尾声';
  const plan = planFor(document, 'A & B < 3 > 1');
  assert.equal(applyChanges(document, plan.changes), '前言：<u class="inkstone-underline">A &amp; B &lt; 3 &gt; 1</u>。尾声');
  assert.equal(plan.noteId, null);
  assert.equal(plan.caretOffset, '前言：<u class="inkstone-underline">A &amp; B &lt; 3 &gt; 1</u>'.length);
});

test('highlight defaults to yellow and supports every documented color', () => {
  assert.equal(applyChanges('重点', planFor('重点', '重点', { kind: 'highlight' }).changes), '<mark class="inkstone-highlight inkstone-yellow">重点</mark>');
  for (const color of ['yellow', 'green', 'blue', 'rose']) {
    assert.equal(applyChanges('重点', planFor('重点', '重点', { kind: 'highlight', color }).changes), `<mark class="inkstone-highlight inkstone-${color}">重点</mark>`);
  }
});

test('note creates an underline, reference and appended footnote while keeping caret by the selection', () => {
  const document = '开头 重点 结尾\n\n后续笔记。';
  const plan = planFor(document, '重点', { kind: 'note', note: '  应当复习  ', noteId: 'inkstone-review-1' });
  assert.equal(applyChanges(document, plan.changes), '开头 <u class="inkstone-underline">重点</u>[^inkstone-review-1] 结尾\n\n后续笔记。\n\n[^inkstone-review-1]: 应当复习\n');
  assert.equal(plan.changes.length, 2);
  assert.equal(plan.noteId, 'inkstone-review-1');
  assert.equal(plan.caretOffset, '开头 <u class="inkstone-underline">重点</u>[^inkstone-review-1]'.length);
});

test('every kind can append a note and multiline footnotes use four-space continuation', () => {
  const plan = planFor('重点 后文', '重点', { kind: 'highlight', color: 'blue', note: '第一行\n第二行\n\n第四行', noteId: 'inkstone-lines' });
  assert.equal(applyChanges('重点 后文', plan.changes), '<mark class="inkstone-highlight inkstone-blue">重点</mark>[^inkstone-lines] 后文\n\n[^inkstone-lines]: 第一行\n    第二行\n    \n    第四行\n');
});

test('selection ending at EOF merges replacement and footnote append into one transaction change', () => {
  const plan = planFor('前文 重点', '重点', { note: '备注', noteId: 'inkstone-eof' });
  assert.equal(plan.changes.length, 1);
  assert.deepEqual(plan.changes[0], { from: 3, to: 5, text: '<u class="inkstone-underline">重点</u>[^inkstone-eof]\n\n[^inkstone-eof]: 备注\n' });
  assert.equal(plan.caretOffset, '前文 <u class="inkstone-underline">重点</u>[^inkstone-eof]'.length);
});

test('existing footnotes, content and line endings survive an append', () => {
  const document = '重点 和已有引用[^old]\r\n\r\n[^old]: 原备注\r\n';
  const plan = planFor(document, '重点', { note: '一\n二', noteId: 'inkstone-new' });
  assert.equal(applyChanges(document, plan.changes), '<u class="inkstone-underline">重点</u>[^inkstone-new] 和已有引用[^old]\r\n\r\n[^old]: 原备注\r\n\r\n[^inkstone-new]: 一\r\n    二\r\n');
});

test('automatic note ids skip every existing reference and definition', () => {
  const document = '重点 [^inkstone-1]\n\n[^inkstone-2]: 已有备注';
  const plan = planFor(document, '重点', { note: '新备注' });
  assert.equal(plan.noteId, 'inkstone-3');
  assert.match(applyChanges(document, plan.changes), /\[\^inkstone-3\]: 新备注\n$/);
});

test('whitespace-only note is ignored for underline and highlight', () => {
  const plan = planFor('重点', '重点', { note: ' \n ' });
  assert.equal(plan.noteId, null);
  assert.equal(applyChanges('重点', plan.changes), '<u class="inkstone-underline">重点</u>');
});

test('valid selection returns exactly the original UTF-16 slice', () => {
  assert.equal(validateSelection({ document: '前😀中文后', from: 1, to: 5 }), '😀中文');
  const plan = buildAnnotationPlan({ document: '前😀中文后', from: 1, to: 5, kind: 'underline' });
  assert.equal(applyChanges('前😀中文后', plan.changes), '前<u class="inkstone-underline">😀中文</u>后');
  assert.equal(plan.caretOffset, '前<u class="inkstone-underline">😀中文</u>'.length);
});

test('invalid ranges, empty selections, newlines and split surrogate pairs are rejected', () => {
  for (const input of [
    { document: '重点', from: -1, to: 1 },
    { document: '重点', from: 0, to: 3 },
    { document: '重点', from: 2, to: 1 },
    { document: '重点', from: 0.5, to: 1 },
    { document: '重点', from: 0, to: 0 },
    { document: '  ', from: 0, to: 2 },
    { document: '一\n二', from: 0, to: 3 },
    { document: '一\r\n二', from: 0, to: 4 },
    { document: '😀字', from: 1, to: 2 },
    { document: null, from: 0, to: 1 },
  ]) assert.throws(() => validateSelection(input), /[\u4e00-\u9fff]/);
});

test('selection with existing Markdown or HTML is rejected instead of flattening its formatting', () => {
  for (const text of ['`代码`', '**粗体**', '__粗体__', '*强调*', '_强调_', '~~删除~~', '==高亮==', '[[内部链接]]', '[外链](https://example.com)', '<b>文字</b>', '<!--注释-->', '[^备注]', '![[嵌入]]', '![图片](image.png)']) {
    assert.throws(() => planFor(text, text), /[\u4e00-\u9fff]/, text);
  }
});

test('ordinary asterisks, underscore names and comparisons remain annotatable', () => {
  for (const text of ['2 * 3', 'some_name', '1 < 2', 'A & B']) assert.equal(validateSelection({ document: text, from: 0, to: text.length }), text);
});

test('frontmatter, fenced code and display math content are protected', () => {
  for (const document of ['---\ntitle: 重点\n---\n正文', '```js\n重点\n```\n正文', '~~~\n重点\n~~~', '    ```\n重点\n    ```', '$$\n重点\n$$']) {
    assert.throws(() => validateSelection(select(document, '重点')), /[\u4e00-\u9fff]/, document);
  }
});

test('normal text after a closed protected block can still be annotated', () => {
  for (const document of ['---\ntitle: 标题\n---\n重点', '```\n代码\n```\n重点', '~~~~\n```\n~~~~\n重点', '$$\nx = y\n$$\n重点']) {
    assert.equal(validateSelection(select(document, '重点')), '重点');
  }
});

test('selecting block structure prefixes is rejected instead of turning the block into plain text', () => {
  for (const document of ['# 标题', '## 二级标题', '- 列表内容', '1. 有序列表', '> 引用内容', '> - 引用列表', '- [ ] 待办事项']) {
    assert.throws(() => validateSelection({ document, from: 0, to: document.length }), /[\u4e00-\u9fff]/, document);
  }
  for (const input of [
    { document: '# 标题', from: 0, to: 1 },
    { document: '  ## 标题', from: 2, to: 3 },
    { document: '- [ ] 待办', from: 2, to: 5 },
  ]) assert.throws(() => validateSelection(input), /[\u4e00-\u9fff]/);
});

test('plain text within headings, lists and quotes can still be annotated', () => {
  for (const document of ['## 普通正文', '- 普通正文', '1. 普通正文', '> 普通正文', '> - 普通正文', '- [ ] 普通正文']) {
    const plan = planFor(document, '普通正文');
    assert.equal(applyChanges(document, plan.changes), document.replace('普通正文', '<u class="inkstone-underline">普通正文</u>'));
  }
});

test('fenced code and display math nested in blockquotes remain protected', () => {
  for (const document of ['> ```js\n> 重点\n> ```', '> > ~~~\n> > 重点\n> > ~~~', '> $$\n> 重点\n> $$', '> > $$\n> > 重点\n> > $$']) {
    assert.throws(() => validateSelection(select(document, '重点')), /[\u4e00-\u9fff]/, document);
  }
});

test('normal text after quoted code or math blocks remains annotatable', () => {
  for (const document of ['> ```\n> 代码\n> ```\n> 重点', '> > ~~~\n> > 代码\n> > ~~~\n重点', '> $$\n> x = y\n> $$\n> 重点']) {
    assert.equal(validateSelection(select(document, '重点')), '重点');
  }
});

test('quoted fence characters inside an outer code block do not close that block', () => {
  const document = '```\n> ```\n重点\n```';
  assert.throws(() => validateSelection(select(document, '重点')), /[\u4e00-\u9fff]/);
});

test('text inside inline code is protected but other text on that line is allowed', () => {
  assert.throws(() => validateSelection(select('`代码里的重点` 后文', '重点')), /[\u4e00-\u9fff]/);
  assert.equal(validateSelection(select('`代码` 后文', '后文')), '后文');
});

test('invalid kind, color and empty note commands fail with a readable error', () => {
  for (const options of [{ kind: 'script' }, { kind: 'highlight', color: 'red' }, { color: 'red' }, { kind: 'note', note: '  ' }, { note: {} }]) {
    assert.throws(() => planFor('重点', '重点', options), /[\u4e00-\u9fff]/);
  }
});

test('unsafe or colliding note ids cannot inject markup or duplicate a footnote', () => {
  for (const noteId of ['other-id', 'inkstone-', 'inkstone-x] <script>', 'inkstone-x_1', 'inkstone-中文']) {
    assert.throws(() => planFor('重点', '重点', { note: '备注', noteId }), /[\u4e00-\u9fff]/);
  }
  for (const document of ['重点 [^inkstone-used]', '重点\n\n[^inkstone-used]: 已有']) {
    assert.throws(() => planFor(document, '重点', { note: '新备注', noteId: 'inkstone-used' }), /[\u4e00-\u9fff]/);
  }
});

test('applyChanges accepts unsorted independent edits in original-document coordinates', () => {
  assert.equal(applyChanges('abcdef', [{ from: 4, to: 6, text: '尾' }, { from: 0, to: 1, text: '头' }]), '头bcd尾');
  assert.equal(applyChanges('abcdef', [{ from: 0, to: 2, text: 'A' }, { from: 2, to: 4, text: 'B' }]), 'ABef');
});

test('applyChanges rejects overlaps, malformed changes and invalid ranges before applying anything', () => {
  for (const changes of [
    [{ from: 0, to: 3, text: '' }, { from: 2, to: 4, text: '' }],
    [{ from: 2, to: 2, text: 'a' }, { from: 2, to: 2, text: 'b' }],
    [{ from: -1, to: 0, text: '' }],
    [{ from: 0, to: 7, text: '' }],
    [{ from: 0, to: 1, text: null }],
    [{ from: 3, to: 2, text: '' }],
    [null, { from: 1, to: 2, text: '' }],
    [undefined],
  ]) assert.throws(() => applyChanges('abcdef', changes), /[\u4e00-\u9fff]/);
});
