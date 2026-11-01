/* eslint-disable @typescript-eslint/no-require-imports -- Isolated acceptance using a synthetic PDF. */
const {chromium}=require('@playwright/test');
const {pdf}=require('../tests/helpers/screening.cjs');
const assert=require('node:assert/strict');
const {mkdir,writeFile}=require('node:fs/promises');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[],checks=[];let requests=0;
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(/\/api\/(rag|recruitment)\//.test(r.url())) requests++;});
  const base=process.env.CONDITIONS_TEST_URL || 'http://localhost:3110';
  const choose=async(control,keys)=>{await control.focus();await control.press('ArrowDown');for(const key of keys) await control.press(key);await control.press('Enter');};
  await page.goto(base+'/jobs');await page.getByRole('button',{name:'新建岗位',exact:true}).click();
  const modal=page.getByRole('dialog');
  await modal.getByLabel('岗位名称',{exact:true}).fill('动态预筛验收岗位');await modal.getByLabel('薪资范围',{exact:true}).fill('10–15K');
  await modal.getByLabel('岗位职责与任职要求',{exact:true}).fill('岗位职责：开发 React 管理后台。任职要求：熟悉 React 和 TypeScript，能够在上海现场协作。');
  await modal.getByRole('button',{name:'添加筛选条件',exact:true}).click();
  await modal.getByRole('button',{name:'添加筛选条件',exact:true}).click();
  await choose(modal.getByLabel('业务字段 2',{exact:true}),['ArrowDown']);
  await choose(modal.getByLabel('比较方式 2',{exact:true}),['ArrowDown','ArrowDown']);
  await modal.getByRole('spinbutton',{name:'每周可实习天数',exact:true}).fill('4');
  await modal.getByRole('button',{name:'添加筛选条件',exact:true}).click();
  await modal.getByRole('button',{name:'删除条件 3',exact:true}).click();assert.equal(await modal.locator('.job-condition').count(),2);
  await modal.getByRole('button',{name:'保存岗位',exact:true}).click();await modal.waitFor({state:'hidden'});checks.push('岗位条件添加、编辑、删除与保存');
  await page.goto(base+'/candidates');await page.getByRole('button',{name:'导入候选人',exact:true}).click();
  const drawer=page.getByRole('dialog',{name:'导入候选人'});
  await drawer.locator('input[type=file]').setInputFiles({name:'synthetic-conditions.pdf',mimeType:'application/pdf',buffer:pdf()});
  await drawer.getByText(/已提取 \d+ 字/).waitFor({timeout:30000});
  await drawer.getByRole('combobox').first().focus();await drawer.getByRole('combobox').first().press('ArrowDown');await drawer.getByRole('combobox').first().press('Enter');
  await choose(drawer.getByRole('combobox').first(),['ArrowDown']);
  await drawer.locator('.pre-screening').getByText('未配置筛选条件',{exact:true}).waitFor();
  assert.equal(await drawer.locator('.pre-screening .condition-field').count(),0);
  await choose(drawer.getByRole('combobox').first(),['ArrowUp']);
  await drawer.locator('.pre-screening .condition-field').first().waitFor();checks.push('切换岗位动态生成不同表单，旧岗位明确未配置');
  const pre=drawer.locator('.pre-screening');const ai=drawer.getByRole('button',{name:'生成推荐评语',exact:true});
  assert.equal(await ai.isEnabled(),false);
  await pre.getByRole('button',{name:'检查基础条件',exact:true}).click();await pre.getByText('UNKNOWN',{exact:true}).first().waitFor();assert.equal(await ai.isEnabled(),false);
  await choose(pre.getByLabel('接受岗位工作地点',{exact:true}),['ArrowDown']);await pre.getByRole('spinbutton',{name:'每周可实习天数',exact:true}).fill('5');
  await pre.getByRole('button',{name:'检查基础条件',exact:true}).click();await pre.getByText('FAIL',{exact:true}).first().waitFor();assert.equal(await ai.isEnabled(),false);assert.equal(requests,0);checks.push('PDF 本地提取、UNKNOWN 与 FAIL 阻断，所有 AI/RAG 请求数为零');
  await pre.getByRole('textbox',{name:'人工继续原因'}).fill('HR 核对后允许继续分析');await pre.getByRole('button',{name:'人工确认继续分析',exact:true}).click();await page.getByRole('button',{name:'确认继续',exact:true}).click();await pre.getByText('已人工确认继续',{exact:true}).waitFor();assert.equal(await ai.isEnabled(),true);checks.push('人工确认需要原因，保留 FAIL');
  await choose(pre.getByLabel('接受岗位工作地点',{exact:true}),['ArrowUp']);await pre.getByText('PASS',{exact:true}).first().waitFor();assert.equal(await ai.isEnabled(),true);assert.equal(requests,0);checks.push('修改实际值自动重算，清除人工放行');
  await mkdir('.local/conditions',{recursive:true});await page.waitForTimeout(350);await page.screenshot({path:'.local/conditions/passed.png',fullPage:true});
  if(process.env.CONDITIONS_LIVE==='1') {
   const responsePromise=page.waitForResponse(r=>r.url().endsWith('/api/recruitment/screen'),{timeout:180000});await ai.click();const response=await responsePromise,result=await response.json();assert.equal(response.status(),200,result.error);assert.ok(result.usage.modelCalls>0);checks.push('通过后真实 LLM 简历解析、匹配与评语链路');
   await drawer.getByRole('button',{name:'编辑推荐评语',exact:true}).click();await drawer.getByRole('checkbox',{name:'已核对候选人身份、事实、来源冲突及推荐内容'}).check();await drawer.getByRole('button',{name:'确认推荐并保存',exact:true}).click();await drawer.getByRole('heading',{name:'候选人记录已保存'}).waitFor();
   const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('hireflow-ai:recruitment:v1')));const saved=await read(),app=saved.applications.at(-1);assert.equal(app.preScreening.records.length,2);assert.equal(app.preScreening.decision,'PASS');assert.equal(app.stage,'业务复筛');await page.reload();assert.equal((await read()).applications.at(-1).preScreening.records.length,2);checks.push('推荐保存、申请关联与刷新核验恢复');
  }
  assert.deepEqual(errors,[]);const report={checks,errors,requests,live:process.env.CONDITIONS_LIVE==='1'};await writeFile(`.local/conditions/browser${report.live ? '-live' : ''}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 } finally {await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
