const COLORS = [
  ['yellow', '黄色'],
  ['green', '绿色'],
  ['blue', '蓝色'],
  ['rose', '粉色'],
];

function createAnnotationMenu({ doc, record, onStyle, onSaveNote, onDelete, onClose, onResize, bindSaveHotkey }) {
  const element = doc.createElement('div');
  element.className = 'inkstone-selection-toolbar inkstone-annotation-menu';
  element.setAttribute('role', 'dialog');
  element.setAttribute('aria-label', '标注操作');
  const actions = doc.createElement('div');
  actions.className = 'inkstone-annotation-menu-content';
  const error = doc.createElement('p');
  error.className = 'inkstone-annotation-menu-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  element.append(actions, error);

  let draft = record.note || '';
  let busy = false;
  let disposed = false;
  let focusFrame = null;
  let unbindSaveHotkey = null;
  const window = doc.defaultView;

  function clearSaveHotkey() {
    const cleanup = unbindSaveHotkey;
    unbindSaveHotkey = null;
    cleanup?.();
  }

  function cancelFocus() {
    if (focusFrame === null) return;
    window.cancelAnimationFrame(focusFrame);
    focusFrame = null;
  }

  function focusAfterMount(input) {
    cancelFocus();
    focusFrame = window.requestAnimationFrame(() => {
      focusFrame = null;
      if (!disposed && element.isConnected && input.isConnected) input.focus();
    });
  }

  function button(label, callback, className = '') {
    const result = doc.createElement('button');
    result.type = 'button';
    result.className = `inkstone-toolbar-action ${className}`.trim();
    result.textContent = label;
    result.setAttribute('aria-label', label);
    result.addEventListener('click', event => {
      event.stopPropagation();
      if (!busy && !disposed) callback();
    });
    return result;
  }

  function clearError() {
    error.textContent = '';
    error.hidden = true;
  }

  async function perform(callback) {
    if (busy || disposed) return;
    busy = true;
    clearError();
    element.setAttribute('aria-busy', 'true');
    element.querySelectorAll('button, textarea').forEach(control => { control.disabled = true; });
    try {
      await callback();
    } catch (failure) {
      if (!disposed) {
        error.textContent = failure?.message || '保存失败，请重试。';
        error.hidden = false;
        onResize?.();
      }
    } finally {
      busy = false;
      if (!disposed) {
        element.removeAttribute('aria-busy');
        element.querySelectorAll('button, textarea').forEach(control => { control.disabled = false; });
      }
    }
  }

  function showActions() {
    cancelFocus();
    clearSaveHotkey();
    actions.replaceChildren();
    clearError();
    const styles = doc.createElement('div');
    styles.className = 'inkstone-annotation-menu-styles';
    styles.setAttribute('role', 'group');
    styles.setAttribute('aria-label', '标注样式');
    for (const [color, label] of COLORS) {
      const style = button(label, () => perform(() => onStyle({ kind: 'highlight', color })), 'inkstone-toolbar-style');
      style.setAttribute('aria-pressed', String(record.kind === 'highlight' && record.color === color));
      const dot = doc.createElement('span');
      dot.className = `inkstone-toolbar-dot inkstone-swatch-${color}`;
      dot.setAttribute('aria-hidden', 'true');
      style.prepend(dot);
      styles.append(style);
    }
    const underline = button('下划线', () => perform(() => onStyle({ kind: 'underline' })), 'inkstone-toolbar-style inkstone-toolbar-underline');
    underline.setAttribute('aria-pressed', String(record.kind === 'underline'));
    styles.append(underline);
    actions.append(styles);

    if (record.note) {
      const preview = doc.createElement('p');
      preview.className = 'inkstone-annotation-menu-note';
      preview.textContent = record.note;
      actions.append(preview);
    }
    const controls = doc.createElement('div');
    controls.className = 'inkstone-annotation-menu-actions';
    controls.append(
      button(record.note ? '编辑想法' : '写想法', showComposer),
      button('删除标注', () => perform(onDelete), 'inkstone-annotation-menu-delete'),
    );
    actions.append(controls);
  }

  function showComposer() {
    clearSaveHotkey();
    actions.replaceChildren();
    clearError();
    const quote = doc.createElement('p');
    quote.className = 'inkstone-annotation-menu-quote';
    quote.textContent = record.text || '';
    const input = doc.createElement('textarea');
    input.className = 'inkstone-annotation-menu-input';
    input.setAttribute('aria-label', '想法内容');
    input.placeholder = '写下你的想法…';
    input.value = draft;
    input.addEventListener('input', () => { draft = input.value; });
    const save = () => perform(() => onSaveNote(input.value));
    input.addEventListener('keydown', event => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !event.isComposing && !event.defaultPrevented) {
        event.preventDefault();
        save();
      }
    });
    const controls = doc.createElement('div');
    controls.className = 'inkstone-annotation-menu-actions inkstone-annotation-menu-composer-actions';
    controls.append(
      button('取消', () => { draft = input.value; showActions(); onResize?.(); }),
      button('保存想法', save),
    );
    actions.append(quote, input, controls);
    const cleanup = bindSaveHotkey?.(save);
    if (typeof cleanup === 'function') unbindSaveHotkey = cleanup;
    onResize?.();
    focusAfterMount(input);
  }

  element.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape' && !event.isComposing) {
      event.preventDefault();
      onClose?.();
    }
  });
  element.inkstoneDispose = () => {
    disposed = true;
    cancelFocus();
    clearSaveHotkey();
  };
  showActions();
  return element;
}

module.exports = { createAnnotationMenu };
