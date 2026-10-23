/* Connect only to the isolated QA vault; never launches Obsidian. */
'use strict';
const assert = require('node:assert/strict');
const {chromium} = require(process.env.INKSTONE_PLAYWRIGHT || 'playwright');
const selectedCase = process.argv[2] || 'all';
const results = [];
(async () => {
  const browser = await chromium.connectOverCDP(process.env.INKSTONE_CDP || 'http://127.0.0.1:19227');
  let page, saved;
  try {
    page = browser.contexts()[0].pages().find(page => page.url().startsWith('app://obsidian.md'));
    assert(page, 'Native Obsidian page missing');
    await page.waitForFunction(() => window.app?.workspace?.layoutReady);
    assert.equal(await page.evaluate(() => app.vault.getName()), 'Inkstone Upgrade Preview', 'Refuse to edit a non-QA vault');
    saved = await page.evaluate(() => ({paths:app.vault.getFiles().map(file=>file.path),settings:structuredClone(app.plugins.plugins['inkstone-annotations'].settings),layout:app.workspace.getLayout()}));
    page.setDefaultTimeout(6000);
    await page.setViewportSize({width:1440,height:1000});
    const run = async (name, work) => {
      if (selectedCase !== 'all' && name !== selectedCase) return;
      try { const details = await work(); results.push({name,passed:true,...(details?{details}:{})}); console.log('PASS',name); }
      catch(error) { results.push({name,passed:false,error:error.message}); console.error('FAIL',name,error.stack); }
    };
    let sequence=0;
    const folder=`QA/workflow-${Date.now().toString(36)}`;
    const fixture = async (text,mode='source') => {
      const path=`${folder}/${++sequence}.md`;
      await page.evaluate(async({path,text,mode,folder})=>{
        const plugin=app.plugins.plugins['inkstone-annotations'];
        plugin.hideToolbars(); for(const modal of [...plugin.modals])modal.close();
        if(!app.vault.getAbstractFileByPath('QA'))await app.vault.createFolder('QA');
        if(!app.vault.getAbstractFileByPath(folder))await app.vault.createFolder(folder);
        const file=await app.vault.create(path,text),leaf=app.workspace.getLeaf(false);
        await leaf.openFile(file,{state:{mode,source:false}});app.workspace.setActiveLeaf(leaf,{focus:true});
      },{path,text,mode,folder});
      await page.waitForFunction(({path,text,mode})=>{const view=app.plugins.plugins['inkstone-annotations'].currentView();return view.file?.path===path&&view.getViewData()===text&&view.getMode()===mode;},{path,text,mode});
      return path;
    };
    const command=id=>page.evaluate(id=>app.commands.commands[`inkstone-annotations:${id}`].callback(),id);
    const sidebar=()=>page.locator('.inkstone-annotation-sidebar');
    const text='<mark class="inkstone-highlight inkstone-yellow">Alpha 观点</mark>[^inkstone-1]\n\n<u class="inkstone-underline">Beta 观点</u>\n\n<mark class="inkstone-highlight inkstone-blue">Gamma 观点</mark>[^inkstone-2]\n\n[^inkstone-1]: Important 想法\n[^inkstone-2]: 次要想法';
    await run('sidebar-search-thoughts',async()=>{
      const source=await fixture(text);await command('show-annotations');
      const bar=sidebar();await bar.locator('article').nth(2).waitFor();
      const search=bar.getByRole('searchbox');await search.fill(' IMPORTANT ');
      await page.waitForFunction(()=>document.querySelectorAll('.inkstone-annotation-sidebar article').length===1);
      assert.match(await bar.locator('article').innerText(),/Alpha/);
      await bar.getByRole('checkbox',{name:'仅有想法'}).check();
      await bar.locator('select').selectOption('blue');
      assert.equal(await bar.locator('article').count(),0);
      await bar.getByRole('button',{name:'清空筛选'}).click();
      assert.equal(await bar.locator('article').count(),3);
      await search.fill('Alpha');await bar.getByRole('button',{name:'导出全部',exact:true}).click();
      await page.waitForFunction(expected=>{
        const view=app.plugins.plugins['inkstone-annotations'].currentView();
        return view.file?.path===expected&&view.getViewData().startsWith('# ');
      },source.replace(/\.md$/,'-墨读摘录.md'));
      const exported=await page.evaluate(()=>app.plugins.plugins['inkstone-annotations'].currentView().getViewData());
      for(const word of ['Alpha','Beta','Gamma'])assert(exported.includes(word));
      assert.match(exported,/快照生成时间：\d{4}-/);
      await fixture(text);assert.equal(await sidebar().getByRole('searchbox').inputValue(),'');
    });
    await run('annotation-navigation',async()=>{
      await fixture('前文\n\n<u class="inkstone-underline">第一条</u>\n\n中间\n\n<u class="inkstone-underline">第二条</u>');
      await page.evaluate(()=>app.plugins.plugins['inkstone-annotations'].currentView().editor.setCursor({line:0,ch:0}));
      await command('next-annotation');
      assert.equal(await page.evaluate(()=>app.plugins.plugins['inkstone-annotations'].currentView().editor.getCursor().line),2);
      await command('next-annotation');
      assert.equal(await page.evaluate(()=>app.plugins.plugins['inkstone-annotations'].currentView().editor.getCursor().line),6);
      await command('previous-annotation');
      assert.equal(await page.evaluate(()=>app.plugins.plugins['inkstone-annotations'].currentView().editor.getCursor().line),2);
      await fixture('前文\n\n<u class="inkstone-underline">第一条</u>\n\n<u class="inkstone-underline">第二条</u>','preview');
      await command('next-annotation');await command('next-annotation');
      assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'第二条');
      await command('previous-annotation');assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'第一条');
    });
    await run('session-draft-recovery',async()=>{
      const original='这是待写想法的原文。';const source=await fixture(original);
      await page.evaluate(()=>{const plugin=app.plugins.plugins['inkstone-annotations'],view=plugin.currentView();view.editor.setSelection({line:0,ch:0},{line:0,ch:7});plugin.writeThought();});
      const menu=page.locator('.inkstone-annotation-menu');await menu.getByRole('textbox').fill('切换后仍应找回的草稿');
      await fixture('另一篇笔记');
      await command('restore-thought-draft');
      await page.getByRole('heading',{name:'会话想法草稿',exact:true}).waitFor();
      assert.equal(await page.locator('.modal textarea').inputValue(),'切换后仍应找回的草稿');
      assert.equal(await page.evaluate(async source=>app.vault.read(app.vault.getAbstractFileByPath(source)),source),original);
      assert.equal(await page.evaluate(source=>{const draft=app.plugins.plugins['inkstone-annotations'].sessionDrafts.get(source);return 'from' in draft||'snapshot' in draft;},source),false);
      await page.evaluate(()=>{window.__inkstoneWorkflowClipboard=navigator.clipboard.writeText;window.__inkstoneWorkflowCopied='';navigator.clipboard.writeText=async text=>{window.__inkstoneWorkflowCopied=text;};});
      try {
        await page.getByRole('button',{name:'复制草稿',exact:true}).click();
        assert.equal(await page.evaluate(()=>window.__inkstoneWorkflowCopied),'切换后仍应找回的草稿');
      } finally { await page.evaluate(()=>{navigator.clipboard.writeText=window.__inkstoneWorkflowClipboard;delete window.__inkstoneWorkflowClipboard;delete window.__inkstoneWorkflowCopied;}); }
      await page.getByRole('button',{name:'丢弃草稿',exact:true}).click();
      assert.equal(await page.evaluate(source=>app.plugins.plugins['inkstone-annotations'].sessionDrafts.has(source),source),false);
      await page.keyboard.press('Escape');
      await fixture(original);
      await page.evaluate(()=>{const plugin=app.plugins.plugins['inkstone-annotations'],view=plugin.currentView();view.editor.setSelection({line:0,ch:0},{line:0,ch:7});plugin.writeThought();});
      await menu.getByRole('textbox').fill('明确放弃');await page.keyboard.press('Escape');
      await page.evaluate(()=>app.plugins.plugins['inkstone-annotations'].hideToolbars());
      assert.equal(await page.evaluate(()=>[...app.plugins.plugins['inkstone-annotations'].sessionDrafts.values()].some(draft=>draft.note==='明确放弃')),false);
    });
    await run('excerpts-heading-and-collection',async()=>{
      const first=await fixture('# 第一章\n\n## 小节\n\n<u class="inkstone-underline">章节观点</u>');
      await page.waitForFunction(path=>app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(path))?.headings?.length===2,first);
      await command('export-annotations');
      const exportText=await page.evaluate(()=>app.plugins.plugins['inkstone-annotations'].currentView().getViewData());
      assert.match(exportText,/第一章.*小节/);assert.match(exportText,/#小节/);assert.match(exportText,/快照生成时间/);
      const second=await fixture('<mark class="inkstone-highlight inkstone-blue">汇总观点</mark>');
      await page.evaluate(async({first,second})=>{const plugin=app.plugins.plugins['inkstone-annotations'];await plugin.exportSelectedAnnotations([app.vault.getAbstractFileByPath(first),app.vault.getAbstractFileByPath(second),app.vault.getAbstractFileByPath(first)]);},{first,second});
      const collection=await page.evaluate(()=>app.plugins.plugins['inkstone-annotations'].currentView().getViewData());
      assert.equal((collection.match(/> 章节观点/g)||[]).length,1);assert.match(collection,/汇总观点/);
      await command('collect-excerpts');
      await page.locator('.prompt-input').waitFor();await page.keyboard.press('Escape');
    });
    await run('english-interface-and-aliases',async()=>{
      await fixture(text);await command('show-annotations');
      await page.evaluate(()=>{const plugin=app.plugins.plugins['inkstone-annotations'];plugin.settings.language='en';plugin.settings.colorLabels={yellow:'Key point',blue:'取消'};app.workspace.getLeavesOfType('inkstone-annotations-list').forEach(leaf=>leaf.view.render());});
      await sidebar().getByRole('heading',{name:'Current note annotations',exact:true}).waitFor();
      await sidebar().getByRole('searchbox',{name:'Search excerpts and thoughts'}).fill('Alpha');
      assert.match(await sidebar().locator('article').innerText(),/Key point/);
      await sidebar().getByRole('button',{name:'Edit',exact:true}).click();
      await page.locator('.inkstone-annotation-menu').getByRole('button',{name:'Key point',exact:true}).waitFor();
      await page.locator('.inkstone-annotation-menu').getByRole('button',{name:'取消',exact:true}).waitFor();
      await page.locator('.inkstone-annotation-menu').getByRole('button',{name:'Edit thought',exact:true}).click();
      await page.locator('.inkstone-annotation-menu').getByRole('textbox',{name:'Thought text'}).waitFor();
      await page.keyboard.press('Escape');
      await page.evaluate(()=>{const plugin=app.plugins.plugins['inkstone-annotations'];plugin.settings.language='zh';plugin.settings.colorLabels={};});
    });
    await run('color-label-layout',async()=>{
      await fixture(text);await command('show-annotations');
      await page.evaluate(()=>{const plugin=app.plugins.plugins['inkstone-annotations'];plugin.settings.language='zh';plugin.settings.colorLabels=Object.fromEntries(['yellow','green','blue','rose'].map(color=>[color,'这是一个需要完整保留但不能挤出菜单的很长颜色含义标签'.repeat(2)]));app.workspace.getLeavesOfType('inkstone-annotations-list').forEach(leaf=>leaf.view.render());});
      await sidebar().getByRole('button',{name:'编辑',exact:true}).first().click();
      const metrics=await page.locator('.inkstone-annotation-menu .inkstone-toolbar-style').evaluateAll(buttons=>buttons.map(button=>({label:button.getAttribute('aria-label'),overflow:button.scrollWidth-button.clientWidth})));
      assert.equal(metrics.length,5);assert(metrics.every(button=>button.overflow<=2),'Color labels should fit the compact menu: '+JSON.stringify(metrics));
      assert(metrics[0].label.length>=30,'The accessible name retains the full color meaning');
      await page.keyboard.press('Escape');await page.evaluate(()=>{app.plugins.plugins['inkstone-annotations'].settings.colorLabels={};});
    });
    await run('large-excerpt-export',async()=>{
      const source=await fixture(Array.from({length:2000},(_,index)=>`# 章节${index+1}\n\n${'普通阅读正文。'.repeat(10)}\n\n<u class="inkstone-underline">观点${index+1}</u>`).join('\n\n'));
      await page.waitForFunction(path=>app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(path))?.headings?.length===2000,source);
      const metrics=await page.evaluate(async()=>{
        const plugin=app.plugins.plugins['inkstone-annotations'],start=performance.now();await plugin.exportAnnotations();
        const elapsed=performance.now()-start,output=plugin.currentView().getViewData();
        return {elapsedMs:elapsed,locations:output.split('\n').filter(line=>line.startsWith('位置：')).length,records:output.split('\n').filter(line=>/^## \d+\./.test(line)).length};
      });
      assert.equal(metrics.locations,2000);assert.equal(metrics.records,2000);assert(metrics.elapsedMs<3000,'Long-document export should not block for several seconds: '+JSON.stringify(metrics));return metrics;
    });
    await run('large-sidebar',async()=>{
      const metrics=[];
      for(const count of [500,2000]) {
        await fixture(Array.from({length:count},(_,index)=>`<u class="inkstone-underline">观点 ${index}</u>`).join('\n\n'));
        await command('show-annotations');
        const result=await page.evaluate(count=>{
          const plugin=app.plugins.plugins['inkstone-annotations'],view=app.workspace.getLeavesOfType('inkstone-annotations-list')[0].view;
          view.query='';view.renderedFilter=null;const start=performance.now();view.render();const render=performance.now()-start;
          const before=performance.now();for(let index=0;index<20;index++)view.render();const unchanged=performance.now()-before;
          const searchStart=performance.now();view.query=`观点 ${count-1}`;view.render();const search=performance.now()-searchStart;
          return {count,renderMs:render,unchanged20Ms:unchanged,searchMs:search,cards:view.listEl.children.length};
        },count);
        assert.equal(result.cards,1);assert(result.unchanged20Ms<150,'Unchanged sidebar should reuse its DOM');metrics.push(result);
      }
      return metrics;
    });
    assert(results.length>0,`Unknown case: ${selectedCase}`);
    console.log(JSON.stringify({app:await page.title(),results},null,2));
    if(results.some(result=>!result.passed))process.exitCode=1;
  } finally {
    if(page&&saved)await page.evaluate(async saved=>{
      const plugin=app.plugins.plugins['inkstone-annotations'];plugin.hideToolbars();for(const modal of [...plugin.modals])modal.close();plugin.sessionDrafts.clear();
      plugin.settings=saved.settings;await plugin.saveData(plugin.settings);
      await app.workspace.changeLayout(saved.layout);
      for(const file of app.vault.getFiles())if(!saved.paths.includes(file.path)&&file.path.startsWith('QA/'))await app.vault.delete(file);
      const collection=app.vault.getFiles().filter(file=>!saved.paths.includes(file.path)&&file.basename.startsWith('墨读摘录汇总'));for(const file of collection)await app.vault.delete(file);
    },saved);
    await browser.close();
  }
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
