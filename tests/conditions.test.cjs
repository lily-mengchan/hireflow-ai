/* eslint-disable @typescript-eslint/no-require-imports -- Existing node:test TypeScript bridge. */
require('../scripts/load-ts.cjs');
const {test}=require('node:test');const assert=require('node:assert/strict');
const {evaluateConditions,conditionsVersion,validatePreScreening}=require('../src/screening/conditions.ts');
const {createScreeningAnalyzer}=require('../src/screening/analyze.ts');
const {RecruitmentRepository,STORAGE_KEY}=require('../src/data/repository.ts');
const {hrNotesSchema}=require('../src/screening/schema.ts');
const {jobVersion}=require('../src/screening/rules.ts');
const {text,profile}=require('./helpers/screening.cjs');
const condition=(patch={})=>({conditionId:'days',label:'每周可实习天数',fieldKey:'internshipDays',valueType:'number',operator:'gte',expectedValue:4,required:true,enabled:true,...patch});
const check=(conditions,values)=>evaluateConditions('job',conditions,values,'2026-11-01T00:00:00.000Z');
test('three-state numeric rules, missing values, preferences, disabled and legacy configuration',()=>{
 assert.equal(check([condition()],{internshipDays:5}).decision,'PASS');
 assert.equal(check([condition()],{internshipDays:3}).decision,'FAIL');
 assert.equal(check([condition()],{}).decision,'UNKNOWN');
 assert.equal(check([condition({required:false})],{}).decision,'PASS');
 assert.equal(check([condition({enabled:false})],{}).decision,'UNCONFIGURED');
 assert.equal(check([],{}).decision,'UNCONFIGURED');
 assert.throws(()=>check([condition()],{internshipDays:'5'}),/数字/);
 assert.throws(()=>check([condition()],{internshipDays:8}),/数字/);
});
test('boolean, enum and calendar-date comparisons are deterministic and reject invalid data',()=>{
 const b=condition({conditionId:'base',fieldKey:'acceptsLocation',valueType:'boolean',expectedValue:true,operator:'eq'});
 assert.equal(check([b],{acceptsLocation:false}).decision,'FAIL');
 assert.equal(check([b],{acceptsLocation:true}).decision,'PASS');
 const d=condition({fieldKey:'availableAt',valueType:'date',expectedValue:'2026-12-01',operator:'lte'});
 assert.equal(check([d],{availableAt:'2026-12-01'}).decision,'PASS');
 assert.equal(check([d],{availableAt:'2026-12-02'}).decision,'FAIL');
 assert.throws(()=>check([d],{availableAt:'2026-02-30'}),/日期/);
 const e=condition({fieldKey:'workMode',valueType:'enum',options:['现场','远程'],expectedValue:'现场',operator:'eq'});
 assert.equal(check([e],{workMode:'远程'}).decision,'FAIL');
 assert.throws(()=>check([e],{workMode:'其他'}),/枚举/);
});
test('conflicting configuration, discriminatory fields and forged or stale results are rejected',()=>{
 assert.throws(()=>check([condition(),condition({conditionId:'max',operator:'lte',expectedValue:2})],{}),/冲突/);
 assert.throws(()=>check([condition({label:'性别要求'})],{}));
 const job={id:'job',screeningConditions:[condition()]};const review=check(job.screeningConditions,{internshipDays:5});
 validatePreScreening(job,review);
 assert.throws(()=>validatePreScreening({...job,screeningConditions:[condition({expectedValue:6})]},review),/过期/);
 const fail=check(job.screeningConditions,{internshipDays:1});
 assert.throws(()=>validatePreScreening(job,{...fail,decision:'PASS'}),/不一致/);
 assert.throws(()=>validatePreScreening(job,fail),/未通过/);
 validatePreScreening(job,{...fail,overrideReason:'业务沟通后允许进一步分析'});
 assert.notEqual(conditionsVersion(job.screeningConditions),conditionsVersion([condition({required:false})]));
});
test('server gate runs before model configuration and both AI calls; overrides preserve failure',async()=>{
 let calls=0,configs=0;
 const analyze=createScreeningAnalyzer({config:()=>{configs++;return {baseUrl:'fixture',chatModel:'fixture'};},complete:async(_,prompt,body)=>{calls++;return {value:prompt.includes('experienceYears')?profile():{findings:[{jdQuote:body.jd.slice(0,10),resumeQuote:'React',assessment:'相关'}]},usage:{promptTokens:1,completionTokens:1}};}});
 const job={id:'job',title:'实习岗位',jd:'React front end requirements',location:'上海',education:'本科',experience:'不限',workflowId:'standard',screeningConditions:[condition()]};
 const input={text,job,hrNotes:hrNotesSchema.parse({})};
 for(const pre of [undefined,check(job.screeningConditions,{}),check(job.screeningConditions,{internshipDays:1})]) await assert.rejects(()=>analyze({...input,preScreening:pre}),/条件|信息/);
 assert.equal(calls,0);assert.equal(configs,0);
 const result=await analyze({...input,preScreening:check(job.screeningConditions,{internshipDays:5})});assert.equal(calls,2);assert.equal(result.usage.modelCalls,2);
 const override={...check(job.screeningConditions,{internshipDays:1}),overrideReason:'人工确认仍有相关经验，继续分析'};
 await analyze({...input,preScreening:override});assert.equal(override.decision,'FAIL');assert.equal(calls,2); // Same resume/JD analysis is reusable after authorization.
 await assert.rejects(()=>analyze({...input,job:{...job,screeningConditions:[]},preScreening:undefined}),/先检查/);
});
test('job CRUD, atomic import, separate HR notes and per-application records survive refresh',async()=>{
 const map=new Map();let id=0;const storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
 const repo=new RecruitmentRepository(storage,()=>new Date('2026-11-01T00:00:00Z'),()=>`conditions-fixture-${++id}`);
 let job=repo.load().jobs[0];repo.saveJob({...job,screeningConditions:[condition()]},job.id);job=repo.load().jobs.find(j=>j.id===job.id);
 const review=evaluateConditions(job.id,job.screeningConditions,{internshipDays:5});
 const result={importId:'pre-import',jobId:job.id,jobVersion:jobVersion(job),resumeHash:'a'.repeat(64),resume:profile(),hrNotes:hrNotesSchema.parse({internshipDays:2,remarks:'独立沟通记录'}),analysis:{findings:[],checks:[],draft:'推荐草稿'},usage:{modelCalls:0,promptTokens:0,completionTokens:0,cached:true},content:'经 HR 核对的推荐内容',recommend:true,acknowledged:true,preScreening:review};
 const saved=repo.saveImport(result),app=saved.applications.at(-1);
 assert.equal(app.preScreening.records[0].applicationId,app.id);assert.equal(app.preScreening.records[0].source,'HR_NOTE');
 assert.equal(app.preScreening.values.internshipDays,5);assert.equal(app.recommendation.hrNotes.internshipDays,2);
 assert.equal(new RecruitmentRepository(storage).load().applications.at(-1).preScreening.records[0].checkResult,'PASS');
 repo.saveJob({...job,screeningConditions:[condition({expectedValue:6})]},job.id);
 assert.notEqual(conditionsVersion(repo.load().jobs.find(j=>j.id===job.id).screeningConditions),app.preScreening.conditionsVersion);
 assert.throws(()=>repo.saveImport({...result,importId:'stale'}),/更新/);
 repo.saveJob({...job,screeningConditions:[]},job.id);assert.equal(repo.load().jobs.find(j=>j.id===job.id).screeningConditions.length,0);
 assert.ok(JSON.parse(storage.getItem(STORAGE_KEY)).applications.at(-1).preScreening);
});
