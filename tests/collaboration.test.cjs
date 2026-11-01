/* eslint-disable @typescript-eslint/no-require-imports */
require('../scripts/load-ts.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { RecruitmentRepository, STORAGE_KEY, validateData } = require('../src/data/repository.ts');
const { identities, blankFeedback } = require('../src/data/collaboration.ts');
const { visibleData } = require('../src/data/visibility.ts');
const { profile } = require('./helpers/screening.cjs');
function fixture() {
  let raw = null, actor = identities[0], id = 0;
  const storage = { getItem: () => raw, setItem: (_, value) => { raw = value; } };
  const repo = new RecruitmentRepository(storage, () => new Date('2026-11-02T09:00:00+08:00'), () => String(++id), () => actor);
  const data = repo.load(), a = data.applications[0];
  a.status = '待处理'; a.stage = '业务复筛'; a.interview = '待安排';
  a.recommendation = { id: 'demo', resumeHash: 'a'.repeat(64), jobVersion: 'v1', resume: profile(), hrNotes: { currentBase: '', desiredLocation: '', acceptsLocation: '未确认', expectedSalary: 'private', earliestStart: '', internshipDays: null, remarks: 'private' }, analysis: { findings: [], checks: [], draft: '' }, usage: { modelCalls: 0, promptTokens: null, completionTokens: null, cached: false }, content: 'HR recommendation', status: '待业务复筛', savedAt: new Date().toISOString(), recommendedAt: new Date().toISOString() };
  validateData(data); storage.setItem(STORAGE_KEY, JSON.stringify(data));
  const assign = () => repo.collaborate(a.id, 'assignment', { type: 'assign', interviewerId: identities[1].id, sharedConclusion: 'Shared conclusion' });
  return { repo, storage, a, assign, actor: n => { actor = identities[n]; } };
}
test('demo permission boundary rejects every HR write and other interviewer task', async () => {
  const f = fixture(); f.assign(); f.actor(2);
  assert.throws(() => f.repo.collaborate(f.a.id, 'r', { type: 'review', assignmentId: 'assignment', result: '建议进入面试', comment: '' }));
  assert.throws(() => f.repo.reset());
  assert.throws(() => f.repo.saveJob({}));
  assert.throws(() => f.repo.saveImport({}));
  assert.throws(() => f.repo.updateApplication(f.a.id, {}));
  await assert.rejects(() => f.repo.confirmMessage({}));
  assert.throws(() => f.repo.collaborate(f.a.id, 'a', { type: 'advance' }));
});
test('review never advances; HR confirmation advances once and reload preserves history', () => {
  const f = fixture(); f.assign(); f.actor(1);
  const command = { type: 'review', assignmentId: 'assignment', result: '建议进入面试', comment: 'Good' };
  f.repo.collaborate(f.a.id, 'review', command); f.repo.collaborate(f.a.id, 'review', command);
  assert.equal(f.repo.load().applications[0].stage, '业务复筛');
  assert.equal(f.repo.load().applications[0].collaboration.reviews.length, 1);
  f.actor(0); f.repo.collaborate(f.a.id, 'advance', { type: 'advance' }); f.repo.collaborate(f.a.id, 'advance', { type: 'advance' });
  const restored = new RecruitmentRepository(f.storage).load().applications[0];
  assert.equal(restored.stage, '一面'); assert.equal(restored.collaboration.reviews[0].reviewerId, identities[1].id);
});
test('read boundary filters applications, HR notes, events and peer records', () => {
  const f = fixture(); f.assign();
  const mine = visibleData(f.repo.load(), identities[1]);
  assert.equal(mine.applications.length, 1); assert.equal(mine.applications[0].recommendation.content, 'HR recommendation');
  assert.equal(mine.applications[0].recommendation.hrNotes.remarks, ''); assert.equal(mine.events.length, 0);
  assert.equal(visibleData(f.repo.load(), identities[2]).applications.length, 0);
});
test('feedback drafts, immutable submissions, idempotency, revisions and application isolation', () => {
  const f = fixture(); f.assign(); f.actor(1);
  f.repo.collaborate(f.a.id, 'review', { type: 'review', assignmentId: 'assignment', result: '建议进入面试', comment: '' });
  f.actor(0); f.repo.collaborate(f.a.id, 'advance', { type: 'advance' });
  f.repo.collaborate(f.a.id, 'schedule', { type: 'schedule', interviewerId: identities[1].id, scheduledAt: '2026-11-03T09:00:00+08:00' });
  f.actor(1); const fields = { ...blankFeedback, ability: 'A', projects: 'B', communication: 'C', strengths: 'D', summary: 'E', result: '通过' };
  f.repo.collaborate(f.a.id, 'draft', { type: 'draft', interviewId: 'INT-schedule', fields });
  assert.ok(f.repo.load().applications[0].collaboration.drafts['INT-schedule:interviewer-1']);
  const submit = { type: 'submit', interviewId: 'INT-schedule', fields };
  f.repo.collaborate(f.a.id, 'submit', submit); f.repo.collaborate(f.a.id, 'submit', submit);
  assert.throws(() => f.repo.collaborate(f.a.id, 'overwrite', submit));
  assert.throws(() => f.repo.collaborate(f.repo.load().applications[1].id, 'cross-app', submit));
  f.repo.collaborate(f.a.id, 'revision', { ...submit, revisionOf: 'submit', fields: { ...fields, summary: 'Revised' } });
  const a = f.repo.load().applications[0]; assert.equal(a.collaboration.feedback.length, 2);
  assert.equal(a.collaboration.feedback[0].fields.summary, 'E'); assert.equal(a.stage, '一面'); assert.equal(a.status, '待处理');
  assert.equal(a.collaboration.feedback[1].revisionOf, 'submit'); assert.equal(Object.keys(a.collaboration.drafts).length, 0);
});
test('negative review blocks advancement and generic HR stage bypass; stale assignment rejected', () => {
  const f = fixture(); f.assign(); f.actor(1);
  assert.throws(() => f.repo.collaborate(f.a.id, 'stale', { type: 'review', assignmentId: 'old', result: '建议进入面试', comment: '' }));
  f.repo.collaborate(f.a.id, 'negative', { type: 'review', assignmentId: 'assignment', result: '不建议进入', comment: 'Reason' });
  f.actor(0); assert.throws(() => f.repo.collaborate(f.a.id, 'advance', { type: 'advance' }));
  assert.throws(() => f.repo.updateApplication(f.a.id, { stage: '一面', status: '待处理', interview: '待安排', note: 'Bypass' }));
  const current = f.repo.load().applications[0]; f.repo.updateApplication(f.a.id, { stage: current.stage, status: '已淘汰', interview: '待安排', note: 'HR ended application' });
});

test('mock recommendations cover seeded applications, stay job-specific and persist only on HR assignment', () => {
  const { mockRecommendation } = require('../src/mocks/recommendations.ts');
  const { recommendationSchema } = require('../src/screening/schema.ts');
  const map = new Map();
  const storage = { getItem: k => map.get(k) ?? null, setItem: (k,v) => map.set(k,v) };
  const repo = new RecruitmentRepository(storage);
  const data = repo.load(), before = storage.getItem(STORAGE_KEY);
  data.applications.forEach(a => { const r = mockRecommendation(data, a); assert.ok(r); recommendationSchema.parse(r); assert.ok(r.content.includes(data.jobs.find(j => j.id === a.jobId).title)); assert.equal(r.usage.modelCalls, 0); });
  assert.equal(storage.getItem(STORAGE_KEY), before);
  assert.notEqual(mockRecommendation(data, data.applications[0]).content, mockRecommendation(data, data.applications.find(a => a.id === 'APP-SECOND')).content);
  const imported = { ...data.applications[0], candidateId: 'C-real' };
  assert.equal(mockRecommendation(data, imported), undefined);
  const saved = repo.collaborate(data.applications[0].id, 'mock-assignment', { type: 'assign', interviewerId: identities[1].id, sharedConclusion: 'Mock conclusion' });
  assert.ok(saved.applications[0].recommendation.content.includes('Mock'));
  assert.equal(new RecruitmentRepository(storage).load().applications[0].recommendation.id, 'MOCK-RECOMMENDATION-APP-1');
  assert.equal(saved.applications.find(a => a.id === 'APP-SECOND').recommendation, undefined);
});
