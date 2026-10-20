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
      await app.plugins.plugins['inkstone-annotations'].setMonochrome(false);
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
      await page.keyboard.press('Escape');
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
    const rememberScope=()=>page.evaluate(()=>{
      const current=app.keymap.windowScopes.get(window);
      window.__inkstoneQaSavedScope={scope:current.scope,prevScopes:[...current.prevScopes]};
    });
    const assertScope=async active=>assert.equal(await page.evaluate(active=>{
      const current=app.keymap.windowScopes.get(window),saved=window.__inkstoneQaSavedScope;
      if(active)return current.scope!==saved.scope&&current.prevScopes.length===saved.prevScopes.length+1;
      return current.scope===saved.scope&&current.prevScopes.length===saved.prevScopes.length&&current.prevScopes.every((scope,index)=>scope===saved.prevScopes[index]);
    },active),true,active?'The thought composer should own a temporary keyboard scope':'Closing the thought composer should restore the exact previous keyboard scope');
    const existingAnnotation=async(mode='preview',index=0)=>{
      if(mode==='source')await page.evaluate(()=>app.workspace.getLeaf(false).view.editor.setCursor({line:2,ch:0}));
      const selector=mode==='preview'?'.markdown-preview-view :is(mark.inkstone-highlight,u.inkstone-underline)':'.cm-content .inkstone-live-annotation';
      await page.waitForFunction(({selector,index,mode})=>{
        const view=app.workspace.getLeaf(false).view,node=view.contentEl.querySelectorAll(selector)[index];
        if(!node)return false;
        if(mode!=='preview')return true;
        try{return !!app.plugins.plugins['inkstone-annotations'].readingAnnotationContext(node,view);}catch{return false;}
      },{selector,index,mode});
      return page.locator(`[data-inkstone-qa] ${selector}`).nth(index);
    };
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
    await run('existing-annotation-menu',async()=>{
      for(const mode of ['preview','source']) {
        await fixture('<mark class="inkstone-highlight inkstone-yellow">轻点已有标注</mark>[^inkstone-1]\n\n光标在这里。\n\n[^inkstone-1]: 原有想法\n',mode);
        const annotation=await existingAnnotation(mode);await annotation.click();
        assert.equal(await page.locator('.inkstone-annotation-modal').count(),0,`${mode} clicking an existing annotation should avoid the full modal`);
        await page.locator('.inkstone-annotation-menu').waitFor({timeout:2500});
        await page.keyboard.press('Escape');
        await page.waitForFunction(()=>!document.querySelector('.inkstone-annotation-menu'));
      }
    });
    await run('manage',async()=>{
      await fixture('<mark class="inkstone-highlight inkstone-yellow">已有观点</mark>[^inkstone-1]\n\n[^inkstone-1]: 原备注\n','preview');
      await rememberScope();
      await (await existingAnnotation()).click();
      const menu=page.locator('.inkstone-annotation-menu');await menu.waitFor();
      assert.equal(await page.locator('.inkstone-annotation-modal').count(),0);
      await menu.getByRole('button',{name:'蓝色',exact:true}).click();
      await page.waitForFunction(()=>!document.querySelector('.inkstone-annotation-menu'));
      assert((await data()).includes('inkstone-blue'));
      assert((await data()).includes('[^inkstone-1]: 原备注'));
      await (await existingAnnotation()).click();
      await menu.getByRole('button',{name:'编辑想法',exact:true}).click();
      await assertScope(true);
      const note=menu.getByRole('textbox',{name:'想法内容',exact:true});
      assert.equal(await note.inputValue(),'原备注');
      await note.fill('取消的草稿');
      await menu.getByRole('button',{name:'取消',exact:true}).click();
      await assertScope(false);
      assert((await data()).includes('[^inkstone-1]: 原备注'));
      assert(!(await data()).includes('取消的草稿'));
      await menu.getByRole('button',{name:'编辑想法',exact:true}).click();
      await note.fill('更新备注');await note.press(process.platform==='darwin'?'Meta+Enter':'Control+Enter');
      await page.waitForFunction(()=>!document.querySelector('.inkstone-annotation-menu'));
      await assertScope(false);
      assert((await data()).includes('更新备注'));
      assert((await data()).includes('inkstone-blue'));
      await (await existingAnnotation()).click();
      assert.equal(await menu.locator('.inkstone-annotation-menu-note').textContent(),'更新备注');
      await page.keyboard.press('Escape');
      await command('undo-annotation');
      assert((await data()).includes('[^inkstone-1]: 原备注'));
      assert(!(await data()).includes('更新备注'));
      await (await existingAnnotation()).click();
      assert.equal(await menu.locator('.inkstone-annotation-menu-note').textContent(),'原备注');
      await menu.getByRole('button',{name:'删除标注',exact:true}).click();
      await page.waitForFunction(()=>!document.querySelector('.inkstone-annotation-menu'));
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
      await page.locator('.inkstone-selection-toolbar').getByRole('button',{name:'划线样式',exact:true}).click();
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
      const menu=page.locator('.inkstone-annotation-menu');await menu.waitFor();
      assert.equal(await page.locator('.inkstone-annotation-modal').count(),0);
      await menu.getByRole('button',{name:'蓝色',exact:true}).click();
      await page.waitForFunction(()=>!document.querySelector('.inkstone-annotation-menu'));
      await (await existingAnnotation('source')).click();
      await menu.getByRole('button',{name:'写想法',exact:true}).click();
      await menu.getByRole('textbox',{name:'想法内容',exact:true}).fill('实时预览备注');
      await menu.getByRole('button',{name:'保存想法',exact:true}).click();
      await page.waitForFunction(()=>!document.querySelector('.inkstone-annotation-menu'));
      assert((await data()).includes('inkstone-blue')&&(await data()).includes('实时预览备注'));
      await page.evaluate(()=>{const view=app.workspace.getLeaf(false).view;view.editor.setCursor(view.editor.offsetToPos(view.getViewData().indexOf('甲')+1));view.editor.focus();});
      await page.waitForFunction(()=>app.workspace.getLeaf(false).view.contentEl.querySelector('.cm-content').textContent.includes('<mark class='));
      assert((await page.locator('[data-inkstone-qa] .cm-content').textContent()).includes('<mark class='));
      await page.evaluate(async()=>{const leaf=app.workspace.getLeaf(false);const state=leaf.getViewState();await leaf.setViewState({...state,state:{...state.state,mode:'source',source:true}});});
      await page.waitForFunction(()=>!app.workspace.getLeaf(false).view.contentEl.querySelector('.markdown-source-view.is-live-preview'));
      assert.equal(await widgets.count(),0);
    });
    await run('existing-menu-keyboard-and-dismissal',async()=>{
      for(const mode of ['preview','source']) {
        await fixture('<mark class="inkstone-highlight inkstone-green">键盘已有标注</mark>\n\n空白正文。\n',mode);
        await rememberScope();
        const annotation=await existingAnnotation(mode);
        for(const key of ['Enter','Space']) {
          await annotation.focus();await annotation.press(key);
          await page.locator('.inkstone-annotation-menu').waitFor();
          assert.equal(await page.locator('.inkstone-annotation-modal').count(),0);
          await page.keyboard.press('Escape');
          await page.waitForFunction(()=>!document.querySelector('.inkstone-annotation-menu'));
        }
        await annotation.click();
        await page.locator('.inkstone-annotation-menu').getByRole('button',{name:'写想法',exact:true}).click();
        await assertScope(true);await page.keyboard.press('Escape');
        await page.waitForFunction(()=>!document.querySelector('.inkstone-annotation-menu'));
        await assertScope(false);
        await annotation.click();
        await page.mouse.click(25,25);
        await page.waitForFunction(()=>!document.querySelector('.inkstone-annotation-menu'));
        await annotation.click();
        await page.evaluate(()=>app.workspace.getLeaf(false).view.contentEl.dispatchEvent(new Event('scroll')));
        await page.waitForFunction(()=>!document.querySelector('.inkstone-annotation-menu'));
      }
      await fixture('<u class="inkstone-underline">切文件前标注</u>\n','preview');
      await (await existingAnnotation()).click();
      await page.evaluate(async()=>{
        const path=`QA/菜单关闭-${Date.now()}.md`,file=await app.vault.create(path,'切换到其他笔记。\n');
        await app.workspace.getLeaf(false).openFile(file);
      });
      await page.waitForFunction(()=>!document.querySelector('.inkstone-annotation-menu'));
      await fixture('<u class="inkstone-underline">停用前标注</u>\n','preview');
      await rememberScope();
      await (await existingAnnotation()).click();
      await page.locator('.inkstone-annotation-menu').getByRole('button',{name:'写想法',exact:true}).click();
      await assertScope(true);
      await page.evaluate(async()=>{await app.plugins.unloadPlugin('inkstone-annotations');});
      assert.equal(await page.locator('.inkstone-annotation-menu').count(),0);
      await assertScope(false);
      await page.evaluate(async()=>{await app.plugins.loadPlugin('inkstone-annotations');app.workspace.getLeaf(false).view.previewMode.rerender(true);});
    });
    await run('existing-menu-stale-write-protection',async()=>{
      for(const action of ['蓝色','保存想法','删除标注']) {
        const original='<mark class="inkstone-highlight inkstone-yellow">过期菜单标注</mark>\n\n其他正文。\n';
        await fixture(original,'preview');await (await existingAnnotation()).click();
        const menu=page.locator('.inkstone-annotation-menu');
        if(action==='保存想法') {
          await menu.getByRole('button',{name:'写想法',exact:true}).click();
          await menu.getByRole('textbox',{name:'想法内容',exact:true}).fill('不应写入的旧想法');
        }
        const updated=original+'外部新增内容。\n';
        await page.evaluate(({updated,action})=>{
          const button=[...document.querySelectorAll('.inkstone-annotation-menu button')].find(button=>(button.getAttribute('aria-label')||button.textContent).trim()===action);
          if(!button)throw Error('Stale action button missing: '+action);
          const view=app.workspace.getLeaf(false).view;view.setViewData(updated,false);
          if(view.getViewData()!==updated)throw Error('QA snapshot mutation failed');
          button.click();
        },{updated,action});
        await page.waitForFunction(()=>document.querySelector('.inkstone-annotation-menu-error')?.textContent||!document.querySelector('.inkstone-annotation-menu'));
        assert.equal(await data(),updated,`${action} from an old menu must not change the newer snapshot`);
        assert.equal(await page.locator('.inkstone-annotation-modal').count(),0);
      }
    });
    await run('existing-menu-shared-note-protection',async()=>{
      await fixture('<mark class="inkstone-highlight inkstone-yellow">甲观点</mark>[^inkstone-1]，<mark class="inkstone-highlight inkstone-blue">乙观点</mark>[^inkstone-1]\n\n[^inkstone-1]: 共享原想法\n','preview');
      await (await existingAnnotation()).click();
      const menu=page.locator('.inkstone-annotation-menu');
      await menu.getByRole('button',{name:'编辑想法',exact:true}).click();
      await menu.getByRole('textbox',{name:'想法内容',exact:true}).fill('甲的新想法');
      await menu.getByRole('button',{name:'保存想法',exact:true}).click();
      await page.waitForFunction(()=>!document.querySelector('.inkstone-annotation-menu'));
      const records=await page.evaluate(()=>{const view=app.workspace.getLeaf(false).view;return app.plugins.plugins['inkstone-annotations'].recordsFor(view.getViewData(),view.file.path).map(({text,note})=>({text,note}));});
      assert.deepEqual(records,[{text:'甲观点',note:'甲的新想法'},{text:'乙观点',note:'共享原想法'}]);
      await (await existingAnnotation()).click();await menu.getByRole('button',{name:'删除标注',exact:true}).click();
      await page.waitForFunction(()=>!document.querySelector('.inkstone-annotation-menu'));
      const text=await data();assert(text.includes('甲观点，<mark'));assert(text.includes('[^inkstone-1]: 共享原想法'));assert(!text.includes('甲的新想法'));
    });
    await run('existing-menu-narrow-layout',async()=>{
      await page.evaluate(()=>{app.workspace.leftSplit.collapse();app.workspace.rightSplit.collapse();});
      await page.setViewportSize({width:390,height:844});
      try{
        await fixture('<mark class="inkstone-highlight inkstone-blue">窄屏已有标注</mark>\n\n点击这里可以写想法。\n','preview');
        await (await existingAnnotation()).click();
        const menu=page.locator('.inkstone-annotation-menu');await menu.waitFor();
        const check=async()=>{
          const box=await menu.boundingBox();assert(box.x>=0&&box.x+box.width<=390);assert(box.y>=0&&box.y+box.height<=844);
          const size=await menu.evaluate(node=>({width:node.clientWidth,scroll:node.scrollWidth}));assert(size.scroll<=size.width+1);
        };
        await check();
        await menu.getByRole('button',{name:'写想法',exact:true}).click();
        await menu.getByRole('textbox',{name:'想法内容',exact:true}).fill('窄屏下也能直接写想法。');
        await check();
        await menu.getByRole('textbox',{name:'想法内容',exact:true}).dispatchEvent('scroll');
        assert.equal(await menu.count(),1,'Scrolling inside the thought input should keep its draft open');
        assert.equal(await page.locator('.inkstone-annotation-modal').count(),0);
        await page.keyboard.press('Escape');
      }finally{await page.setViewportSize({width:1440,height:1000});}
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
      await toolbar.getByRole('button',{name:'划线样式',exact:true}).click();
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

    const selectEditorText=async text=>{
      await page.evaluate(text=>{
        const view=app.workspace.getLeaf(false).view,snapshot=view.getViewData(),from=snapshot.indexOf(text);
        if(from<0)throw Error('Fixture selection not found');
        view.editor.setSelection(view.editor.offsetToPos(from),view.editor.offsetToPos(from+text.length));
      },text);
      await page.locator('.inkstone-selection-toolbar').waitFor();
    };
    await run('toolbar-primary-and-visible-styles',async()=>{
      await page.evaluate(()=>{const plugin=app.plugins.plugins['inkstone-annotations'];plugin.settings.lastKind='highlight';plugin.settings.lastColor='green';});
      await fixture('选中文字后，留下值得回味的句子。\n');
      await selectEditorText('留下值得回味的句子');
      const toolbar=page.locator('.inkstone-selection-toolbar');
      assert.deepEqual(await toolbar.locator('.inkstone-toolbar-actions button').evaluateAll(buttons=>buttons.map(button=>button.getAttribute('aria-label'))),['复制','划线','划线样式','写想法','更多']);
      const primary=await toolbar.evaluate(node=>({height:node.getBoundingClientRect().height,font:getComputedStyle(node).fontSize,rows:[...node.querySelectorAll('.inkstone-toolbar-actions button')].map(button=>button.getBoundingClientRect().top)}));
      assert(primary.height<=48,`Desktop toolbar height: ${primary.height}`);assert.equal(primary.font,'13px');assert.equal(new Set(primary.rows).size,1);
      assert.equal(await toolbar.locator('.inkstone-toolbar-dot:visible').count(),0);
      await toolbar.getByRole('button',{name:'划线样式',exact:true}).click();
      await page.waitForTimeout(350);
      assert.equal(await toolbar.getByRole('button',{name:'划线样式',exact:true}).getAttribute('aria-expanded'),'true');
      const colors=await toolbar.locator('.inkstone-toolbar-dot').evaluateAll(dots=>dots.map(dot=>getComputedStyle(dot).backgroundColor));
      assert.equal(colors.length,4);assert.equal(new Set(colors).size,4);assert(colors.every(color=>!['rgb(255, 255, 255)','rgba(0, 0, 0, 0)'].includes(color)),JSON.stringify(colors));
      assert.equal(await toolbar.getByRole('button',{name:'绿色',exact:true}).getAttribute('aria-pressed'),'true');
      await toolbar.getByRole('button',{name:'蓝色',exact:true}).click();
      await page.waitForFunction(()=>app.workspace.getLeaf(false).view.getViewData().includes('inkstone-blue">留下值得回味的句子</mark>'));
      await fixture('下一处选择，沿用最近的样式。\n');await selectEditorText('沿用最近的样式');
      await toolbar.getByRole('button',{name:'划线样式',exact:true}).click();
      assert.equal(await toolbar.getByRole('button',{name:'蓝色',exact:true}).getAttribute('aria-pressed'),'true');
      await toolbar.getByRole('button',{name:'划线',exact:true}).click();
      await page.waitForFunction(()=>app.workspace.getLeaf(false).view.getViewData().includes('inkstone-blue">沿用最近的样式</mark>'));
    });
    await run('toolbar-note-preserves-style',async()=>{
      for(const [color,label] of [['green','保留绿色观点'],[null,'保留旧式观点']]) {
        const mark=`<mark class="inkstone-highlight${color?' inkstone-'+color:''}">${label}</mark>`;
        const original=mark+'[^inkstone-1]\n\n[^inkstone-1]: 原有想法\n';
        await fixture(original);await selectEditorText(label);await rememberScope();
        await page.locator('.inkstone-selection-toolbar').getByRole('button',{name:'写想法',exact:true}).click();
        assert.equal(await page.locator('.inkstone-annotation-modal').count(),0,'Selection toolbar thoughts should open the compact composer directly');
        const menu=page.locator('.inkstone-annotation-menu'),note=menu.getByRole('textbox',{name:'想法内容',exact:true});await note.waitFor();
        assert.equal(await menu.locator('.inkstone-annotation-menu-quote').textContent(),label);
        assert.equal(await note.inputValue(),'原有想法');assert.equal(await data(),original);
        await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='想法内容',{}, {timeout:1500});
        await assertScope(true);
        await note.fill('只补充想法，保留原有样式。');await menu.getByRole('button',{name:'保存想法',exact:true}).click();
        await page.waitForFunction(()=>!document.querySelector('.inkstone-annotation-menu'));await assertScope(false);
        const text=await data();assert(text.includes(mark));assert(text.includes('只补充想法，保留原有样式。'));assert(!text.includes('inkstone-underline'));
      }
    });
    const setupIdea=async(mode,text,needle)=>{
      await fixture(text,mode==='preview'?'preview':'source');
      if(mode==='source') {
        await page.evaluate(async()=>{const leaf=app.workspace.getLeaf(false),state=leaf.getViewState();await leaf.setViewState({...state,state:{...state.state,source:true}});});
        await page.waitForFunction(()=>!app.workspace.getLeaf(false).view.contentEl.querySelector('.markdown-source-view.is-live-preview'));
      }
      if(mode==='preview') {
        await page.evaluate(needle=>{
          const paragraph=app.workspace.getLeaf(false).view.contentEl.querySelector('.markdown-preview-view p'),walker=document.createTreeWalker(paragraph,4);let node;
          while((node=walker.nextNode())) {
            const at=node.nodeValue.indexOf(needle);if(at<0)continue;
            const range=document.createRange();range.setStart(node,at);range.setEnd(node,at+needle.length);
            const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);return;
          }
          throw Error('Visible selection missing: '+needle);
        },needle);
        await page.locator('.inkstone-selection-toolbar:not(.inkstone-annotation-menu)').waitFor();
      }else await selectEditorText(needle);
      await rememberScope();
      await page.locator('.inkstone-selection-toolbar:not(.inkstone-annotation-menu)').getByRole('button',{name:'写想法',exact:true}).click();
      const menu=page.locator('.inkstone-annotation-menu'),input=menu.getByRole('textbox',{name:'想法内容',exact:true});await input.waitFor();
      assert.equal(await page.locator('.inkstone-annotation-modal').count(),0);
      assert.equal(await menu.locator('.inkstone-annotation-menu-quote').textContent(),needle);
      await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='想法内容');
      await assertScope(true);
      return {menu,input};
    };
    await run('selection-idea-modes-and-single-write',async()=>{
      for(const mode of ['preview','live-preview','source']) {
        const original='前文，选择的句子。后文。\n\n其他正文。\n';
        const {menu,input}=await setupIdea(mode,original,'选择的句子');assert.equal(await data(),original);
        await page.evaluate(()=>{
          const editor=app.workspace.getLeaf(false).view.editor,transaction=editor.transaction;
          window.__inkstoneQaTransaction={editor,transaction,count:0};
          editor.transaction=function(...args){if(args[1]==='inkstone-annotation')window.__inkstoneQaTransaction.count++;return transaction.apply(this,args);};
        });
        try{
          await input.fill('来自'+mode+'的想法');await input.press(process.platform==='darwin'?'Meta+Enter':'Control+Enter');
          await page.waitForFunction(()=>!document.querySelector('.inkstone-annotation-menu'));await assertScope(false);
          const text=await data();assert(text.includes('前文，<u class="inkstone-underline">选择的句子</u>[^inkstone-'));assert(text.includes('。后文。'));assert(text.includes('来自'+mode+'的想法'));
          assert.equal(await page.evaluate(()=>window.__inkstoneQaTransaction.count),1,mode+' saving should create one annotation transaction');
          assert.equal(await menu.count(),0);
        }finally{
          await page.evaluate(()=>{const saved=window.__inkstoneQaTransaction;saved.editor.transaction=saved.transaction;delete window.__inkstoneQaTransaction;});
        }
      }
    });
    await run('selection-idea-dismissals-and-empty',async()=>{
      for(const [mode,action] of [['preview','cancel'],['live-preview','escape'],['source','outside'],['preview','empty']]) {
        const original='未保存的想法不应提前改动这段文字。\n';
        const {menu,input}=await setupIdea(mode,original,'这段文字');
        await input.fill(action==='empty'?'   \n   ':'还没有保存的草稿');
        assert.equal(await data(),original);
        if(action==='cancel')await menu.getByRole('button',{name:'取消',exact:true}).click();
        if(action==='escape')await input.press('Escape');
        if(action==='outside')await page.mouse.click(25,25);
        if(action==='empty') {
          await menu.getByRole('button',{name:'保存想法',exact:true}).click();
          assert.equal(await data(),original,'A blank new thought should not insert an empty annotation');
          await page.keyboard.press('Escape');
        }
        await page.waitForFunction(()=>!document.querySelector('.inkstone-annotation-menu'));await assertScope(false);
        assert.equal(await data(),original);assert.equal(await page.locator('.inkstone-annotation-modal').count(),0);
      }
    });
    await run('selection-idea-stale-draft-protection',async()=>{
      for(const mode of ['preview','source']) {
        const original='修改后的正文应拒绝旧选区写入。\n';
        const {menu,input}=await setupIdea(mode,original,'旧选区');
        const draft='过期时保留这段草稿';await input.fill(draft);
        const updated=original+'另一次编辑新增的内容。\n';
        await page.evaluate(updated=>{
          const button=document.querySelector('.inkstone-annotation-menu [aria-label="保存想法"]'),view=app.workspace.getLeaf(false).view;
          view.setViewData(updated,false);if(view.getViewData()!==updated)throw Error('QA snapshot mutation failed');button.click();
        },updated);
        await page.waitForFunction(()=>document.querySelector('.inkstone-annotation-menu-error')?.textContent||!document.querySelector('.inkstone-annotation-menu'));
        assert.equal(await data(),updated);
        if(await menu.count()) {
          assert.equal(await input.inputValue(),draft);assert.equal(await input.isEnabled(),true);assert.equal(await menu.getByRole('button',{name:'保存想法',exact:true}).isEnabled(),true);
          await input.press('Escape');
        }
        await assertScope(false);
      }
      const original='写入失败时，应当保留这段草稿。\n',draft='保存失败后，可以继续编辑并重试。';
      const {menu,input}=await setupIdea('source',original,'保留这段草稿');await input.fill(draft);
      await page.evaluate(()=>{const editor=app.workspace.getLeaf(false).view.editor;window.__inkstoneQaFailedTransaction={editor,transaction:editor.transaction};editor.transaction=()=>{throw Error('QA: simulated editor write failure');};});
      try{
        await menu.getByRole('button',{name:'保存想法',exact:true}).click();
        await menu.locator('.inkstone-annotation-menu-error').waitFor();
        assert.equal(await data(),original);assert.equal(await input.inputValue(),draft);assert.equal(await input.isEnabled(),true);assert.equal(await menu.getByRole('button',{name:'保存想法',exact:true}).isEnabled(),true);
      }finally{
        await page.evaluate(()=>{const saved=window.__inkstoneQaFailedTransaction;saved.editor.transaction=saved.transaction;delete window.__inkstoneQaFailedTransaction;});
      }
      await menu.getByRole('button',{name:'保存想法',exact:true}).click();
      await page.waitForFunction(()=>!document.querySelector('.inkstone-annotation-menu'));await assertScope(false);
      assert((await data()).includes(draft));
    });
    await run('selection-idea-narrow-layout',async()=>{
      await page.evaluate(()=>{app.workspace.leftSplit.collapse();app.workspace.rightSplit.collapse();});await page.setViewportSize({width:390,height:844});
      try{
        const original='窄屏选中文字之后，也能在句子旁写想法。\n';
        const {menu,input}=await setupIdea('preview',original,'在句子旁写想法');
        await input.fill(Array.from({length:30},(_,index)=>`第${index+1}行草稿`).join('\n'));
        const box=await menu.boundingBox();assert(box.x>=0&&box.x+box.width<=390);assert(box.y>=0&&box.y+box.height<=844);
        const size=await menu.evaluate(node=>({width:node.clientWidth,scroll:node.scrollWidth}));assert(size.scroll<=size.width+1);
        await input.dispatchEvent('scroll');assert.equal(await menu.count(),1);assert.equal(await data(),original);
        await input.press('Escape');await assertScope(false);
      }finally{await page.setViewportSize({width:1440,height:1000});}
    });
    await run('toolbar-copy-with-isolated-clipboard',async()=>{
      const original='只复制当前选择，正文保持原样。\n';await fixture(original);await selectEditorText('当前选择');
      await page.evaluate(()=>{window.__inkstoneQaOriginalWrite=navigator.clipboard.writeText;window.__inkstoneQaWrites=[];navigator.clipboard.writeText=async text=>{window.__inkstoneQaWrites.push(text)};});
      try{
        await page.locator('.inkstone-selection-toolbar').getByRole('button',{name:'复制',exact:true}).click();
        await page.waitForFunction(()=>window.__inkstoneQaWrites.length===1);
        assert.deepEqual(await page.evaluate(()=>window.__inkstoneQaWrites),['当前选择']);assert.equal(await data(),original);
        await page.waitForTimeout(350);assert.equal(await page.locator('.inkstone-selection-toolbar').count(),0);
        await selectEditorText('正文保持原样');await page.keyboard.press('Escape');await page.waitForTimeout(350);assert.equal(await page.locator('.inkstone-selection-toolbar').count(),0);assert.equal(await data(),original);
        await fixture('甲 &amp; 乙，复制阅读视图中的可见文字。\n','preview');
        await page.evaluate(()=>{const node=app.workspace.getLeaf(false).view.contentEl.querySelector('.markdown-preview-view p').firstChild;const range=document.createRange();range.setStart(node,0);range.setEnd(node,5);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);});
        await page.locator('.inkstone-selection-toolbar').getByRole('button',{name:'复制',exact:true}).click();await page.waitForFunction(()=>window.__inkstoneQaWrites.length===2);assert.deepEqual(await page.evaluate(()=>window.__inkstoneQaWrites),['当前选择','甲 & 乙']);
      }finally{await page.evaluate(()=>{navigator.clipboard.writeText=window.__inkstoneQaOriginalWrite;delete window.__inkstoneQaOriginalWrite;delete window.__inkstoneQaWrites;});}
    });
    await run('toolbar-narrow-and-top-edge',async()=>{
      await page.evaluate(()=>{app.workspace.leftSplit.collapse();app.workspace.rightSplit.collapse();});await page.setViewportSize({width:390,height:844});
      try{
        await fixture('顶边也应留出空间，避免工具条遮住选中的原文。\n','preview');
        await page.locator('[data-inkstone-qa] .markdown-preview-view p').waitFor();
        await page.evaluate(()=>{
          const view=app.workspace.getLeaf(false).view,paragraph=view.contentEl.querySelector('.markdown-preview-view p'),node=paragraph.firstChild;
          const range=document.createRange();range.setStart(node,0);range.setEnd(node,8);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
          // Move the real rendered text to the viewport edge within this QA fixture.
          const rendered=view.contentEl.querySelector('.markdown-preview-view');rendered.style.transform=`translateY(${10-range.getBoundingClientRect().top}px)`;
          const plugin=app.plugins.plugins['inkstone-annotations'];plugin.hideToolbars();plugin.showToolbar(document);
        });
        const toolbar=page.locator('.inkstone-selection-toolbar');await toolbar.waitFor();
        const read=()=>page.evaluate(()=>({toolbar:document.querySelector('.inkstone-selection-toolbar').getBoundingClientRect().toJSON(),selection:window.getSelection().getRangeAt(0).getBoundingClientRect().toJSON()}));
        const first=await read();assert(first.selection.top>=0&&first.selection.top<20);assert(first.toolbar.top>=first.selection.bottom+5);assert(first.toolbar.left>=0&&first.toolbar.right<=390);
        await toolbar.getByRole('button',{name:'划线样式',exact:true}).click();
        const expanded=await read();assert(expanded.toolbar.left>=0&&expanded.toolbar.right<=390);assert(expanded.toolbar.top>=expanded.selection.bottom+5);
        const layout=await toolbar.evaluate(node=>({width:node.clientWidth,scroll:node.scrollWidth}));assert(layout.scroll<=layout.width+1);
      }finally{
        await page.evaluate(()=>{app.workspace.getLeaf(false).view.contentEl.querySelector('.markdown-preview-view')?.style.removeProperty('transform');app.plugins.plugins['inkstone-annotations'].hideToolbars();});
        await page.setViewportSize({width:1440,height:1000});
      }
    });
    await run('toolbar-keyboard-focus-stays',async()=>{
      await fixture('键盘也能选样式并标注。\n');await selectEditorText('选样式');
      await page.evaluate(()=>{const toolbar=document.querySelector('.inkstone-selection-toolbar');window.__inkstoneQaToolbar=toolbar;toolbar.querySelector('[aria-label="划线样式"]').focus();document.dispatchEvent(new Event('selectionchange'));app.plugins.plugins['inkstone-annotations'].scheduleToolbar(document);});
      // Exercise the 120 ms selection debounce while keyboard focus remains in the toolbar.
      await page.waitForTimeout(180);
      assert.equal(await page.evaluate(()=>document.querySelector('.inkstone-selection-toolbar')===window.__inkstoneQaToolbar&&document.activeElement?.getAttribute('aria-label')==='划线样式'),true);
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'黄色');
      await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'绿色');
      await page.keyboard.press('Enter');
      await page.waitForFunction(()=>app.workspace.getLeaf(false).view.getViewData().includes('inkstone-green">选样式</mark>'));
      await page.evaluate(()=>{delete window.__inkstoneQaToolbar;});
    });
    await run('toolbar-more-and-stale-selection',async()=>{
      await fixture('<u class="inkstone-underline">已有划线</u>，其他正文。\n');await selectEditorText('已有划线');
      await page.locator('.inkstone-selection-toolbar').getByRole('button',{name:'更多',exact:true}).click();
      await page.locator('.menu-item').filter({has:page.locator('.menu-item-title',{hasText:'打开标注侧栏'})}).click();
      await page.locator('.inkstone-annotation-sidebar').waitFor();assert((await page.locator('.inkstone-annotation-sidebar').textContent()).includes('已有划线'));
      await page.evaluate(()=>{const leaf=app.workspace.getLeavesOfType('markdown').find(leaf=>leaf.view.file===app.workspace.getActiveFile())||app.workspace.getLeavesOfType('markdown')[0];app.workspace.setActiveLeaf(leaf,{focus:true});});
      await selectEditorText('已有划线');await page.locator('.inkstone-selection-toolbar').getByRole('button',{name:'更多',exact:true}).click();
      await page.locator('.menu-item').filter({has:page.locator('.menu-item-title',{hasText:'移除标注'})}).click();
      await page.waitForFunction(()=>!app.workspace.getLeaf(false).view.getViewData().includes('inkstone-underline'));
      assert.equal(await data(),'已有划线，其他正文。\n');
      const original='快照变化后，旧工具条必须拒绝写入。\n';await fixture(original);await selectEditorText('旧工具条');
      const updated=original+'外部修改。\n';
      await page.evaluate(updated=>{const button=document.querySelector('.inkstone-selection-toolbar [aria-label="划线"]');app.workspace.getLeaf(false).view.editor.setValue(updated);button.click();},updated);
      await page.waitForFunction(()=>document.querySelector('.notice')?.textContent.includes('笔记')||!document.querySelector('.inkstone-selection-toolbar'));
      assert.equal(await data(),updated);
      const same='相同内容也应可以重新标注。\n';
      await fixture(same);await selectEditorText('重新标注');await page.keyboard.press('Escape');await page.waitForTimeout(350);assert.equal(await page.locator('.inkstone-selection-toolbar').count(),0);
      await fixture(same);await selectEditorText('重新标注');assert.equal(await page.locator('.inkstone-selection-toolbar').count(),1);
      await page.keyboard.press('Escape');
      await page.evaluate(async()=>{const leaf=app.workspace.getLeaf(false),state=leaf.getViewState();await leaf.setViewState({...state,state:{...state.state,mode:'preview'}});});
      await page.locator('[data-inkstone-qa] .markdown-preview-view p').waitFor();
      await page.evaluate(()=>{const node=app.workspace.getLeaf(false).view.contentEl.querySelector('.markdown-preview-view p').firstChild,from=node.textContent.indexOf('重新标注'),range=document.createRange();range.setStart(node,from);range.setEnd(node,from+4);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);});
      await page.locator('.inkstone-selection-toolbar').waitFor();await page.keyboard.press('Escape');
      await page.evaluate(async()=>{const leaf=app.workspace.getLeaf(false),state=leaf.getViewState();await leaf.setViewState({...state,state:{...state.state,mode:'source',source:false}});});
      await selectEditorText('重新标注');assert.equal(await page.locator('.inkstone-selection-toolbar').count(),1);assert.equal(await data(),same);
    });
    if(results.some(result=>!result.passed))process.exitCode=1;
    console.log(JSON.stringify({app:await page.title(),results},null,2));
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
