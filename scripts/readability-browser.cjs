/* eslint-disable @typescript-eslint/no-require-imports -- UI acceptance in an isolated synthetic-data browser. */
const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
require.extensions['.tsx']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},fileName:filename}).outputText,filename);
const {default:StatusBadge,statusTone}=require('../src/components/status-badge.tsx');
const {renderToStaticMarkup}=require('react-dom/server');const {createElement}=require('react');
function luminance(rgb){return rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);}
function contrast(a,b){const rgb=s=>s.match(/[\d.]+/g).slice(0,3).map(Number);const x=luminance(rgb(a)),y=luminance(rgb(b));return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext();const page=await context.newPage();const errors=[],checks=[],metrics=[],ratios=[];
  page.on('pageerror',e=>errors.push(e.message));let requests=0;
  await context.route('**/api/**',r=>{requests++;return r.abort();});
  const base=process.env.READABILITY_TEST_URL || 'http://localhost:3112';fs.mkdirSync('.local/readability',{recursive:true});
  const goto=async(path)=>{await page.goto(base+path);await page.locator('.data-controls').getByText('共享演示数据 · 自动保存到此浏览器',{exact:true}).waitFor();};
  const shot=async(name)=>{await page.waitForTimeout(350);await page.screenshot({path:`.local/readability/${name}.png`});};
  async function inspect(selector,min,label){const style=await page.locator(selector).first().evaluate(el=>{const s=getComputedStyle(el);let p=el,bg=s.backgroundColor;while(/rgba\([^)]*, 0\)/.test(bg)&&p.parentElement){p=p.parentElement;bg=getComputedStyle(p).backgroundColor;}return {font:parseFloat(s.fontSize),weight:s.fontWeight,color:s.color,bg};});assert.ok(style.font>=min,`${label}: ${style.font}px < ${min}`);const ratio=contrast(style.color,style.bg);assert.ok(ratio>=4.5,`${label} contrast ${ratio}`);metrics.push({label,...style,contrast:Number(ratio.toFixed(2))});}
  for(const width of [1440,1280]){
   await page.setViewportSize({width,height:1000});
   for(const [name,path] of [['dashboard','/'],['jobs','/jobs'],['candidates','/candidates'],['pipeline','/pipeline']]){
    await goto(path);await page.locator('h1').waitFor();
    assert.equal(await page.locator('h1').evaluate(el=>getComputedStyle(el).fontSize),'24px');
    if(name==='dashboard'){
     await page.locator('.recharts-surface').first().waitFor();await inspect('.funnel-label',13,`${width} funnel`);await inspect('.activity p',14,`${width} activity`);await inspect('.activity div > span',12,`${width} activity time`);
     for(const color of await page.locator('.funnel-track strong').evaluateAll(rows=>rows.map(el=>getComputedStyle(el).color)))assert.equal(color,'rgb(29, 29, 31)');
     await page.locator('.trend-chart svg text').first().waitFor();const axes=await page.locator('.trend-chart svg text').evaluateAll(rows=>rows.map(el=>parseFloat(getComputedStyle(el).fontSize)));assert.ok(axes.length && axes.every(v=>v>=12),`Axis fonts: ${axes.join(',')}`);
    }else if(name==='pipeline'){
     await inspect('.kanban-heading h2',14,`${width} Kanban heading`);await inspect('.kanban-card .person strong',15,`${width} Kanban name`);await inspect('.kanban-job',13,`${width} Kanban job`);await inspect('.kanban-meta',13,`${width} Kanban metadata`);
     const dimensions=await page.locator('.kanban').evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth,card:el.querySelector('.kanban-column').getBoundingClientRect().width}));assert.ok(dimensions.scroll>dimensions.client);assert.ok(dimensions.card>=264);
     const cardColors=await page.locator('.kanban-card .status-badge').evaluateAll(rows=>rows.map(el=>({tone:el.dataset.statusTone,color:getComputedStyle(el).color})));
     for(const badge of cardColors)assert.equal(badge.color,badge.tone==='progress'?'rgb(21, 87, 166)':badge.tone==='success'?'rgb(33, 103, 68)':badge.tone==='failure'?'rgb(161, 48, 53)':'rgb(128, 83, 11)');
    }else{await inspect('.ant-table-tbody td',14,`${width} ${name} table`);await inspect(name==='jobs'?'.table-name':'.person strong',15,`${width} ${name} primary`);}
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false,`${width} ${name} page overflow`);
    await shot(`${name}-${width}`);
    if(name==='candidates'){
     await page.locator('.person-button').first().click();await page.getByRole('dialog',{name:'候选人详情'}).waitFor();await inspect('.detail-person .person strong',15,`${width} candidate detail`);await shot(`detail-${width}`);await page.locator('.ant-drawer-close').click();await page.getByRole('dialog').waitFor({state:'hidden'});
    }
    if(name==='pipeline'){
     await page.locator('.kanban-card').first().click();await page.getByRole('dialog',{name:'候选人详情'}).waitFor();assert.equal(await page.locator('.kanban-card').first().getAttribute('aria-pressed'),'true');await page.locator('.ant-drawer-close').click();await page.getByRole('dialog').waitFor({state:'hidden'});
     await page.getByText('列表',{exact:true}).click();await page.locator('.ant-table').waitFor();await inspect('.ant-table-tbody td',14,`${width} pipeline list`);assert.ok(await page.locator('[data-status-tone="stage"]').count());await shot(`pipeline-list-${width}`);
    }
   }
   checks.push(`${width}px 看板、岗位、候选人、Kanban、列表、详情六个视图通过，无页面横向溢出`);
  }
  const expected={'招聘中':'progress','已安排':'progress','待处理':'pending','待安排':'pending','已通过':'success','未通过':'failure','已淘汰':'failure','已结束':'neutral','待确认':'confirmation','Offer':'stage'};
  for(const [value,tone]of Object.entries(expected))assert.equal(statusTone(value),tone);
  const html=Object.keys(expected).map(value=>renderToStaticMarkup(createElement(StatusBadge,{value}))).join('');
  await page.evaluate(html=>{const el=document.createElement('section');el.id='badge-probe';el.innerHTML=html;document.body.append(el);},html);
  for(const badge of await page.locator('#badge-probe .status-badge').all()){
   const s=await badge.evaluate(el=>({label:el.textContent,tone:el.dataset.statusTone,font:parseFloat(getComputedStyle(el).fontSize),color:getComputedStyle(el).color,bg:getComputedStyle(el).backgroundColor}));const ratio=contrast(s.color,s.bg);assert.ok(ratio>=4.5,`${s.label} contrast ${ratio}`);assert.ok(s.font>=12);ratios.push({...s,contrast:Number(ratio.toFixed(2))});
  }
  await page.locator('#badge-probe').evaluate(el=>el.remove());checks.push('精确状态映射及各状态文字对比度 ≥ 4.5:1');assert.deepEqual(errors,[]);assert.equal(requests,0);
  const report={checks,metrics,ratios,errors,apiRequests:requests};fs.writeFileSync('.local/readability/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
