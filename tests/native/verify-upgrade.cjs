/* Run against an isolated test vault only. See tests/native/README.md. */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.INKSTONE_PLAYWRIGHT || 'playwright');
const selectedCase = process.argv[2] || 'all';
const results = [];
(async () => {
  const browser = await chromium.connectOverCDP(process.env.INKSTONE_CDP || 'http://127.0.0.1:19227');
  try {
    const page = browser.contexts()[0].pages().find(page => page.url().startsWith('app://obsidian.md'));
    assert(page, 'Native Obsidian page missing');
    page.setDefaultTimeout(6000);
    await page.waitForFunction(() => window.app?.workspace?.layoutReady);
    assert.equal(await page.evaluate(() => app.vault.getName()), 'Inkstone Upgrade Preview', 'Refuse to edit a non-QA vault');
    await page.setViewportSize({width:1440,height:1000});
    await page.evaluate(async () => {
      if (!app.plugins.enabled) await app.plugins.setEnable(true);
      if (!app.plugins.plugins['inkstone-annotations']) await app.plugins.enablePluginAndSave('inkstone-annotations');
    });
    const run = async (name, work) => {
      if (selectedCase !== 'all' && name !== selectedCase) return;
      try { await work(); results.push({ name, passed: true }); console.log('PASS', name); }
      catch (error) { results.push({ name, passed: false, error: error.message }); console.error('FAIL', name, error.stack || error.message); }
    };
    const command = async id => page.evaluate(async id => {
      const command = app.commands.commands[`inkstone-annotations:${id}`];
      if (!command) throw new Error('Missing command: ' + id);
      if (command.callback) return command.callback();
      return command.checkCallback(false);
    }, id);
    let fixtureSequence=0;
    const runId=Date.now().toString(36);
    const fixture = async (text, mode = 'source') => {
      const name=`QA/功能验证-${runId}-${++fixtureSequence}.md`;
      await page.evaluate(async ({text,mode,name}) => {
        for (const modal of [...app.plugins.plugins['inkstone-annotations'].modals]) modal.close();
        app.plugins.plugins['inkstone-annotations'].hideToolbars();
        if (!app.vault.getAbstractFileByPath('QA')) await app.vault.createFolder('QA');
        const file = app.vault.getAbstractFileByPath(name) || await app.vault.create(name, text);
        if (await app.vault.read(file) !== text) await app.vault.modify(file, text);
        const leaf=app.workspace.getLeaf(false);
        await leaf.openFile(file, {state:{mode,source:false}});
        app.workspace.setActiveLeaf(leaf,{focus:true});
        document.querySelectorAll('[data-inkstone-qa]').forEach(node=>node.removeAttribute('data-inkstone-qa'));
        leaf.view.containerEl.dataset.inkstoneQa='current';
      }, {text,mode,name});
      await page.waitForFunction(({text,mode,name}) => {
        const view=app.workspace.getLeaf(false).view;
        return view.file?.path===name && view.getMode()===mode && view.getViewData()===text;
      }, {text,mode,name});
      if (mode === 'preview') {
        const expected = text.split('\n')[0].replace(/<[^>]*>/g, '').replace(/\[\^[^\]]+\]/g, '');
        await page.waitForFunction(expected => {
          const paragraph = app.workspace.getLeaf(false).view.contentEl.querySelector('.markdown-preview-view p')?.cloneNode(true);
          paragraph?.querySelectorAll('.footnote-ref').forEach(node => node.remove());
          const decoder=document.createElement('textarea');decoder.innerHTML=expected;
          return paragraph?.textContent === decoder.value;
        }, expected);
      }
    };
    const data=()=>page.evaluate(()=>app.workspace.getLeaf(false).view.getViewData());
    await run('reading-repeat',async()=>{
      await fixture('第一处观点，第二处观点，第三处观点。\n','preview');
      await page.evaluate(()=>{
        const text=app.workspace.getLeaf(false).view.contentEl.querySelector('.markdown-preview-view p').firstChild;
        const range=document.createRange();range.setStart(text,0);range.setEnd(text,5);
        const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
      });
      await command('highlight-yellow');
      await page.locator('[data-inkstone-qa] .markdown-preview-view mark.inkstone-yellow').waitFor();
      await page.evaluate(()=>{
        const paragraph=app.workspace.getLeaf(false).view.contentEl.querySelector('.markdown-preview-view p');
        const node=[...paragraph.childNodes].find(n=>n.nodeType===3 && n.textContent.includes('第二处观点'));
        const start=node.textContent.indexOf('第二处观点');
        const range=document.createRange();range.setStart(node,start);range.setEnd(node,start+5);
        const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
      });
      await command('highlight-blue');
      await page.waitForFunction(()=>app.workspace.getLeaf(false).view.contentEl.querySelectorAll('.markdown-preview-view mark.inkstone-highlight').length===2,{},{timeout:2500});
      assert((await data()).includes('inkstone-blue">第二处观点</mark>'));
    });
    await run('manage',async()=>{
      await fixture('<mark class="inkstone-highlight inkstone-yellow">已有观点</mark>[^inkstone-1]\n\n[^inkstone-1]: 原备注\n','preview');
      await page.locator('[data-inkstone-qa] .markdown-preview-view mark.inkstone-highlight').click();
      await page.locator('.inkstone-annotation-modal').waitFor({timeout:2500});
      assert.equal(await page.locator('textarea[aria-label="备注内容"]').inputValue(),'原备注');
      await page.getByRole('button',{name:'蓝色',exact:true}).click();
      await page.locator('textarea[aria-label="备注内容"]').fill('更新备注');
      await page.getByRole('button',{name:'保存标注',exact:true}).click();
      await page.waitForFunction(()=>!document.querySelector('.inkstone-annotation-modal'));
      assert((await data()).includes('inkstone-blue'));
      assert((await data()).includes('更新备注'));
      await page.locator('[data-inkstone-qa] .markdown-preview-view mark.inkstone-highlight').click();
      await page.getByRole('button',{name:'移除标注',exact:true}).click();
      await page.waitForFunction(()=>!document.querySelector('.inkstone-annotation-modal'));
      assert(!(await data()).includes('inkstone-'));
    });
    await run('live-preview',async()=>{
      await fixture('<mark class="inkstone-highlight inkstone-yellow">可见高亮</mark>\n\n光标放这里。\n');
      await page.evaluate(()=>app.workspace.getLeaf(false).view.editor.setCursor({line:2,ch:0}));
      await page.locator('[data-inkstone-qa] .cm-content .inkstone-live-annotation').waitFor({timeout:2500});
      assert.equal(await page.locator('[data-inkstone-qa] .cm-content .inkstone-live-annotation').first().textContent(),'可见高亮');
    });
    await run('sidebar',async()=>{
      await fixture('<mark class="inkstone-highlight inkstone-green">侧栏观点</mark>\n');
      await command('show-annotations');
      await page.locator('.inkstone-annotation-sidebar').waitFor({timeout:2500});
      assert((await page.locator('.inkstone-annotation-sidebar').textContent()).includes('侧栏观点'));
    });
    await run('export',async()=>{
      await fixture('<u class="inkstone-underline">需要摘录</u>[^inkstone-2]\n\n[^inkstone-2]: 摘录备注\n');
      await command('export-annotations');
      await page.waitForFunction(()=>app.workspace.getActiveFile()?.basename.includes('墨读摘录'),{},{timeout:2500});
      const text=await data();
      assert(text.includes('需要摘录')&&text.includes('摘录备注')&&text.includes('功能验证'));
    });
    await run('toolbar',async()=>{
      await fixture('选择文字后显示快捷工具条。\n');
      await page.evaluate(()=>app.workspace.getLeaf(false).view.editor.setSelection({line:0,ch:0},{line:0,ch:4}));
      await page.locator('.inkstone-selection-toolbar').waitFor({timeout:2500});
      await page.locator('.inkstone-selection-toolbar').getByRole('button',{name:'绿色',exact:true}).click();
      await page.waitForFunction(()=>app.workspace.getLeaf(false).view.getViewData().includes('inkstone-green'));
    });
    await run('pagination',async()=>{
      const text=Array.from({length:120},(_,i)=>`第${i+1}段：用于检查按屏翻页与保留上下文。\n`).join('\n');
      for(const mode of ['preview','source']) {
        await fixture(text,mode);
        const read=()=>page.evaluate(()=>{
          const view=app.workspace.getLeaf(false).view;
          const scroller=view.contentEl.querySelector(view.getMode()==='preview'?'.markdown-preview-view':'.cm-scroller');
          return {top:scroller.scrollTop,height:scroller.clientHeight,max:scroller.scrollHeight-scroller.clientHeight};
        });
        const move=async edge=>{
          await page.evaluate(async edge=>{
            const view=app.workspace.getLeaf(false).view;
            const scroller=view.contentEl.querySelector(view.getMode()==='preview'?'.markdown-preview-view':'.cm-scroller');
            for(let attempt=0;attempt<12;attempt++){
              scroller.scrollTop=edge==='bottom'?scroller.scrollHeight:0;
              await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
              const target=edge==='bottom'?scroller.scrollHeight-scroller.clientHeight:0;
              if(Math.abs(scroller.scrollTop-target)<=1)return;
            }
            throw Error('Virtualized viewport did not settle at '+edge);
          },edge);
        };
        const assertPage=(distance,height,label)=>{
          assert(distance>=height*0.75&&distance<height,`${mode} ${label} should move most of the viewport and retain visible context: ${distance}/${height}`);
        };
        await move('top');
        const start=await read();
        assert(start.height>0&&start.max>start.height*2,`${mode} fixture must scroll for multiple pages`);
        await command('previous-page');
        assert.equal((await read()).top,0,`${mode} previous at top stays clamped`);
        await command('next-page');
        const next=await read();
        assertPage(next.top-start.top,start.height,'next');
        await command('previous-page');
        assert(Math.abs((await read()).top-start.top)<=1,`${mode} previous restores the first page`);
        await move('bottom');
        const bottom=await read();
        assert(Math.abs(bottom.top-bottom.max)<=1,`${mode} fixture must reach the bottom`);
        await command('next-page');
        const clamped=await read();
        assert(Math.abs(clamped.top-clamped.max)<=1,`${mode} next at bottom stays clamped`);
        await command('previous-page');
        const previous=await read();
        assertPage(bottom.top-previous.top,bottom.height,'previous');
      }
    });
    await run('reading-entities-and-embeds',async()=>{
      await fixture('<mark class="inkstone-highlight inkstone-yellow">已有观点</mark>[^inkstone-1]，A &amp; B 与 😀。\n\n[^inkstone-1]: 原备注保留\n','preview');
      const selectText=async needle=>page.evaluate(needle=>{
        const paragraph=app.workspace.getLeaf(false).view.contentEl.querySelector('.markdown-preview-view p');
        const walker=document.createTreeWalker(paragraph,4);let node;
        while((node=walker.nextNode())) {
          const at=node.nodeValue.indexOf(needle);
          if(at<0)continue;
          const range=document.createRange();range.setStart(node,at);range.setEnd(node,at+needle.length);
          const selected=window.getSelection();selected.removeAllRanges();selected.addRange(range);return;
        }
        throw Error('No visible text: '+needle);
      },needle);
      await selectText('&');await command('highlight-blue');
      await page.waitForFunction(()=>{
        const view=app.workspace.getLeaf(false).view;
        const mark=view.contentEl.querySelector('.markdown-preview-view mark.inkstone-blue');
        if(mark?.textContent!=='&')return false;
        try{return app.plugins.plugins['inkstone-annotations'].readingSection(view,mark.closest('p')).snapshot===view.getViewData();}catch{return false;}
      });
      await selectText('😀');await command('highlight-green');
      await page.waitForFunction(()=>{
        const view=app.workspace.getLeaf(false).view;
        const mark=view.contentEl.querySelector('.markdown-preview-view mark.inkstone-green');
        if(mark?.textContent!=='😀')return false;
        try{return app.plugins.plugins['inkstone-annotations'].readingSection(view,mark.closest('p')).snapshot===view.getViewData();}catch{return false;}
      });
      assert((await data()).includes('[^inkstone-1]: 原备注保留'));
      await page.evaluate(async()=>{
        const path='QA/嵌入标注.md',text='<mark class="inkstone-highlight inkstone-blue">嵌入观点</mark>\n';
        const file=app.vault.getAbstractFileByPath(path);if(file)await app.vault.modify(file,text);else await app.vault.create(path,text);
      });
      const host='<u class="inkstone-underline">宿主观点</u>\n\n![[QA/嵌入标注]]\n';
      await fixture(host,'preview');
      const embedded=page.locator('[data-inkstone-qa] .internal-embed mark.inkstone-highlight');
      await embedded.waitFor();await embedded.click();
      assert.equal(await page.locator('.inkstone-annotation-modal').count(),0);
      assert.equal(await data(),host);
    });
    await run('live-preview-edit-and-source',async()=>{
      await fixture('前文 <mark class="inkstone-highlight inkstone-green">甲 &amp; 乙</mark>，后文<u class="inkstone-underline">下划线</u>。\n\n光标在这里。\n');
      await page.evaluate(()=>app.workspace.getLeaf(false).view.editor.setCursor({line:2,ch:0}));
      const widgets=page.locator('[data-inkstone-qa] .cm-content .inkstone-live-annotation');
      await page.waitForFunction(()=>app.workspace.getLeaf(false).view.contentEl.querySelectorAll('.inkstone-live-annotation').length===2);
      assert.deepEqual(await widgets.allTextContents(),['甲 & 乙','下划线']);
      await widgets.first().click();
      await page.locator('textarea[aria-label="备注内容"]').fill('实时预览备注');
      await page.getByRole('button',{name:'蓝色',exact:true}).click();
      await page.getByRole('button',{name:'保存标注',exact:true}).click();
      await page.waitForFunction(()=>!document.querySelector('.inkstone-annotation-modal'));
      assert((await data()).includes('inkstone-blue')&&(await data()).includes('实时预览备注'));
      await page.evaluate(()=>{const view=app.workspace.getLeaf(false).view;view.editor.setCursor(view.editor.offsetToPos(view.getViewData().indexOf('甲')+1));});
      assert((await page.locator('[data-inkstone-qa] .cm-content').textContent()).includes('<mark class='));
      await page.evaluate(async()=>{const leaf=app.workspace.getLeaf(false);const state=leaf.getViewState();await leaf.setViewState({...state,state:{...state.state,mode:'source',source:true}});});
      await page.waitForFunction(()=>!app.workspace.getLeaf(false).view.contentEl.querySelector('.markdown-source-view.is-live-preview'));
      assert.equal(await widgets.count(),0);
    });
    await run('font-and-reading-preferences',async()=>{
      await fixture('正文随着原生字号和阅读预设变化。\n','preview');
      const previous=await page.evaluate(()=>document.body.style.getPropertyValue('--font-text-size'));
      const read=()=>page.locator('[data-inkstone-qa] .markdown-preview-view p').evaluate(node=>({font:getComputedStyle(node).fontSize,line:getComputedStyle(node).lineHeight,width:getComputedStyle(node).getPropertyValue('--file-line-width').trim()}));
      await page.evaluate(()=>document.body.style.setProperty('--font-text-size','22px'));
      assert.equal((await read()).font,'22px');
      await page.evaluate(()=>{const style=document.createElement('style');style.id='inkstone-test-snippet';style.textContent='body.theme-light { --inkstone-font-size: 24px; }';document.head.append(style);});
      assert.equal((await read()).font,'24px');
      await page.evaluate(()=>document.getElementById('inkstone-test-snippet').remove());
      await page.evaluate(async()=>{const plugin=app.plugins.plugins['inkstone-annotations'];await plugin.setReadingPreference('readingLineHeight','2');await plugin.setReadingPreference('readingLineWidth','32em');});
      assert.deepEqual(await read(),{font:'22px',line:'44px',width:'32em'});
      await page.evaluate(async()=>{await app.plugins.unloadPlugin('inkstone-annotations');});
      assert.equal(await page.evaluate(()=>document.body.style.getPropertyValue('--inkstone-line-height')),'');
      assert.equal(await page.locator('.inkstone-selection-toolbar').count(),0);
      await page.evaluate(async()=>{await app.plugins.loadPlugin('inkstone-annotations');});
      assert.deepEqual(await read(),{font:'22px',line:'44px',width:'32em'});
      await page.evaluate(async previous=>{const plugin=app.plugins.plugins['inkstone-annotations'];await plugin.setReadingPreference('readingLineHeight','');await plugin.setReadingPreference('readingLineWidth','');if(previous)document.body.style.setProperty('--font-text-size',previous);else document.body.style.removeProperty('--font-text-size');},previous);
    });
    await run('sidebar-controls-and-narrow-toolbar',async()=>{
      await fixture('<mark class="inkstone-highlight inkstone-blue">蓝色观点</mark>，<u class="inkstone-underline">下划线观点</u>。\n','preview');
      await command('show-annotations');
      const sidebar=page.locator('.inkstone-annotation-sidebar');
      await sidebar.getByLabel('筛选标注颜色').selectOption('blue');
      assert.equal(await sidebar.locator('.inkstone-annotation-card').count(),1);
      await sidebar.getByRole('button',{name:'编辑',exact:true}).click();
      await page.locator('.inkstone-annotation-modal').waitFor();
      await page.getByRole('button',{name:'取消',exact:true}).click();
      await sidebar.getByLabel('筛选标注颜色').selectOption('underline');
      assert((await sidebar.locator('.inkstone-annotation-card').textContent()).includes('下划线观点'));
      await sidebar.getByRole('button',{name:'定位原文',exact:true}).click();
      await page.evaluate(()=>{app.workspace.leftSplit.collapse();app.workspace.rightSplit.collapse();});
      await page.setViewportSize({width:390,height:844});
      await fixture('选择文字后显示快捷工具条。\n');
      await page.evaluate(()=>app.workspace.getLeaf(false).view.editor.setSelection({line:0,ch:0},{line:0,ch:4}));
      const toolbar=page.locator('.inkstone-selection-toolbar');await toolbar.waitFor();
      const bounds=await toolbar.boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=391);
      const green=toolbar.getByRole('button',{name:'绿色',exact:true});
      await green.dispatchEvent('pointerdown',{pointerType:'touch',isPrimary:true});await green.click();
      await page.waitForFunction(()=>app.plugins.plugins['inkstone-annotations'].settings.lastColor==='green');
      await page.evaluate(async()=>{await app.plugins.unloadPlugin('inkstone-annotations');await app.plugins.loadPlugin('inkstone-annotations');});
      await fixture('重新选择文字，检查记住的颜色。\n');
      await page.evaluate(()=>app.workspace.getLeaf(false).view.editor.setSelection({line:0,ch:0},{line:0,ch:4}));
      await command('annotate');
      assert.equal(await page.getByRole('button',{name:'绿色',exact:true}).getAttribute('aria-pressed'),'true');
      await page.getByRole('button',{name:'取消',exact:true}).click();
      await page.setViewportSize({width:1440,height:1000});
    });
    if(results.some(result=>!result.passed))process.exitCode=1;
    console.log(JSON.stringify({app:await page.title(),results},null,2));
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
