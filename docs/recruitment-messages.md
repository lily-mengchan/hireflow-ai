# 面试反馈录入

## 使用方式

AI 招聘助手页面的“面试反馈录入”提供两种方式，原岗位 JD RAG 问答保留。

- **AI 快捷录入**：输入简短反馈或安排，点击“识别并填写”，核对候选人和岗位申请，修改识别字段，确认保存。
- **手动录入**：先选择候选人和岗位申请，再填写阶段、结果、下一阶段、面试时间、面试官和备注。全程不请求提取 API、不调用 LLM。

两种方式都在保存前展示“当前状态 → 建议状态”，都需要勾选核对确认。AI 结果缺失或被修改时，要求填写核对说明。底部“最近面试记录”展示最近五条反馈/安排和录入方式。候选人详情保留轮次、结果、面试官、原文依据和状态时间线。

输入区域为短反馈表单，不再提供群聊模拟、示例填充按钮或默认展开的消息时间框。原文依据折叠展示。历史记录中的用户原文不作清洗或改写。

## 时间

AI 请求未携带 messageAt 时，现有 `/api/recruitment/parse` 在接收请求时记录服务端当前时间，默认 `Asia/Shanghai`，并将实际使用的 input 返回前端。浏览器不再为默认 AI 请求猜测时间。

只有补录历史反馈时，展开“高级选项”填写事件发生时间，转换为带时区 ISO 时间提交。手动录入不请求服务器，其本地记录时间为表单开始时刻或明确填写的历史时刻；保存审计时间继续由既有本地 Repository 记录。

服务器从 timeEvidence 重新计算时间，不要求模型生成 ISO 日期。支持明天、下周一、完整日期、明确时区 ISO，以及“下午两点”等日内时间。仅有日内时段时暂按参考日期解释，并提示确认；如果安排已经过期，业务规则会阻止保存，不擅自顺延到明天。“明天下午”“周一两点”等信息不足的内容仍要求人工补齐。

新增回归覆盖“下周一14:00”的紧邻写法和“明天9:00”，避免把星期和小时错误合并。

## 成本控制与真实模型

- 继续使用 `src/rag/model.ts` 的真实 Chat Completions 调用，不改成规则模拟提取。
- 缩短独立系统 Prompt。模型仅输出 candidateId、candidateName、jobTitle、completedStage、interviewResult、nextStage、timeEvidence、interviewer、remarks、evidence；eventType 与标准化 interviewTime 由 TypeScript 推导。
- 保留现有完整事件 Zod 类型兼容旧数据，新增紧凑模型输出 Schema；身份、证据、结果冲突和阶段依据校验继续执行。
- 不传完整岗位 JD、候选人档案或招聘历史；模型只接收当前反馈、时间/时区和必要阶段名称。
- 单次 AI 输入限制 800 字。前端拦截空输入、明显无关内容和过长粘贴；服务端也校验长度，不截断后静默送模型。
- 服务端缓存按“模型服务地址、模型名称、Prompt、完整反馈及时间上下文”寻址，最多 100 份、5 分钟；合并同键并发，不缓存失败，不返回可被用户编辑污染的缓存引用。
- 前端最多缓存 20 份结果。默认时间最多复用到服务端本次分钟边界，扣除请求耗时，避免跨分钟/午夜沿用旧时间；显式历史时间可复用 5 分钟。取消或再次填写相同内容可直接复用已识别结果。
- 缓存是临时优化，不承诺跨刷新、跨 Vercel 冷实例持久；冷启动后相同内容仍可能产生费用。保存去重独立于解析缓存，缓存丢失也不会重复更新同一事件。

## 共用保存、匹配与历史

`feedback-editor.tsx` 是两种录入方式共用的可编辑表单。AI 模式使用识别原文；手动模式通过 `manualFeedbackSource()` 生成标注为手动的表单回执，再调用同一个 `recruitmentActions.confirmMessage()` / `RecruitmentRepository.confirmMessage()`。

保留原有规则：

1. 候选人 ID 优先校验；没有 ID 时按姓名、岗位查找已有申请；同名或多申请必须人工选择，未匹配不创建候选人。
2. 所有修改按 applicationId 定位，候选人与岗位申请分离。
3. 已完成阶段必须等于当前阶段；只允许相邻推进，不允许回退、跳级、淘汰或 Offer 后随意更新。
4. 未通过则淘汰，待定不能推进；安排下一轮需要明确未来时间和面试官。
5. 确认时重读当前数据并检查前端见到的状态；申请、面试记录、历史事件一次 setItem 整体保存，失败不发布部分更新。
6. 保存原 AI 提取和人工确认值，记录面试轮次、时间、面试官、结果、变更前后记录。

手动来源新增可选 `source.mode=manual`，AI 为 `ai`，旧数据未包含该字段时仍兼容。候选人详情不会把手动表单回执伪装为 AI 原文。

事件去重继续使用“规范化原文 SHA-256 + applicationId”。手动表单的规范化回执包含身份、申请、阶段、结果、安排时间、面试官和备注，不包含不断变化的默认录入时间，因此重复提交同一份表单不会绕过去重。阶段或安排内容确实变化时会形成新事件。

候选人列表、招聘流程、看板仍订阅同一份 localStorage 数据；这是单浏览器演示持久化，不是多用户事务或跨设备同步。

## 改动文件

- `src/components/recruitment-message-entry.tsx`：正式双模式入口、短反馈、折叠历史时间和最近记录。
- `src/components/feedback-editor.tsx`：共用可编辑表单与状态比较。
- `src/messages/manual.ts`：手动表单回执，复用原保存方法。
- `src/messages/parse-cache.ts`：可测试的前端临时解析缓存。
- `src/messages/schema.ts`、`prompt.ts`、`extract.ts`：800 字请求 Schema、紧凑输出和缓存/并发合并。
- `src/messages/time.ts`：日内时间、紧邻日期及短小时写法。
- `src/messages/workflow.ts`：仅调整提示文案，保留原流程判断。
- `app/api/recruitment/parse/route.ts`：复用原 API，提供默认服务端时间。
- `src/types/recruitment.ts`、`src/data/repository.ts`、`src/data/store.ts`：来源标识、共用保存回执与记录标题。
- `src/components/ui.tsx`、`app/globals.css`：面试记录来源展示和紧凑后台样式。
- `tests/feedback.test.cjs`：新增短反馈、缓存、时间及手动离线保存验证。
- `tests/messages.test.cjs`：适配记录标题；原 A–H 校验继续保留。
- `package.json`、`README.md` 与本文：验证命令和说明。无新增运行依赖。

## 验证

```bash
npm run test:feedback
node --test tests/feedback.test.cjs tests/messages.test.cjs tests/recruitment.test.cjs tests/rag.test.cjs
npm run messages:verify
npm run lint
npx tsc --noEmit
npm run build
```

35 项自动化测试覆盖：短反馈匹配与建议、人工修改、时间解析、缓存命中/过期/失败重试、手动保存零 fetch 调用、重复事件、持久化重载、看板更新、旧状态冲突及既有 RAG。

真实 LLM 回归验证单人/多人提取、相对日期和不确定字段；真实 HTTP 验证不提交时间时使用服务端当前时间、短句“张三一面通过”、同时间上下文重复请求、下一轮面试日期/面试官及 801 字请求返回 400。报告分别位于 `.local/messages-verification.json` 与 `.local/feedback-verification.json`。

未做自动化浏览器点击验收；刷新持久化通过重新创建 Repository 读取同一存储快照验证。未接入企业微信、数据库或独立 Agent。模型错误明确提示，可切换手动录入，不会伪造 AI 成功结果。
