# 招聘数据查询与分析

入口为原 AI 招聘助手，不新增聊天系统。推荐问题：招聘总体情况、待业务复筛、待面试反馈、招聘转化分析。结果为模板答案、统计卡片、表格及可展开的统计口径，候选人按 applicationId 打开现有详情。

## 已核对的模型

现有 Candidate 与 Application 独立；Application 保存 recommendation，包含推荐状态与 recommendedAt。没有单独的业务复筛结果表，复筛通过依据岗位流程第 2 阶段的明确已通过状态、事件 before/after 或明确结果记录判断，不能仅根据已经进入后续阶段推断通过。

旧 InterviewRecord 只有 scheduledAt、status，部分带 result、recordedAt、sourceEventId，不保证记录了真实完成时间或明确结果。本次只增加可选 completedAt：新确认的面试反馈使用 HR 输入的事件时间；旧普通进度保存使用确认完成时的时间。旧数据不补造时间或结果。缺少时间的已完成记录仍可展示，但不能冒充超期。

## 工具及口径

| 工具 | 内容与主要口径 |
| --- | --- |
| getRecruitmentOverview | 在招岗位、候选人去重数、申请数、明确推荐后的待业务复筛申请、待安排正式面试人数、当前 Offer 且已通过的申请数 |
| getCandidatesByStage | 岗位、阶段、状态、面试状态、候选人姓名/编号筛选；同名分别展示，不同岗位申请独立 |
| getPendingBusinessReview | 推荐状态已确认、有 recommendedAt、当前仍在对应岗位第 2 阶段且待处理、没有明确通过证据；以推荐时间计时 |
| getPendingInterviewFeedback | 正式面试、状态已完成、结果未知或待定；以 completedAt → recordedAt → 对应 sourceEventId 的事件时间为计时依据，明确显示来源 |
| getInterviewStatistics | 按岗位与轮次统计已完成面试；通过率 = result 为通过的记录数 / result 为通过或未通过的记录数；待定、未知不入分母。人数按 candidateId 去重，面试记录与人数分别显示 |
| getRecruitmentConversion | 推荐、复筛通过、一面、二面、Offer 的明确记录覆盖；每一步转化率仅计算上一步 cohort 中也有本步证据的申请比例，不直接相除不同覆盖范围总数 |
| getRecruitmentBottlenecks | 每个岗位的待处理申请、业务复筛积压、面评超期和依据 updatedAt 的未推进申请；只报事实，不推测原因，并列岗位会明确说明 |

- 正式面试按岗位流程内的面试阶段识别，与业务复筛、作品集评审分开。安排已过期不证明面试已经完成，这类记录单独提示，不计入已完成面试。
- 等待时长使用未舍入的天数判断，展示保留一位小数。超过 3 天为严格大于 72 小时；至少 3 天为大于等于。
- 未确认完成时间的记录不纳入等待天数筛选或指定时间区间的统计；所有已完成记录都没有明确结果时返回「暂无足够数据」，不显示虚构的 0% 通过率。
- 一面、二面等经过阶段，只从当前明确阶段、事件前后状态或实际面试记录取证，不因为 Offer 状态就补造全部历史。
- 推荐申请可单独作为转化 cohort。没有推荐记录的旧申请不会被当成 HR 已推荐。缺少上一阶段证据或分母为零时不生成比例。
- 查询统一使用服务端当前时间及 Asia/Shanghai；最近 7/30 天为滚动区间，本周/上周按上海时区周一开始。候选人列表的时间筛选按申请创建时间；面试统计按明确完成/反馈记录时间；复筛按推荐时间。
- 对不支持的筛选或工具组合返回澄清，不执行任意 SQL、代码或写入。转换分析目前针对全部已记录历史；复杂的自定义日期先提示改用支持的时间区间。
- 结果默认最多展示 20 行，最高 50 行；计数始终基于全部匹配记录。积压分类可能重叠，不能将分类相加当作总人数。

## 看板统一

`src/analytics/facts.ts` 的 currentOverview、awaitingInterview、visitedStages 等被看板和查询共同复用。本次修正旧统计：待安排面试不再包括初筛/业务复筛；当前 Offer 仅计明确已通过的申请；看板漏斗不再按当前阶段序号推断缺失的历史阶段。漏斗显示阶段记录覆盖，单位为岗位申请。

因此旧演示数据中待面试人数、Offer 数和部分漏斗数可能降低，这是收紧记录依据后的结果。概况卡片是当前状态；转化与漏斗是可核实的历史阶段覆盖，两者在界面口径中分别说明。

## 调用链与数据边界

1. 浏览器从现有共享 Repository 状态生成 analyticsSnapshot，只包含身份 ID/姓名、岗位名与流程、申请状态、推荐时间、面试结果/时间、事件前后状态。没有简历、联系方式、沟通备注、评语、JD 或密钥。
2. `/api/recruitment/query` 通过现有有大小上限的 JSON 读取器接收快照；Zod 检查字段、枚举、唯一 ID 和关联，服务端不读取浏览器 localStorage，也不需要跨请求数据持久性。
3. `ruleIntent` 对明确的高频问题、JD 问题及只读限制先路由；岗位别名不唯一时要求指定岗位。
4. 复杂问题调用已有 `completeMeasured` 做结构化意图识别，只发送问题、岗位 ID/名称/可选阶段、当前时间与工具定义。模型不接收候选人列表；用户在问题里主动输入的姓名仍属于问题文本。
5. 模型输出经 intentSchema 白名单和参数校验；候选人参数必须来自问题原文，岗位 ID 必须存在。TypeScript 工具读取校验后的当前快照，计算并生成模板答案，不再额外调用模型撰写统计总结。
6. JD 意图继续进入原 `/api/rag/ask`，保留真实 Embedding、余弦检索及引用校验。动态招聘状态不向量化。
7. 如果查询期间相关数据变化，丢弃该次过期结果并提示重问；已经展示的旧卡片会标记数据已更新。点击候选人时按申请唯一 ID 查看最新详情。

这是单浏览器演示数据查询，不是多用户同步或真实招聘生产数据库。聊天会话仍只在当前页面内存中保存；刷新后可重新查询持久化的招聘状态。

## 成本

- 示例中的 7 个高频问题及 4 个快捷问题无需模型调用；单元测试会在模型被意外调用时失败。
- 复杂意图通常调用 1 次模型，无二次答案总结。缓存最多 20 个意图、TTL 5 分钟，键含问题、岗位/流程、模型配置与上海日期；仅缓存意图，统计数据每次重算。
- 缓存是实例内优化，不依赖其跨实例或冷启动持久性。没有新的数据库、向量库、Agent 框架或生产依赖。
- 真实验证的一次复杂意图调用返回输入 718、输出 179 Token，重复调用命中缓存为 0 次。具体 Token 随供应商、问题和岗位数量变化，详见本地报告。

## 修改文件

- 新增 `src/analytics/{schema,facts,router,tools}.ts`。
- 新增 `app/api/recruitment/query/route.ts`。
- 新增 `src/components/recruitment-query-result.tsx` 和同名 CSS。
- 修改 `src/features/{assistant,dashboard,candidates}.tsx`、`src/mocks/data.ts`，接入原聊天及共同口径。
- 修改 `src/data/{repository,selectors}.ts`、`src/types/recruitment.ts`，添加可选完成时间并复用统计函数，保持旧存储兼容。
- 新增 `tests/analytics.test.cjs`；调整旧数据测试中「复筛即待面试」的预期；新增 `scripts/analytics-{verify,browser}.cjs`、文档和 npm 命令。没有新增依赖。

## 验证

```powershell
npm run test:analytics
node --test tests/analytics.test.cjs tests/screening.test.cjs tests/feedback.test.cjs tests/messages.test.cjs tests/recruitment.test.cjs tests/rag.test.cjs
npm run analytics:verify # 真实复杂意图识别，产生模型费用
npm run build
npm run start -- --port 3103 # 另一个终端
npm run analytics:browser # 本机 Edge、隔离模拟数据，含真实 JD RAG 调用
npm run lint
npx tsc --noEmit
```

浏览器地址可用 `ANALYTICS_TEST_URL` 设置。真实验证与浏览器报告保存在已忽略的 `.local/analytics-*-verification.json`，无候选人档案或密钥。浏览器截图 `.local/analytics-assistant.png` 仅使用合成数据。
