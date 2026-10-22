/* Native Obsidian theme regression checks; connect only to the isolated QA vault.
 * INKSTONE_CDP=http://127.0.0.1:19227 node tests/native/verify-theme.cjs [case-or-group]
 * INKSTONE_PLAYWRIGHT may point to an existing Playwright module. Never launches an app.
 */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.INKSTONE_PLAYWRIGHT || 'playwright');
const selectedCase = process.argv[2] || 'all';
const results = [];
const modes = ['reading', 'live-preview', 'source'];
class Skip extends Error {}

function rgba(value) {
  const channels = value.match(/[\d.]+/g)?.map(Number);
  assert(channels?.length >= 3, 'Unsupported computed color: ' + value);
  return [...channels.slice(0, 3), channels[3] ?? 1];
}
function composite(top, bottom) {
  const alpha = top[3] + bottom[3] * (1 - top[3]);
  return [...top.slice(0, 3).map((channel, index) => (channel * top[3] + bottom[index] * bottom[3] * (1 - top[3])) / alpha), alpha];
}
function luminance(color) {
  const linear = color.slice(0, 3).map(value => { value /= 255; return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4; });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
function colors(metrics) {
  const background = metrics.backgrounds.slice().reverse().reduce((backdrop, color) => composite(rgba(color), backdrop), [255, 255, 255, 1]);
  const foreground = composite(rgba(metrics.color), background);
  const levels = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return { contrast: (levels[0] + 0.05) / (levels[1] + 0.05), backgroundLuminance: luminance(background) };
}

(async () => {
  const browser = await chromium.connectOverCDP(process.env.INKSTONE_CDP || 'http://127.0.0.1:19227');
  let page, cdp, originalViewport, saved = false, failedCleanup = false;
  try {
    page = browser.contexts()[0]?.pages().find(candidate => candidate.url().startsWith('app://obsidian.md'));
    assert(page, 'Native Obsidian page missing');
    page.setDefaultTimeout(6000);
    await page.waitForFunction(() => window.app?.workspace?.layoutReady);
    // All viewport, DOM, configuration and vault mutations occur after this guard.
    assert.equal(await page.evaluate(() => app.vault.getName()), 'Inkstone Upgrade Preview', 'Refuse to edit a non-QA vault');
    assert.equal(await page.evaluate(() => document.body.classList.contains('theme-light')), true, 'Select light mode in the isolated QA vault');
    assert(await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--inkstone-line-height').trim()), 'Inkstone theme must be active');
    originalViewport = page.viewportSize();
    cdp = await page.context().newCDPSession(page);
    await page.evaluate(() => {
      const runId = Date.now().toString(36);
      window.__inkstoneThemeQa = {
        layout: app.workspace.getLayout(), leaf: app.workspace.getLeaf(false), files: new Map(), styles: new Map(), notices: [],
        notePath: `QA/theme-regression-${runId}.md`, targetPath: `QA/theme-regression-target-${runId}.md`,
        bodyStyle: document.body.getAttribute('style'), touchPoints: navigator.maxTouchPoints,
        backgrounds(element) { const values = []; for (let node = element; node; node = node.parentElement) values.push(getComputedStyle(node).backgroundColor); return values; },
        rememberStyle(element) { if (!this.styles.has(element)) this.styles.set(element, element.getAttribute('style')); },
      };
    });
    saved = true;
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => { app.workspace.leftSplit.collapse(); app.workspace.rightSplit.collapse(); });

    const run = async (name, work) => {
      if (selectedCase !== 'all' && name !== selectedCase && !name.startsWith(selectedCase + '-')) return;
      try { const details = await work(); results.push({ name, passed: true, ...(details ? { details } : {}) }); console.log('PASS', name); }
      catch (error) {
        if (error instanceof Skip) { results.push({ name, skipped: true, reason: error.message }); console.log('SKIP', name, error.message); }
        else { results.push({ name, passed: false, error: error.message }); console.error('FAIL', name, error.stack || error.message); }
      }
    };
    const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const writeFixture = (path, text) => page.evaluate(async ({ path, text }) => {
      const qa = window.__inkstoneThemeQa;
      if (!app.vault.getAbstractFileByPath('QA')) await app.vault.createFolder('QA');
      const existing = app.vault.getAbstractFileByPath(path);
      if (!qa.files.has(path)) qa.files.set(path, existing ? await app.vault.read(existing) : null);
      if (!existing) await app.vault.create(path, text);
      else if (await app.vault.read(existing) !== text) await app.vault.modify(existing, text);
    }, { path, text });
    const fixture = async (text = 'Native theme regression paragraph. 原生正文排版验证。\n\n第二段用于保留真实编辑器。\n', mode = 'reading') => {
      await page.keyboard.press('Escape');
      const path = await page.evaluate(() => window.__inkstoneThemeQa.notePath);
      await writeFixture(path, text);
      await page.evaluate(async ({ path, mode }) => {
        const qa = window.__inkstoneThemeQa, plugin = app.plugins.plugins['inkstone-annotations'];
        plugin?.hideToolbars();
        await qa.leaf.openFile(app.vault.getAbstractFileByPath(path), { state: { mode: mode === 'reading' ? 'preview' : 'source', source: mode === 'source' } });
        const state = qa.leaf.getViewState();
        await qa.leaf.setViewState({ ...state, state: { ...state.state, mode: mode === 'reading' ? 'preview' : 'source', source: mode === 'source' } });
        app.workspace.setActiveLeaf(qa.leaf, { focus: true });
      }, { path, mode });
      await page.waitForFunction(({ path, mode, text }) => {
        const view = window.__inkstoneThemeQa.leaf.view;
        if (view.file?.path !== path || view.getViewData() !== text || view.getMode() !== (mode === 'reading' ? 'preview' : 'source')) return false;
        if (mode === 'reading') return Boolean(view.contentEl.querySelector('.markdown-preview-view p'));
        return Boolean(view.contentEl.querySelector('.cm-line')) && Boolean(view.contentEl.querySelector('.markdown-source-view.is-live-preview')) === (mode === 'live-preview');
      }, { path, mode, text });
      await settle();
    };
    const setPaneWidth = async width => {
      await page.evaluate(width => {
        const qa = window.__inkstoneThemeQa, node = qa.leaf.containerEl;
        qa.rememberStyle(node);
        for (const property of ['width', 'min-width', 'max-width']) node.style.setProperty(property, width + 'px', 'important');
        node.style.setProperty('flex', `0 0 ${width}px`, 'important');
      }, width);
      await page.waitForFunction(width => Math.abs(window.__inkstoneThemeQa.leaf.containerEl.getBoundingClientRect().width - width) <= 1, width);
      await settle();
    };
    const restorePane = () => page.evaluate(() => {
      const qa = window.__inkstoneThemeQa, node = qa.leaf.containerEl;
      if (!qa.styles.has(node)) return;
      const style = qa.styles.get(node); if (style === null) node.removeAttribute('style'); else node.setAttribute('style', style);
      qa.styles.delete(node);
    });
    const noteMetrics = mode => page.evaluate(mode => {
      const view = window.__inkstoneThemeQa.leaf.view;
      const scroller = view.contentEl.querySelector(mode === 'reading' ? '.markdown-preview-view' : '.cm-scroller');
      const content = view.contentEl.querySelector(mode === 'reading' ? '.markdown-preview-view p' : '.cm-line');
      const style = getComputedStyle(scroller), bounds = content.getBoundingClientRect();
      return { pane: window.__inkstoneThemeQa.leaf.containerEl.getBoundingClientRect().width, left: parseFloat(style.paddingLeft), right: parseFloat(style.paddingRight), usable: scroller.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight), content: bounds.width, font: parseFloat(getComputedStyle(content).fontSize) };
    }, mode);

    await run('notice-cta-contrast', async () => {
      await page.evaluate(() => {
        if (typeof window.Notice !== 'function') throw Error('Native Notice constructor missing');
        const notice = new window.Notice('Inkstone native notice contrast regression', 0);
        if (typeof notice.addButton !== 'function') { notice.hide(); throw Error('Native Notice.addButton missing'); }
        notice.addButton('Native notice action', () => {});
        notice.containerEl.dataset.inkstoneThemeQaNotice = 'true';
        window.__inkstoneThemeQa.notices.push(notice);
      });
      const cta = page.locator('[data-inkstone-theme-qa-notice] .notice-cta');
      await cta.waitFor();
      await page.mouse.move(0, 0);
      const read = () => cta.evaluate(node => ({ color: getComputedStyle(node).color, backgrounds: window.__inkstoneThemeQa.backgrounds(node) }));
      const normal = colors(await read());
      assert(normal.backgroundLuminance < 0.25, 'The real native Notice must retain its dark background');
      assert(normal.contrast >= 4.5, `Native notice CTA contrast should be >=4.5:1, got ${normal.contrast.toFixed(2)}:1`);
      await cta.hover();
      const hover = colors(await read());
      assert(hover.contrast >= 4.5, `Hovered native notice CTA contrast should be >=4.5:1, got ${hover.contrast.toFixed(2)}:1`);
      return { normalContrast: normal.contrast, hoverContrast: hover.contrast };
    });

    await run('loading-indicator', async () => {
      await fixture();
      await page.evaluate(() => {
        const qa = window.__inkstoneThemeQa, node = qa.leaf.view.contentEl;
        qa.loadingHost = node; qa.loadingWasPresent = node.classList.contains('is-loading'); node.classList.add('is-loading');
      });
      try {
        const metrics = await page.evaluate(() => {
          const qa = window.__inkstoneThemeQa, node = qa.loadingHost, style = getComputedStyle(node, '::before');
          return { width: parseFloat(style.width), height: parseFloat(style.height), opacity: Number(style.opacity), display: style.display, visibility: style.visibility, content: style.content, animation: style.animationName, color: style.backgroundColor, backgrounds: qa.backgrounds(node) };
        });
        assert.equal(metrics.animation, 'none', 'Inkstone should suppress the native loading animation');
        assert(metrics.width >= 16 && metrics.height >= 2 && metrics.opacity > 0 && metrics.display !== 'none' && metrics.visibility === 'visible' && !['none', 'normal'].includes(metrics.content), 'Suppressed loading animation must leave a perceptible native bar: ' + JSON.stringify(metrics));
        assert(colors(metrics).contrast >= 3, 'Static native loading bar must contrast with its actual backdrop');
        return metrics;
      } finally {
        await page.evaluate(() => { const qa = window.__inkstoneThemeQa; if (!qa.loadingWasPresent) qa.loadingHost.classList.remove('is-loading'); delete qa.loadingHost; });
      }
    });

    await run('explicit-embed-height', async () => {
      await writeFixture('QA/tall.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="400" viewBox="0 0 100 400"><rect width="100" height="400" fill="#888"/></svg>');
      await fixture('Native explicit image size.\n\n![[QA/tall.svg|200x100]]\n', 'reading');
      await page.waitForFunction(() => { const image = window.__inkstoneThemeQa.leaf.view.contentEl.querySelector('.markdown-preview-view img'); return image?.complete && image.naturalHeight > 0; });
      const dimensions = await page.evaluate(() => {
        const image = window.__inkstoneThemeQa.leaf.view.contentEl.querySelector('.markdown-preview-view img'), bounds = image.getBoundingClientRect();
        return { width: bounds.width, height: bounds.height, widthAttribute: image.getAttribute('width'), heightAttribute: image.getAttribute('height'), naturalHeight: image.naturalHeight };
      });
      assert(Math.abs(dimensions.width - 200) <= 1 && Math.abs(dimensions.height - 100) <= 1, 'Native ![[QA/tall.svg|200x100]] should render at 200x100: ' + JSON.stringify(dimensions));
      return dimensions;
    });

    for (const mode of modes) {
      for (const width of [320, 400, 600]) await run(`pane-padding-${mode}-${width}`, async () => {
        await fixture(undefined, mode);
        try {
          await setPaneWidth(1000); const wide = await noteMetrics(mode);
          assert(wide.left > 24 && wide.right > 24, 'Wide Markdown pane should retain the theme default padding: ' + JSON.stringify(wide));
          await setPaneWidth(width); const narrow = await noteMetrics(mode);
          assert(narrow.left <= 24 && narrow.right <= 24, `${mode} ${width}px pane needs <=24px horizontal padding at a 1440px window: ` + JSON.stringify(narrow));
          assert(narrow.usable >= width - 72 && narrow.content >= width - 80, 'Narrow pane must retain usable native note width: ' + JSON.stringify(narrow));
          await setPaneWidth(1000); const restored = await noteMetrics(mode);
          assert(Math.abs(restored.left - wide.left) <= 0.1 && Math.abs(restored.right - wide.right) <= 0.1, 'Widening the pane must restore its default padding');
          return { narrow, wide: restored };
        } finally { await restorePane(); }
      });
    }

    for (const mode of modes) {
      await run(`native-font-${mode}`, async () => {
        const bodyStyle = await page.evaluate(() => document.body.getAttribute('style'));
        try {
          await page.evaluate(() => { document.body.style.removeProperty('--inkstone-font-size'); document.body.style.setProperty('--font-text-size', '22px'); });
          await fixture(undefined, mode); const metrics = await noteMetrics(mode);
          assert(Math.abs(metrics.font - 22) < 0.1, `${mode} should follow native 22px text size: ` + JSON.stringify(metrics));
          return { font: metrics.font };
        } finally { await page.evaluate(style => { if (style === null) document.body.removeAttribute('style'); else document.body.setAttribute('style', style); }, bodyStyle); }
      });
      await run(`font-override-${mode}`, async () => {
        try {
          await page.evaluate(() => { const style = document.createElement('style'); style.id = 'inkstone-theme-qa-font'; style.textContent = 'body.theme-light { --inkstone-font-size: 24px !important; }'; document.head.append(style); });
          await fixture(undefined, mode); const metrics = await noteMetrics(mode);
          assert(Math.abs(metrics.font - 24) < 0.1, `${mode} should honor explicit 24px Inkstone CSS override: ` + JSON.stringify(metrics));
          return { font: metrics.font };
        } finally { await page.evaluate(() => document.getElementById('inkstone-theme-qa-font')?.remove()); }
      });
    }

    for (const mode of ['reading', 'live-preview']) await run(`resolved-link-decoration-${mode}`, async () => {
      const target = await page.evaluate(() => window.__inkstoneThemeQa.targetPath);
      await writeFixture(target, 'Resolved internal link target.\n');
      await page.waitForFunction(path => Boolean(app.metadataCache.getFirstLinkpathDest(path, '')), target);
      await fixture(`[[${target}|Resolved internal link]] and <u class="inkstone-underline">Inkstone annotation underline</u>.\n\nCursor outside the annotation.\n`, mode);
      if (mode === 'live-preview') {
        await page.evaluate(() => window.__inkstoneThemeQa.leaf.view.editor.setCursor({ line: 2, ch: 1 }));
        await settle();
      }
      const decoration = await page.evaluate(mode => {
        const content = window.__inkstoneThemeQa.leaf.view.contentEl;
        const read = node => { if (!node) throw Error('Native rendered link or annotation missing'); const style = getComputedStyle(node); return { line: style.textDecorationLine, style: style.textDecorationStyle, thickness: parseFloat(style.textDecorationThickness), borderStyle: style.borderBottomStyle, borderWidth: parseFloat(style.borderBottomWidth) }; };
        return mode === 'reading'
          ? { link: read(content.querySelector('.markdown-preview-view a.internal-link:not(.is-unresolved)')), annotation: read(content.querySelector('.markdown-preview-view .inkstone-underline')) }
          : { link: read(content.querySelector('.cm-hmd-internal-link .cm-underline')), annotation: read(content.querySelector('.cm-content .inkstone-underline')) };
      }, mode);
      assert(decoration.annotation.line.includes('underline') && decoration.annotation.style === 'solid', 'Annotation fixture must retain a solid underline');
      const distinctUnderline = decoration.link.line.includes('underline') && (decoration.link.style !== 'solid' || decoration.link.thickness >= decoration.annotation.thickness + 1);
      const distinctBorder = decoration.link.borderWidth > 0 && !['none', 'hidden', 'solid'].includes(decoration.link.borderStyle);
      assert(distinctUnderline || distinctBorder, 'Resolved internal link must have a visible decoration distinct from a solid annotation underline: ' + JSON.stringify(decoration));
      return decoration;
    });

    const coarse = async work => {
      const available = await page.evaluate(() => Boolean(app.plugins.plugins['inkstone-annotations']));
      if (!available) throw new Skip('Companion annotation plugin is not enabled in this QA vault');
      try {
        await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
        if (!await page.evaluate(() => matchMedia('(pointer: coarse)').matches)) throw new Skip('This Electron build cannot emulate a coarse pointer');
        return await work();
      } finally {
        const points = await page.evaluate(() => window.__inkstoneThemeQa.touchPoints);
        await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: points > 0, ...(points > 0 ? { maxTouchPoints: points } : {}) });
      }
    };
    const controlMetrics = selector => page.locator(selector).evaluateAll(nodes => nodes.filter(node => { const style = getComputedStyle(node), bounds = node.getBoundingClientRect(); return style.display !== 'none' && style.visibility === 'visible' && bounds.width > 0 && bounds.height > 0; }).map(node => { const bounds = node.getBoundingClientRect(); return { name: node.getAttribute('aria-label') || node.textContent.trim(), width: bounds.width, height: bounds.height }; }));
    const assertTouchControls = (controls, label) => {
      assert(controls.length > 0, label + ' must expose real native controls');
      assert(controls.every(control => control.width >= 43.5 && control.height >= 43.5), label + ' controls must remain at least 44x44px: ' + JSON.stringify(controls));
    };
    await run('coarse-pointer-toolbar', () => coarse(async () => {
      await fixture('Select native editor text for the real annotation toolbar.\n', 'live-preview');
      await page.evaluate(() => window.__inkstoneThemeQa.leaf.view.editor.setSelection({ line: 0, ch: 0 }, { line: 0, ch: 12 }));
      await page.locator('.inkstone-selection-toolbar').waitFor();
      const controls = await controlMetrics('.inkstone-selection-toolbar button'); assertTouchControls(controls, 'Coarse-pointer toolbar');
      await page.keyboard.press('Escape'); return controls;
    }));
    await run('coarse-pointer-sidebar', () => coarse(async () => {
      await fixture('<mark class="inkstone-highlight inkstone-blue">Native sidebar control fixture</mark>\n', 'reading');
      await page.evaluate(async () => {
        const command = app.commands.commands['inkstone-annotations:show-annotations'];
        if (!command) throw Error('Missing native annotation sidebar command');
        if (command.callback) await command.callback(); else await command.checkCallback(false);
        app.workspace.rightSplit.expand(); app.workspace.rightSplit.setSize(360);
      });
      await page.locator('.inkstone-annotation-sidebar').waitFor();
      await settle();
      const controls = await controlMetrics('.inkstone-annotation-sidebar button, .inkstone-annotation-sidebar select'); assertTouchControls(controls, 'Coarse-pointer sidebar'); return controls;
    }));
    assert(results.length > 0, 'Unknown case or group: ' + selectedCase);
    if (results.some(result => result.passed === false)) process.exitCode = 1;
    console.log(JSON.stringify({ app: await page.title(), viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight })), results }, null, 2));
  } finally {
    if (saved) {
      try {
        await page.evaluate(async () => {
          const qa = window.__inkstoneThemeQa;
          app.plugins.plugins['inkstone-annotations']?.hideToolbars();
          document.getElementById('inkstone-theme-qa-font')?.remove();
          for (const notice of qa.notices) notice.hide();
          if (qa.loadingHost && !qa.loadingWasPresent) qa.loadingHost.classList.remove('is-loading');
          for (const [node, style] of qa.styles) { if (style === null) node.removeAttribute('style'); else node.setAttribute('style', style); }
          if (qa.bodyStyle === null) document.body.removeAttribute('style'); else document.body.setAttribute('style', qa.bodyStyle);
          await app.workspace.changeLayout(qa.layout);
          for (const [path, previous] of qa.files) {
            const file = app.vault.getAbstractFileByPath(path);
            if (previous === null) { if (file) await app.vault.delete(file); }
            else if (file) await app.vault.modify(file, previous);
            else await app.vault.create(path, previous);
          }
        });
        const points = await page.evaluate(() => window.__inkstoneThemeQa.touchPoints);
        await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: points > 0, ...(points > 0 ? { maxTouchPoints: points } : {}) });
        await page.evaluate(() => { delete window.__inkstoneThemeQa; });
      } catch (error) { failedCleanup = true; console.error('FAIL restore-native-state', error.stack || error.message); process.exitCode = 1; }
      try {
        if (originalViewport) await page.setViewportSize(originalViewport);
        else await cdp.send('Emulation.clearDeviceMetricsOverride');
      } catch (error) { failedCleanup = true; console.error('FAIL restore-viewport', error.message); process.exitCode = 1; }
    }
    if (cdp) await cdp.detach().catch(() => {});
    // For connectOverCDP(), close releases the remote connection; it does not
    // issue an Electron quit or close the user's native application window.
    await browser.close();
    if (failedCleanup) console.error('QA cleanup was incomplete; inspect the isolated QA vault before reusing it.');
  }
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
