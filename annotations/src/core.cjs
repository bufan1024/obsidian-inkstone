'use strict';

const COLORS = new Set(['yellow', 'green', 'blue', 'rose']);
const KINDS = new Set(['underline', 'highlight', 'note']);

function validateRange(document, from, to) {
  if (typeof document !== 'string' || !Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to > document.length) {
    throw new Error('选区位置无效，请重新选择文字。');
  }
  for (const offset of [from, to]) {
    if (offset > 0 && offset < document.length && /[\uD800-\uDBFF]/.test(document[offset - 1]) && /[\uDC00-\uDFFF]/.test(document[offset])) {
      throw new Error('选区不能截断一个字符，请重新选择。');
    }
  }
}

function isProtectedLine(document, from) {
  const lineEnd = document.indexOf('\n', from);
  const lines = document.slice(0, lineEnd < 0 ? document.length : lineEnd).split(/\r\n|\n|\r/);
  let frontmatter = lines[0].replace(/^\uFEFF/, '').trim() === '---';
  let fence = null;
  let math = null;
  for (let index = 0; index < lines.length; index++) {
    const quotePrefix = lines[index].match(/^(?:[ \t]*>[ \t]?)+/)?.[0] || '';
    const quoteDepth = (quotePrefix.match(/>/g) || []).length;
    const line = lines[index].slice(quotePrefix.length).trim();
    const target = index === lines.length - 1;
    if (frontmatter) {
      if (target) return true;
      if (index > 0 && /^(---|\.\.\.)$/.test(line)) frontmatter = false;
      continue;
    }
    if (fence) {
      if (target) return true;
      const close = line.match(/^(`+|~+)\s*$/);
      if (quoteDepth === fence.depth && close && close[1][0] === fence.marker[0] && close[1].length >= fence.marker.length) fence = null;
      continue;
    }
    if (math !== null) {
      if (target) return true;
      if (quoteDepth === math && line === '$$') math = null;
      continue;
    }
    const open = line.match(/^(`{3,}|~{3,})/);
    if (open) {
      if (target) return true;
      fence = { marker: open[1], depth: quoteDepth };
    } else if (line.startsWith('$$')) {
      if (target) return true;
      math = line.slice(2).includes('$$') ? null : quoteDepth;
    }
  }
  return false;
}

function coversStructurePrefix(document, from) {
  const lineStart = document.lastIndexOf('\n', from - 1) + 1;
  const lineEnd = document.indexOf('\n', from);
  let remainder = document.slice(lineStart, lineEnd < 0 ? document.length : lineEnd);
  let length = 0;
  let match;
  while ((match = remainder.match(/^[ \t]*(?:>[ \t]?|#{1,6}(?:[ \t]+|$)|(?:[-+*]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?)/))) {
    length += match[0].length;
    remainder = remainder.slice(match[0].length);
  }
  return from < lineStart + length;
}

function insideInlineCode(document, from, to) {
  const start = document.lastIndexOf('\n', from - 1) + 1;
  const nextLine = document.indexOf('\n', from);
  const line = document.slice(start, nextLine < 0 ? document.length : nextLine);
  const ticks = [...line.matchAll(/`+/g)];
  for (let index = 0; index < ticks.length; index++) {
    const open = ticks[index];
    let close = index + 1;
    while (close < ticks.length && ticks[close][0] !== open[0]) close++;
    const end = close < ticks.length ? ticks[close].index + ticks[close][0].length : line.length;
    if (from < start + end && to > start + open.index) return true;
    index = close;
  }
  return false;
}

function validateSelection({ document, from, to }) {
  validateRange(document, from, to);
  const text = document.slice(from, to);
  if (!text.trim()) throw new Error('请先选择需要标注的文字。');
  if (/[\r\n]/.test(text)) throw new Error('请只选择同一行中的文字，分段添加标注。');
  if (coversStructurePrefix(document, from)) throw new Error('请只选择正文文字，不要包含标题、列表或引用的格式标记。');
  if (isProtectedLine(document, from) || insideInlineCode(document, from, to)) {
    throw new Error('暂不支持在属性、代码或公式块中添加标注。');
  }
  const markdown = /`|\*\*|__|~~|==|\[\[|\]\]|\[\^|!\[|\[[^\]]*\]\s*\([^)]*\)|<\/?[A-Za-z][^>]*>|<!--|-->|\*[^*\r\n]+\*|_[^_\r\n]+_/;
  if (markdown.test(text)) throw new Error('选区含有 Markdown 或 HTML 格式，请只选择普通文字。');
  return text;
}

function buildAnnotationPlan({ document, from, to, kind, color = 'yellow', note = '', noteId }) {
  const selected = validateSelection({ document, from, to });
  if (!KINDS.has(kind)) throw new Error('不支持此标注类型。');
  if (!COLORS.has(color)) throw new Error('不支持此标注颜色。');
  if (typeof note !== 'string') throw new Error('备注内容必须是文字。');
  const content = note.trim();
  if (kind === 'note' && !content) throw new Error('请填写备注内容。');
  let id = null;
  if (content) {
    const used = new Set([...document.matchAll(/\[\^([^\]\r\n]+)\]/g)].map(match => match[1]));
    if (noteId !== undefined) {
      if (typeof noteId !== 'string' || !/^inkstone-[A-Za-z0-9][A-Za-z0-9-]*$/.test(noteId)) throw new Error('备注编号无效。');
      if (used.has(noteId)) throw new Error('备注编号已存在，请重新添加备注。');
      id = noteId;
    } else {
      let sequence = 1;
      while (used.has(`inkstone-${sequence}`)) sequence++;
      id = `inkstone-${sequence}`;
    }
  }
  const escaped = selected.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const tag = kind === 'highlight' ? 'mark' : 'u';
  const classes = kind === 'highlight' ? `inkstone-highlight inkstone-${color}` : 'inkstone-underline';
  const replacement = `<${tag} class="${classes}">${escaped}</${tag}>${id ? `[^${id}]` : ''}`;
  const changes = [{ from, to, text: replacement }];
  if (id) {
    const newline = document.includes('\r\n') ? '\r\n' : '\n';
    const separator = document.endsWith(newline + newline) ? '' : document.endsWith(newline) ? newline : newline + newline;
    const footnote = content.replace(/\r\n|\r/g, '\n').split('\n').map((line, index) => index ? `    ${line}` : `[^${id}]: ${line}`).join(newline);
    const append = separator + footnote + newline;
    if (to === document.length) changes[0].text += append;
    else changes.push({ from: document.length, to: document.length, text: append });
  }
  return { changes, caretOffset: from + replacement.length, noteId: id };
}

function applyChanges(document, changes) {
  if (typeof document !== 'string' || !Array.isArray(changes)) throw new Error('笔记或修改内容无效。');
  for (const change of changes) {
    if (!change || typeof change.text !== 'string') throw new Error('修改内容必须是文字。');
    validateRange(document, change.from, change.to);
  }
  const sorted = [...changes].sort((a, b) => a.from - b.from || a.to - b.to);
  for (let index = 0; index < sorted.length; index++) {
    const change = sorted[index];
    const previous = sorted[index - 1];
    if (previous && (change.from < previous.to || change.from === previous.from)) throw new Error('修改范围不能重叠。');
  }
  return sorted.reduceRight((text, change) => text.slice(0, change.from) + change.text + text.slice(change.to), document);
}

module.exports = { buildAnnotationPlan, validateSelection, applyChanges };
