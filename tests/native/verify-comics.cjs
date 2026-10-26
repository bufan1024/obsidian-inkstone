/* Native comic-theme checks. Connect only to the isolated Inkstone Upgrade Preview vault.
 * INKSTONE_CDP=http://127.0.0.1:19227 node tests/native/verify-comics.cjs [case-or-group]
 * INKSTONE_PLAYWRIGHT points to an existing Playwright module; never launches an app.
 */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.INKSTONE_PLAYWRIGHT || 'playwright');
const selected = process.argv[2] || 'all';
const results = [];

(async () => {
  const browser = await chromium.connectOverCDP(process.env.INKSTONE_CDP || 'http://127.0.0.1:19227');
  let page, cdp, originalViewport, saved = false;
  try {
    page = browser.contexts()[0]?.pages().find(candidate => candidate.url().startsWith('app://obsidian.md'));
    assert(page, 'Native Obsidian page missing');
    page.setDefaultTimeout(6000);
    await page.waitForFunction(() => window.app?.workspace?.layoutReady);
    assert.equal(await page.evaluate(() => app.vault.getName()), 'Inkstone Upgrade Preview', 'Refuse to edit a non-QA vault');
    assert(await page.evaluate(() => document.body.classList.contains('theme-light') && getComputedStyle(document.body).getPropertyValue('--inkstone-line-height').trim()), 'Inkstone light theme must be active');
    originalViewport = page.viewportSize();
    cdp = await page.context().newCDPSession(page);
    const paths = await page.evaluate(() => {
      const id = Date.now().toString(36);
      const paths = { note: `QA/comics-${id}.md`, target: `QA/comics-target-${id}.md`, image: `QA/comics-${id}.svg` };
      window.__inkstoneComicQa = { layout: app.workspace.getLayout(), leaf: app.workspace.getLeaf(false), files: new Map(), paths, paneStyle: null };
      return paths;
    });
    saved = true;
    await page.setViewportSize({ width: 1440, height: 1800 });
    await page.evaluate(() => { app.workspace.leftSplit.collapse(); app.workspace.rightSplit.collapse(); });
    const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const write = (path, text) => page.evaluate(async ({ path, text }) => {
      const qa = window.__inkstoneComicQa;
      if (!app.vault.getAbstractFileByPath('QA')) await app.vault.createFolder('QA');
      const file = app.vault.getAbstractFileByPath(path);
      if (!qa.files.has(path)) qa.files.set(path, file ? await app.vault.read(file) : null);
      if (file) await app.vault.modify(file, text); else await app.vault.create(path, text);
    }, { path, text });
    await write(paths.image, '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240" viewBox="0 0 400 240"><rect width="400" height="240" fill="white"/><path d="M10 10H390V230H10Z M10 120H390 M200 10V230" fill="none" stroke="#202020" stroke-width="4"/></svg>');
    await write(paths.target, '# Comic chapter target\n\nNative navigation destination.\n');
    const fixture = async (text, mode = 'reading', classes = []) => {
      const source = (classes.length ? `---\ncssclasses:\n${classes.map(value => `  - ${value}`).join('\n')}\n---\n\n` : '') + text;
      await write(paths.note, source);
      await page.evaluate(async ({ path, mode }) => {
        const qa = window.__inkstoneComicQa;
        app.plugins.plugins['inkstone-annotations']?.hideToolbars();
        const state = { mode: mode === 'reading' ? 'preview' : 'source', source: mode === 'source' };
        await qa.leaf.openFile(app.vault.getAbstractFileByPath(path), { state });
        await qa.leaf.setViewState({ ...qa.leaf.getViewState(), state: { ...qa.leaf.getViewState().state, ...state } });
        app.workspace.setActiveLeaf(qa.leaf, { focus: true });
        if (mode !== 'reading') {
          qa.leaf.view.editor.setCursor({ line: sourceLine(qa.leaf.view.getViewData()), ch: 0 });
          qa.leaf.view.editor.scrollTo(0, 0);
          qa.leaf.view.contentEl.querySelector('.cm-scroller').scrollTop = 0;
        }
        function sourceLine(text) { return text.split('\n').length - 1; }
      }, { path: paths.note, mode });
      await page.waitForFunction(({ path, source, mode, classes }) => {
        const view = window.__inkstoneComicQa.leaf.view;
        const host = view.contentEl.querySelector(mode === 'reading' ? '.markdown-preview-view' : '.markdown-source-view.mod-cm6');
        return view.file?.path === path && view.getViewData() === source && view.getMode() === (mode === 'reading' ? 'preview' : 'source') && host && classes.every(value => host.classList.contains(value)) && (mode === 'reading' || Boolean(host.classList.contains('is-live-preview')) === (mode === 'live-preview'));
      }, { path: paths.note, source, mode, classes });
      await settle();
    };
    const width = async value => {
      await page.evaluate(value => {
        const qa = window.__inkstoneComicQa, node = qa.leaf.containerEl;
        if (!qa.paneStyle) qa.paneStyle = { node, value: node.getAttribute('style') };
        for (const name of ['width', 'min-width', 'max-width']) node.style.setProperty(name, value + 'px', 'important');
        node.style.setProperty('flex', `0 0 ${value}px`, 'important');
      }, value);
      await page.waitForFunction(value => Math.abs(window.__inkstoneComicQa.leaf.containerEl.getBoundingClientRect().width - value) <= 1, value);
      await settle();
    };
    const run = async (name, work) => {
      if (selected !== 'all' && selected !== name && !name.startsWith(selected + '-')) return;
      try { results.push({ name, passed: true, details: await work() }); console.log('PASS', name); }
      catch (error) { results.push({ name, passed: false, error: error.message }); console.error('FAIL', name, error.stack || error.message); }
    };
    const readyImages = selector => page.waitForFunction(selector => {
      const images = [...window.__inkstoneComicQa.leaf.view.contentEl.querySelectorAll(selector)];
      return images.length > 0 && images.every(image => image.complete && image.naturalWidth > 0);
    }, selector);
    const reader = `![[${paths.image}]]\n\n![Markdown page](${paths.image.split('/').pop()})\n\n正文前缀 ![[${paths.image}|80]] 正文后缀\n\n![[${paths.image}|200x100]]\n\nChapter caption stays readable.\n`;
    for (const mode of ['reading', 'live-preview']) await run('reader-sizes-' + mode, async () => {
      await width(1200);
      await fixture(reader, mode, ['inkstone-comic']);
      const selector = mode === 'reading' ? '.markdown-preview-view img' : '.markdown-source-view img[src]';
      await readyImages(selector);
      const metrics = await page.evaluate(({ selector, mode }) => {
        const host = window.__inkstoneComicQa.leaf.view.contentEl;
        const images = [...host.querySelectorAll(selector)].map(image => {
          const box = image.getBoundingClientRect(), style = getComputedStyle(image);
          return { width: box.width, height: box.height, declaredWidth: image.getAttribute('width'), declaredHeight: image.getAttribute('height'), filter: style.filter, display: style.display };
        });
        const mixed = [...host.querySelectorAll(mode === 'reading' ? '.markdown-preview-view p' : '.cm-line')].find(node => node.textContent.includes('正文前缀'));
        const style = mixed && getComputedStyle(mixed);
        const view = host.querySelector(mode === 'reading' ? '.markdown-preview-view' : '.markdown-source-view');
        return { images, mixed: mixed && { text: mixed.textContent, font: parseFloat(style.fontSize), line: parseFloat(style.lineHeight), height: mixed.getBoundingClientRect().height }, lineWidth: getComputedStyle(view).getPropertyValue('--file-line-width').trim() };
      }, { selector, mode });
      assert(metrics.images.length >= 4, 'Both wiki/Markdown embeds and sized images must render');
      const explicit = metrics.images.find(image => image.declaredHeight === '100');
      assert(explicit && Math.abs(explicit.width - 200) < 1 && Math.abs(explicit.height - 100) < 1, 'Explicit 200x100 dimensions must be preserved: ' + JSON.stringify(explicit));
      const intrinsic = metrics.images.filter(image => !image.declaredHeight && !image.declaredWidth);
      assert(intrinsic.length >= 2 && intrinsic.every(image => Math.abs(image.width / image.height - 400 / 240) < 0.01), 'Unsized pages must retain aspect ratio');
      assert(metrics.images.every(image => image.filter === 'none'), 'Pages must retain original image color');
      assert(metrics.mixed?.font >= 12 && metrics.mixed.line >= metrics.mixed.font && metrics.mixed.text.includes('正文后缀'), 'Mixed text must retain readable typography');
      assert.equal(metrics.lineWidth, '52rem', 'Reader width must be local to the note');
      return metrics;
    });
    await run('reader-strip-gap', async () => {
      const gaps = [];
      for (const classes of [['inkstone-comic'], ['inkstone-comic', 'inkstone-comic-strip']]) {
        await fixture(`![[${paths.image}]]\n\n![[${paths.image}]]\n`, 'reading', classes);
        await readyImages('.markdown-preview-view img');
        gaps.push(await page.evaluate(() => {
          const images = [...window.__inkstoneComicQa.leaf.view.contentEl.querySelectorAll('.markdown-preview-view img')];
          return images[1].getBoundingClientRect().top - images[0].getBoundingClientRect().bottom;
        }));
      }
      assert(Math.abs(gaps[0] - 16) <= 1, 'Default comic page gap should be 16px: ' + gaps[0]);
      assert(Math.abs(gaps[1]) <= 1, 'Strip pages should meet without a baseline gap: ' + gaps[1]);
      return { pageGap: gaps[0], stripGap: gaps[1] };
    });
    const shelf = `> [!comic-shelf]+ 本地漫画书架\n>\n> > [!comic] 很长的漫画作品名称与第一章节\n> > ![[${paths.image}]]\n> >\n> > 原创示例 · 连载中\n> >\n> > [[${paths.target}|开始阅读]]\n>\n> > [!comic] 第二部作品\n> > ![[${paths.image}]]\n> >\n> > [[${paths.target}|查看章节]]\n\nEnd of shelf.\n`;
    for (const mode of ['reading', 'live-preview']) for (const pane of [1200, 600, 320]) await run(`shelf-${mode}-${pane}`, async () => {
      await width(pane);
      await fixture(shelf, mode, ['inkstone-comic-shelf']);
      await readyImages('.callout[data-callout="comic"] img');
      const metrics = await page.evaluate(mode => {
        const host = window.__inkstoneComicQa.leaf.view.contentEl;
        const shelf = host.querySelector((mode === 'reading' ? '.markdown-preview-view' : '.markdown-source-view') + ' .callout[data-callout="comic-shelf"]');
        const content = shelf.querySelector(':scope > .callout-content'), box = shelf.getBoundingClientRect();
        const cards = [...content.querySelectorAll(':scope > .callout[data-callout="comic"]')].map(card => {
          const rect = card.getBoundingClientRect(), image = card.querySelector('img'), imageBox = image.getBoundingClientRect();
          const tray = card.querySelector(':scope > .callout-content > p:first-child').getBoundingClientRect();
          const title = card.querySelector(':scope > .callout-title').getBoundingClientRect(), style = getComputedStyle(card);
          return {
            left: rect.left, right: rect.right, top: rect.top, width: rect.width,
            imageRatio: imageBox.width / imageBox.height, imageFit: getComputedStyle(image).objectFit,
            image: { left: imageBox.left, right: imageBox.right, top: imageBox.top, bottom: imageBox.bottom },
            tray: { left: tray.left, right: tray.right, top: tray.top, bottom: tray.bottom, width: tray.width, height: tray.height },
            title: { top: title.top, height: title.height },
            borders: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth].map(parseFloat),
          };
        });
        const view = host.querySelector(mode === 'reading' ? '.markdown-preview-view' : '.markdown-source-view');
        return { display: getComputedStyle(content).display, lineWidth: getComputedStyle(view).getPropertyValue('--file-line-width').trim(), left: box.left, right: box.right, width: box.width, scroll: content.scrollWidth, client: content.clientWidth, cards, foldVisible: shelf.querySelector(':scope > .callout-title .callout-fold')?.getBoundingClientRect().width > 0, link: shelf.querySelector('a.internal-link')?.getAttribute('data-href') };
      }, mode);
      assert.equal(metrics.display, 'grid', 'Native shelf callout content must be a grid');
      assert.equal(metrics.lineWidth, '68rem', 'Shelf width must be independent of the reader width');
      assert.equal(metrics.cards.length, 2, 'Shelf must preserve both native cards');
      assert(metrics.cards.every(card => card.left >= metrics.left - 1 && card.right <= metrics.right + 1 && card.width > 0 && card.title.height > 0), 'Cards and titles must fit the shelf');
      assert(metrics.scroll <= metrics.client + 1, 'Shelf must not overflow horizontally');
      assert(metrics.cards.every(card => Math.abs(card.imageRatio - 400 / 240) < 0.01 && card.imageFit !== 'cover'), 'Covers must remain uncropped');
      assert(metrics.cards.every(card => Math.abs(card.tray.width - card.tray.height * 0.75) <= 1), 'Cover trays must have a consistent 3:4 ratio');
      assert(metrics.cards.every(card => card.image.left >= card.tray.left - 1 && card.image.right <= card.tray.right + 1 && card.image.top >= card.tray.top - 1 && card.image.bottom <= card.tray.bottom + 1), 'Entire cover must fit inside its paper tray');
      assert(metrics.cards.every(card => card.title.top >= card.tray.bottom - 1), 'Expanded cards must place their title below the cover');
      assert(metrics.cards.every(card => card.borders.every(value => value === 0)), 'Editorial cards must not retain an outer box');
      assert(metrics.foldVisible, 'Native shelf fold control must remain visible');
      assert.equal(metrics.link, paths.target, 'Native chapter link destination must be retained');
      if (pane === 1200) assert(Math.abs(metrics.cards[0].top - metrics.cards[1].top) <= 1, 'Wide shelf must show multiple columns');
      if (pane === 320) assert(metrics.cards[1].top > metrics.cards[0].top + 1, 'Narrow shelf must use one column');
      return metrics;
    });
    for (const mode of ['reading', 'live-preview']) await run('shelf-collapse-print-' + mode, async () => {
      const collapsibleShelf = shelf.replace('[!comic-shelf]+', '[!comic-shelf]-').replace('[!comic]', '[!comic]+');
      await width(1200); await fixture(collapsibleShelf, mode, ['inkstone-comic-shelf']);
      const outerSelector = (mode === 'reading' ? '.markdown-preview-view' : '.markdown-source-view') + ' .callout[data-callout="comic-shelf"]';
      const outer = page.locator(outerSelector).first();
      const collapsed = await outer.evaluate(node => { const content = node.querySelector(':scope > .callout-content'); return { collapsed: node.classList.contains('is-collapsed'), display: getComputedStyle(content).display, height: content.getBoundingClientRect().height }; });
      assert(collapsed.collapsed && (collapsed.display === 'none' || collapsed.height === 0), 'Collapsed native shelf must hide its content');
      await outer.locator(':scope > .callout-title .callout-fold').click();
      await page.waitForFunction(selector => { const node = window.__inkstoneComicQa.leaf.view.contentEl.querySelector(selector); return node && !node.classList.contains('is-collapsed') && getComputedStyle(node.querySelector(':scope > .callout-content')).display === 'grid'; }, outerSelector);
      const innerSelector = outerSelector + ' > .callout-content > .callout[data-callout="comic"]';
      const inner = page.locator(innerSelector).first();
      await inner.locator(':scope > .callout-title .callout-fold').click();
      await page.waitForFunction(selector => {
        const node = window.__inkstoneComicQa.leaf.view.contentEl.querySelector(selector);
        return node?.classList.contains('is-collapsed') && node.querySelector('img').getBoundingClientRect().height === 0;
      }, innerSelector);
      const innerCollapsed = await inner.evaluate(node => ({ collapsed: node.classList.contains('is-collapsed'), coverHeight: node.querySelector('img').getBoundingClientRect().height, titleHeight: node.querySelector(':scope > .callout-title').getBoundingClientRect().height }));
      assert(innerCollapsed.collapsed && innerCollapsed.coverHeight === 0 && innerCollapsed.titleHeight > 0, 'Collapsed native card must hide its cover and keep its title');
      await inner.locator(':scope > .callout-title .callout-fold').click();
      await page.waitForFunction(selector => {
        const node = window.__inkstoneComicQa.leaf.view.contentEl.querySelector(selector);
        return node && !node.classList.contains('is-collapsed') && getComputedStyle(node.querySelector(':scope > .callout-content')).display === 'contents' && node.querySelector('img').getBoundingClientRect().height > 0;
      }, innerSelector);
      const innerReopened = await inner.evaluate(node => {
        const content = node.querySelector(':scope > .callout-content'), cover = content.querySelector('p:first-child').getBoundingClientRect(), title = node.querySelector(':scope > .callout-title').getBoundingClientRect();
        return { display: getComputedStyle(content).display, coverHeight: node.querySelector('img').getBoundingClientRect().height, coverBottom: cover.bottom, titleTop: title.top };
      });
      assert.equal(innerReopened.display, 'contents', 'Reopened card must restore its flattened native content layout');
      assert(innerReopened.coverHeight > 0 && innerReopened.titleTop >= innerReopened.coverBottom - 1, 'Reopened card must restore its visible cover before the title');
      let print;
      try {
        await page.emulateMedia({ media: 'print' });
        print = await outer.evaluate(node => ({ shelf: getComputedStyle(node).breakInside, card: getComputedStyle(node.querySelector('.callout[data-callout="comic"]')).breakInside }));
        assert.equal(print.shelf, 'auto', 'Printed shelf must allow page breaks between cards');
        assert.equal(print.card, 'avoid', 'Printed card must stay together');
      } finally { await page.emulateMedia({ media: null }); }
      return { collapsed, innerCollapsed, innerReopened, print };
    });
    await run('shelf-keyboard-navigation', async () => {
      await width(1200); await fixture(shelf, 'reading', ['inkstone-comic-shelf']);
      const links = page.locator('.markdown-preview-view .callout[data-callout="comic"] a.internal-link');
      await page.bringToFront(); await links.first().focus(); await page.keyboard.press('Tab');
      const link = links.nth(1);
      const focus = await link.evaluate(node => ({ focused: node === document.activeElement, visible: node.matches(':focus-visible'), outline: parseFloat(getComputedStyle(node).outlineWidth) }));
      assert(focus.focused && focus.visible && focus.outline >= 2, 'Keyboard chapter link focus must remain visible: ' + JSON.stringify(focus));
      await page.keyboard.press('Enter');
      await page.waitForFunction(path => app.workspace.activeLeaf?.view.file?.path === path, paths.target);
      return focus;
    });
    const navigation = `> [!comic-nav]+ 章节导航\n> [[${paths.target}|← 返回漫画书架]] · [[${paths.target}|第一话：夜色里的末班列车]] · [[${paths.target}|下一话 →]]\n\nNavigation fixture ends here.\n`;
    for (const mode of ['reading', 'live-preview']) for (const pane of [600, 320]) await run(`navigation-${mode}-${pane}`, async () => {
      await width(pane); await fixture(navigation, mode, ['inkstone-comic']);
      const selector = (mode === 'reading' ? '.markdown-preview-view' : '.markdown-source-view') + ' .callout[data-callout="comic-nav"]';
      const nav = page.locator(selector).first();
      await nav.waitFor({ state: 'visible' });
      const metrics = await nav.evaluate(node => {
        const box = node.getBoundingClientRect(), content = node.querySelector(':scope > .callout-content'), paragraph = content.querySelector('p');
        const links = [...paragraph.querySelectorAll('a.internal-link')].map(link => {
          const bounds = link.getBoundingClientRect();
          return { left: bounds.left, right: bounds.right, top: bounds.top, width: bounds.width, height: bounds.height, destination: link.getAttribute('data-href') };
        });
        const title = node.querySelector(':scope > .callout-title').getBoundingClientRect(), style = getComputedStyle(paragraph);
        return { left: box.left, right: box.right, scroll: content.scrollWidth, client: content.clientWidth, display: style.display, wrap: style.flexWrap, titleHeight: title.height, links };
      });
      assert.equal(metrics.display, 'flex', 'Chapter navigation must arrange native links with flex');
      assert.equal(metrics.wrap, 'wrap', 'Chapter navigation must wrap in narrow panes');
      assert(metrics.titleHeight > 0 && metrics.links.length === 3, 'Native navigation title and all chapter links must remain visible');
      assert(metrics.scroll <= metrics.client + 1 && metrics.links.every(link => link.width > 0 && link.height > 0 && link.left >= metrics.left - 1 && link.right <= metrics.right + 1), 'Chapter navigation must stay inside the narrow pane');
      assert(metrics.links.every(link => link.destination === paths.target), 'Native chapter destinations must be retained');
      if (pane === 320) assert(metrics.links.at(-1).top > metrics.links[0].top + 1, 'Narrow chapter links must wrap to another row');
      await nav.locator(':scope > .callout-title .callout-fold').click();
      await page.waitForFunction(selector => { const node = window.__inkstoneComicQa.leaf.view.contentEl.querySelector(selector); return node?.classList.contains('is-collapsed') && node.querySelector(':scope > .callout-content').getBoundingClientRect().height === 0; }, selector);
      await nav.locator(':scope > .callout-title .callout-fold').click();
      await page.waitForFunction(selector => { const node = window.__inkstoneComicQa.leaf.view.contentEl.querySelector(selector); return node && !node.classList.contains('is-collapsed') && node.querySelector(':scope > .callout-content').getBoundingClientRect().height > 0; }, selector);
      const links = nav.locator('a.internal-link');
      await page.bringToFront(); await links.first().focus(); await page.keyboard.press('Tab');
      const focus = await links.nth(1).evaluate(node => ({ focused: node === document.activeElement, visible: node.matches(':focus-visible'), outline: parseFloat(getComputedStyle(node).outlineWidth) }));
      assert(focus.focused && focus.visible && focus.outline >= 2, 'Chapter navigation must retain visible native keyboard focus: ' + JSON.stringify(focus));
      await page.keyboard.press('Enter');
      await page.waitForFunction(path => app.workspace.activeLeaf?.view.file?.path === path, paths.target);
      return { ...metrics, focus, collapsedAndReopened: true };
    });
    const chapterTarget = `${paths.target}#Comic chapter target`;
    const detail = `# 夜路合订本\n\n两段夜路，一本原创黑白短篇。\n\n> [!comic-info]+ 作品简介\n> ![[${paths.image}|240]]\n>\n> > [!summary] 夜路很长，总有一盏灯等你\n> > 原创黑白短篇 · 全两话\n> >\n> > 从末班列车的站台，读到雨夜里亮着灯的窗口。较长的作品简介也应在窄分栏中自然换行。\n> >\n> > [[${chapterTarget}|开始阅读 →]]\n\n> [!comic-chapters]+ 第一卷 · 夜路\n> 1. [[${chapterTarget}|第一话：末班列车]]\n> 2. [[${chapterTarget}|第二话：一盏灯]]\n\nDetail fixture ends here.\n`;
    for (const mode of ['reading', 'live-preview']) for (const pane of [1200, 600, 320]) await run(`detail-${mode}-${pane}`, async () => {
      await width(pane); await fixture(detail, mode, ['inkstone-comic-detail']);
      const hostSelector = mode === 'reading' ? '.markdown-preview-view' : '.markdown-source-view';
      await readyImages(hostSelector + ' .callout[data-callout="comic-info"] img[src]');
      const metrics = await page.evaluate(hostSelector => {
        const view = window.__inkstoneComicQa.leaf.view.contentEl.querySelector(hostSelector);
        const info = view.querySelector('.callout[data-callout="comic-info"]'), infoBox = info.getBoundingClientRect();
        const content = info.querySelector(':scope > .callout-content'), coverBlock = content.querySelector(':scope > p:first-child').getBoundingClientRect();
        const image = content.querySelector('img'), imageBox = image.getBoundingClientRect();
        const summary = content.querySelector(':scope > .callout[data-callout="summary"]'), summaryBox = summary.getBoundingClientRect();
        const paragraph = summary.querySelector('.callout-content p'), title = summary.querySelector(':scope > .callout-title');
        const chapters = view.querySelector('.callout[data-callout="comic-chapters"]'), chapterBox = chapters.getBoundingClientRect();
        const list = chapters.querySelector(':scope > .callout-content > ol'), listStyle = getComputedStyle(list);
        const rect = box => ({ left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height });
        return {
          lineWidth: getComputedStyle(view).getPropertyValue('--file-line-width').trim(),
          info: rect(infoBox), display: getComputedStyle(content).display, scroll: content.scrollWidth, client: content.clientWidth,
          coverBlock: rect(coverBlock), image: { ...rect(imageBox), declaredWidth: image.getAttribute('width') }, summary: rect(summaryBox),
          summaryFont: parseFloat(getComputedStyle(paragraph).fontSize), summaryLine: parseFloat(getComputedStyle(paragraph).lineHeight), titleHeight: title.getBoundingClientRect().height,
          chapters: rect(chapterBox), chapterScroll: chapters.scrollWidth, chapterClient: chapters.clientWidth,
          listStyle: listStyle.listStyleType, items: [...list.children].map(item => ({ tag: item.tagName, width: item.getBoundingClientRect().width })),
          links: [...list.querySelectorAll('a.internal-link')].map(link => ({ ...rect(link.getBoundingClientRect()), destination: link.getAttribute('data-href') })),
        };
      }, hostSelector);
      assert.equal(metrics.lineWidth, '68rem', 'Work details must use the shelf width independently of reader pages');
      assert.equal(metrics.display, 'grid', 'Work information must use a responsive native callout grid');
      assert(metrics.scroll <= metrics.client + 1 && metrics.summary.left >= metrics.info.left - 1 && metrics.summary.right <= metrics.info.right + 1, 'Work introduction must stay inside the pane');
      assert.equal(metrics.image.declaredWidth, '240', 'Detail cover must keep its declared width');
      assert(Math.abs(metrics.image.width - 240) <= 1 && Math.abs(metrics.image.width / metrics.image.height - 400 / 240) < 0.01, 'Detail cover must retain its explicit width and natural ratio');
      assert(metrics.image.left >= metrics.coverBlock.left - 1 && metrics.image.right <= metrics.coverBlock.right + 1, 'Entire detail cover must fit its column');
      assert(metrics.summaryFont >= 12 && metrics.summaryLine >= metrics.summaryFont && metrics.titleHeight > 0, 'Work title and synopsis must retain readable native typography');
      if (pane === 1200) assert(metrics.summary.left >= metrics.coverBlock.right - 1, 'Wide work information must place synopsis beside the cover');
      else assert(metrics.summary.top >= metrics.coverBlock.bottom - 1, 'Narrow work information must stack synopsis below the cover');
      assert(metrics.items.length === 2 && metrics.items.every(item => item.tag === 'LI' && item.width > 0) && metrics.listStyle !== 'none', 'Chapter directory must retain its native ordered list and markers');
      assert(metrics.chapterScroll <= metrics.chapterClient + 1 && metrics.links.every(link => link.left >= metrics.chapters.left - 1 && link.right <= metrics.chapters.right + 1 && link.height > 0), 'Chapter directory must not overflow the pane');
      assert.equal(metrics.links.length, 2, 'Chapter directory must keep both chapter entries');
      assert(metrics.links.every(link => link.destination === chapterTarget), 'Chapter destinations and heading anchors must remain native');
      return metrics;
    });
    await run('detail-keyboard-navigation', async () => {
      const heading = '第二话：一盏灯', destination = `${paths.target}#${heading}`;
      const previous = await page.evaluate(path => app.vault.read(app.vault.getAbstractFileByPath(path)), paths.target);
      const paragraphs = (count, prefix) => Array.from({ length: count }, (_, index) => `${prefix} ${index + 1}. ${'Native chapter positioning keeps the surrounding text available. '.repeat(6)}`).join('\n\n');
      try {
        await write(paths.target, `# Comic chapter target\n\n## 第一话：末班列车\n\n${paragraphs(40, 'Earlier chapter paragraph')}\n\n## ${heading}\n\n${paragraphs(20, 'Later chapter paragraph')}\n`);
        await page.waitForFunction(({ path, heading }) => app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(path))?.headings?.some(item => item.heading === heading), { path: paths.target, heading });
        await width(1200); await fixture(detail.replaceAll(chapterTarget, destination), 'reading', ['inkstone-comic-detail']);
        const links = page.locator('.markdown-preview-view .callout[data-callout="comic-chapters"] ol a.internal-link');
        await page.bringToFront(); await links.first().focus(); await page.keyboard.press('Tab');
        const focus = await links.nth(1).evaluate(node => ({ focused: node === document.activeElement, visible: node.matches(':focus-visible'), outline: parseFloat(getComputedStyle(node).outlineWidth), destination: node.getAttribute('data-href') }));
        assert(focus.focused && focus.visible && focus.outline >= 2 && focus.destination === destination, 'Chapter directory must keep visible native keyboard focus and its heading target');
        await page.keyboard.press('Enter');
        await page.waitForFunction(({ path, heading }) => {
          const view = app.workspace.activeLeaf?.view;
          if (view?.file?.path !== path || view.getMode() !== 'preview') return false;
          const preview = view.contentEl.querySelector('.markdown-preview-view');
          const target = [...preview.querySelectorAll('h2')].find(node => node.textContent.trim() === heading);
          if (!target) return false;
          const box = target.getBoundingClientRect(), viewport = preview.getBoundingClientRect();
          return preview.scrollTop > 0 && box.top >= viewport.top - 1 && box.bottom <= viewport.bottom + 1;
        }, { path: paths.target, heading });
        const position = await page.evaluate(heading => {
          const preview = app.workspace.activeLeaf.view.contentEl.querySelector('.markdown-preview-view');
          const target = [...preview.querySelectorAll('h2')].find(node => node.textContent.trim() === heading);
          const box = target.getBoundingClientRect(), viewport = preview.getBoundingClientRect();
          return { heading, scrollTop: preview.scrollTop, headingTop: box.top, headingBottom: box.bottom, viewportTop: viewport.top, viewportBottom: viewport.bottom };
        }, heading);
        assert(position.scrollTop > 0 && position.headingTop >= position.viewportTop - 1 && position.headingBottom <= position.viewportBottom + 1, 'Opening a chapter must bring its noninitial heading into the reading viewport');
        return { focus, position };
      } finally { await write(paths.target, previous); }
    });
    await run('detail-collapse-print', async () => {
      await width(1200); await fixture(detail, 'reading', ['inkstone-comic-detail']);
      const collapse = [];
      for (const type of ['comic-info', 'comic-chapters']) {
        const selector = `.markdown-preview-view .callout[data-callout="${type}"]`, callout = page.locator(selector).first();
        await callout.locator(':scope > .callout-title .callout-fold').click();
        await page.waitForFunction(selector => { const node = window.__inkstoneComicQa.leaf.view.contentEl.querySelector(selector); return node?.classList.contains('is-collapsed') && node.querySelector(':scope > .callout-content').getBoundingClientRect().height === 0; }, selector);
        await callout.locator(':scope > .callout-title .callout-fold').click();
        await page.waitForFunction(selector => { const node = window.__inkstoneComicQa.leaf.view.contentEl.querySelector(selector); return node && !node.classList.contains('is-collapsed') && node.querySelector(':scope > .callout-content').getBoundingClientRect().height > 0; }, selector);
        collapse.push({ type, reopened: true });
      }
      let print;
      try {
        await page.emulateMedia({ media: 'print' });
        print = await page.evaluate(() => {
          const view = window.__inkstoneComicQa.leaf.view.contentEl.querySelector('.markdown-preview-view');
          return { info: getComputedStyle(view.querySelector('.callout[data-callout="comic-info"]')).breakInside, chapters: getComputedStyle(view.querySelector('.callout[data-callout="comic-chapters"]')).breakInside, item: getComputedStyle(view.querySelector('.callout[data-callout="comic-chapters"] li')).breakInside };
        });
        assert.equal(print.info, 'avoid', 'Printed work introduction should stay together');
        assert.equal(print.chapters, 'auto', 'Printed chapter directory must allow page breaks');
        assert.equal(print.item, 'avoid', 'Printed chapter entries should not split');
      } finally { await page.emulateMedia({ media: null }); }
      return { collapse, print };
    });
    const spread = `> [!comic-spread]+ 手动对页\n> ![[${paths.image}]]\n>\n> ![[${paths.image}]]\n\nSpread fixture ends here.\n`;
    const spreadHost = mode => mode === 'reading' ? '.markdown-preview-view' : '.markdown-source-view';
    const spreadMetrics = mode => page.evaluate(hostSelector => {
      const view = window.__inkstoneComicQa.leaf.view.contentEl.querySelector(hostSelector);
      const callout = view.querySelector('.callout[data-callout="comic-spread"]'), box = callout.getBoundingClientRect();
      const content = callout.querySelector(':scope > .callout-content'), style = getComputedStyle(content);
      const rect = node => { const value = node.getBoundingClientRect(); return { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height }; };
      return {
        lineWidth: getComputedStyle(view).getPropertyValue('--file-line-width').trim(),
        callout: rect(callout), containerName: getComputedStyle(callout).containerName, containerType: getComputedStyle(callout).containerType,
        display: style.display, columns: style.gridTemplateColumns.split(/\s+/).length, scroll: content.scrollWidth, client: content.clientWidth,
        titleHeight: callout.querySelector(':scope > .callout-title').getBoundingClientRect().height,
        pages: [...content.querySelectorAll(':scope > p')].map(paragraph => {
          const image = paragraph.querySelector('img[src]'), textStyle = getComputedStyle(paragraph);
          return { ...rect(paragraph), text: paragraph.textContent, font: parseFloat(textStyle.fontSize), line: parseFloat(textStyle.lineHeight), image: image && { ...rect(image), widthAttribute: image.getAttribute('width'), heightAttribute: image.getAttribute('height'), naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, fit: getComputedStyle(image).objectFit, filter: getComputedStyle(image).filter } };
        }),
      };
    }, spreadHost(mode));
    for (const mode of ['reading', 'live-preview']) for (const pane of [1200, 900, 600, 320]) await run(`spread-${mode}-${pane}`, async () => {
      await width(pane); await fixture(spread, mode, ['inkstone-comic-spread']);
      await readyImages(spreadHost(mode) + ' .callout[data-callout="comic-spread"] img[src]');
      const metrics = await spreadMetrics(mode);
      assert.equal(metrics.lineWidth, '68rem', 'Spread notes must opt into the wider comic presentation');
      assert(metrics.containerName.split(/\s+/).includes('inkstone-spread') && metrics.containerType.includes('inline-size'), 'Spread width must be measured by its own named inline-size container');
      assert.equal(metrics.display, 'grid', 'Spread pages must use a native callout grid');
      assert.equal(metrics.pages.length, 2, 'Both manually grouped pages must remain present');
      assert(metrics.titleHeight > 0 && metrics.scroll <= metrics.client + 1, 'Spread title and content must fit the pane');
      assert(metrics.pages.every(value => value.image && value.left >= metrics.callout.left - 1 && value.right <= metrics.callout.right + 1 && value.image.left >= value.left - 1 && value.image.right <= value.right + 1 && value.image.width > 0 && value.image.height > 0), 'Every complete image must stay inside its page and callout');
      assert(metrics.pages.every(value => Math.abs(value.image.width / value.image.height - 400 / 240) < 0.01 && value.image.fit !== 'cover' && value.image.filter === 'none'), 'Spread pages must retain their original ratio and color without cropping');
      if (pane === 1200) {
        assert(metrics.callout.width >= 960, 'Wide fixture must exercise the component breakpoint');
        assert.equal(metrics.columns, 2, 'A spread at least 960px wide must use two columns');
        assert(Math.abs(metrics.pages[0].top - metrics.pages[1].top) <= 1 && metrics.pages[1].left >= metrics.pages[0].right - 1, 'Wide spread must place pages in source order from left to right');
      } else {
        assert(metrics.callout.width < 960, 'Narrow fixture must exercise the single-column layout');
        assert.equal(metrics.columns, 1, 'A spread below 960px must use one column');
        assert(metrics.pages[1].top >= metrics.pages[0].bottom - 1, 'Narrow spread must stack pages in source order');
      }
      return metrics;
    });
    await run('spread-contained-width', async () => {
      const modes = [];
      for (const mode of ['reading', 'live-preview']) {
        await width(1200); await fixture(spread, mode);
        await readyImages(spreadHost(mode) + ' .callout[data-callout="comic-spread"] img[src]');
        const metrics = await spreadMetrics(mode);
        assert(metrics.lineWidth !== '68rem' && metrics.callout.width < 960, 'Ordinary readable line width must constrain a spread inside a wide pane');
        assert.equal(metrics.columns, 1, 'Component width, rather than the surrounding pane, must select a single page');
        assert(metrics.pages[1].top >= metrics.pages[0].bottom - 1 && metrics.scroll <= metrics.client + 1, 'Constrained pages must stay stacked and contained');
        modes.push({ mode, ...metrics });
      }
      return modes;
    });
    await run('spread-collapse-print', async () => {
      const modes = [];
      for (const mode of ['reading', 'live-preview']) {
        await width(1200); await fixture(spread.replace('[!comic-spread]+', '[!comic-spread]-'), mode, ['inkstone-comic-spread']);
        const selector = spreadHost(mode) + ' .callout[data-callout="comic-spread"]', callout = page.locator(selector).first();
        const collapsed = await callout.evaluate(node => ({ collapsed: node.classList.contains('is-collapsed'), height: node.querySelector(':scope > .callout-content').getBoundingClientRect().height, title: node.querySelector(':scope > .callout-title').getBoundingClientRect().height }));
        assert(collapsed.collapsed && collapsed.height === 0 && collapsed.title > 0, 'A collapsed spread must keep its title and hide every page');
        await callout.locator(':scope > .callout-title .callout-fold').click();
        await page.waitForFunction(selector => { const node = window.__inkstoneComicQa.leaf.view.contentEl.querySelector(selector); return node && !node.classList.contains('is-collapsed') && getComputedStyle(node.querySelector(':scope > .callout-content')).display === 'grid'; }, selector);
        await readyImages(selector + ' img[src]');
        const reopened = await spreadMetrics(mode);
        assert.equal(reopened.columns, 2, 'Reopening a wide spread must restore both page columns');
        let print;
        try {
          await page.emulateMedia({ media: 'print' });
          print = await callout.evaluate(node => {
            const content = node.querySelector(':scope > .callout-content');
            // Hidden native print views can retain an unresolved minmax() track.
            const tracks = getComputedStyle(content).gridTemplateColumns;
            return { media: matchMedia('print').matches, display: getComputedStyle(content).display, rawColumns: tracks, outer: getComputedStyle(node).breakInside, singleColumn: /^(?:[\d.]+px|minmax\(0px,\s*1fr\))$/.test(tracks), pages: [...content.querySelectorAll(':scope > p')].map(value => getComputedStyle(value).breakInside) };
          });
          assert.equal(print.outer, 'auto', 'Printed spreads must permit page breaks between images');
          assert.equal(print.singleColumn, true, 'Printing must stack pages even when the component meets the screen breakpoint: ' + JSON.stringify({ mode, print }));
          assert(print.pages.length === 2 && print.pages.every(value => value === 'avoid'), 'Each printed page must avoid splitting within its paragraph');
        } finally { await page.emulateMedia({ media: null }); }
        modes.push({ mode, collapsed, reopened, print });
      }
      return modes;
    });
    await run('spread-odd-and-sized', async () => {
      const odd = `> [!comic-spread]+ 三页原序\n> ![[${paths.image}|200x100]]<br>第一页图注\n>\n> ![[${paths.image}]]<br>第二页图注\n>\n> ![[${paths.image}]]<br>第三页图注\n\nOdd spread fixture ends here.\n`;
      const modes = [];
      for (const mode of ['reading', 'live-preview']) {
        await width(1200); await fixture(odd, mode, ['inkstone-comic-spread']);
        await readyImages(spreadHost(mode) + ' .callout[data-callout="comic-spread"] img[src]');
        const metrics = await spreadMetrics(mode);
        assert.equal(metrics.columns, 2, 'Odd-page fixture must still exercise a wide spread');
        assert.equal(metrics.pages.length, 3, 'An unpaired final page must remain available');
        const [first, second, third] = metrics.pages;
        assert(first.image.widthAttribute === '200' && first.image.heightAttribute === '100' && Math.abs(first.image.width - 200) <= 1 && Math.abs(first.image.height - 100) <= 1, 'Explicit 200x100 page dimensions must retain precedence');
        assert(Math.abs(first.top - second.top) <= 1 && second.left > first.left && third.top >= Math.max(first.bottom, second.bottom) - 1 && Math.abs(third.left - first.left) <= 1, 'An odd last page must begin the next row without reordering');
        assert(metrics.pages.every((value, index) => value.text.includes(['第一页图注', '第二页图注', '第三页图注'][index]) && value.font >= 12 && value.line >= value.font), 'Captions must remain readable in their original page paragraphs');
        modes.push({ mode, ...metrics });
      }
      await fixture(odd, 'source', ['inkstone-comic-spread']);
      const source = await page.evaluate(() => {
        const view = window.__inkstoneComicQa.leaf.view, content = view.contentEl.querySelector('.cm-content');
        return { text: view.getViewData(), display: getComputedStyle(content).display, height: content.getBoundingClientRect().height };
      });
      assert(source.display !== 'none' && source.height > 0 && source.text.includes('[!comic-spread]') && source.text.includes('第三页图注'), 'Spread markup and captions must remain editable in source mode');
      return { modes, source: { display: source.display, height: source.height } };
    });
    await run('source-and-ordinary-note', async () => {
      await fixture(reader, 'source', ['inkstone-comic', 'inkstone-comic-strip']);
      const source = await page.evaluate(() => {
        const view = window.__inkstoneComicQa.leaf.view, content = view.contentEl.querySelector('.cm-content');
        return { display: getComputedStyle(content).display, height: content.getBoundingClientRect().height, data: view.getViewData() };
      });
      assert(source.display !== 'none' && source.height > 0 && source.data.includes('![Markdown page]'), 'Source content must remain available');
      await fixture(`Ordinary note text.\n\n![[${paths.image}|200x100]]\n`);
      await readyImages('.markdown-preview-view img');
      const ordinary = await page.evaluate(() => {
        const view = window.__inkstoneComicQa.leaf.view.contentEl.querySelector('.markdown-preview-view'), text = view.querySelector('p'), image = view.querySelector('img'), box = image.getBoundingClientRect();
        return { width: getComputedStyle(view).getPropertyValue('--file-line-width').trim(), font: parseFloat(getComputedStyle(text).fontSize), imageWidth: box.width, imageHeight: box.height };
      });
      assert(ordinary.width !== '52rem' && ordinary.width !== '68rem' && ordinary.font >= 12, 'Ordinary notes must retain their reading layout');
      assert(Math.abs(ordinary.imageWidth - 200) < 1 && Math.abs(ordinary.imageHeight - 100) < 1, 'Ordinary explicit image sizes must remain unchanged');
      return ordinary;
    });
    assert(results.length, 'Unknown case or group: ' + selected);
    if (results.some(result => !result.passed)) process.exitCode = 1;
    console.log(JSON.stringify({ app: await page.title(), results }, null, 2));
  } finally {
    if (saved) {
      try {
        await page.evaluate(async () => {
          const qa = window.__inkstoneComicQa;
          if (qa.paneStyle) { if (qa.paneStyle.value === null) qa.paneStyle.node.removeAttribute('style'); else qa.paneStyle.node.setAttribute('style', qa.paneStyle.value); }
          await app.workspace.changeLayout(qa.layout);
          for (const [path, previous] of qa.files) {
            const file = app.vault.getAbstractFileByPath(path);
            if (previous === null) { if (file) await app.vault.delete(file); }
            else if (file) await app.vault.modify(file, previous); else await app.vault.create(path, previous);
          }
          delete window.__inkstoneComicQa;
        });
        if (originalViewport) await page.setViewportSize(originalViewport); else await cdp.send('Emulation.clearDeviceMetricsOverride');
      } catch (error) { console.error('FAIL restore-comic-state', error.stack || error.message); process.exitCode = 1; }
    }
    if (cdp) await cdp.detach().catch(() => {});
    await browser.close();
  }
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
