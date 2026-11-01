# 岗位基础条件核验

## 流程与调用边界

岗位创建 / 编辑 → 配置启用的基础条件 → 导入 PDF 并选择岗位 → HR 填写实际情况 → 检查基础条件 → 通过或人工确认继续 → 原有 AI 简历解析、语义匹配与推荐评语 → HR 核对保存。

PDF 文本提取与基础条件检查都在浏览器本地执行，不调用 LLM、Embedding 或 RAG。没有后台预解析。AI 分析按钮在未核验时不可用；`createScreeningAnalyzer` 也在读取模型配置、缓存和任何模型调用前校验核验记录。

- 必要条件全部满足：PASS，可以主动点击生成评语。
- 任一必要条件不满足：FAIL，暂停分析。
- 必要条件缺少实际值：UNKNOWN，提示补充。
- 没有启用条件：UNCONFIGURED，显示「未配置筛选条件」，不显示已核验通过。
- 后三种情况均可填写至少 3 字原因并二次确认继续；不改变原始结果，不自动淘汰候选人。
- 普通偏好只提示，不阻断。无效值、矛盾约束不能靠人工放行绕过，必须修正。

继续 AI 后沿用既有真实模型调用和缓存：简历结构化解析通常一次、语义岗位匹配一次，推荐草稿沿用既有生成方式。同一份简历、岗位版本及沟通上下文可以复用原缓存；即使命中缓存，也必须先通过核验授权。

## 条件与保存

首版提供业务字段目录：地点接受意愿、每周实习天数、实习周期（月）、最早到岗日期、必要出差意愿、工作方式和岗位职业资质。HR 可动态增删、编辑条件；通过枚举选项配置工作方式及资质，无需 JSON。目录限制任意敏感属性字段，字段目录可在代码中扩展。

同一字段的多个限制共用候选人的实际值，支持布尔 / 枚举等于或不等于、数字及日期比较。日期使用合法的 ISO 日期进行比较，不调用模型计算。

- `Job.screeningConditions` 是兼容旧数据的可选字段。
- `Application.preScreening` 独立于 `recommendation.hrNotes` 保存；不自动从备注或简历填入实际值。
- 每行 `records` 保存 applicationId、jobId、conditionsVersion、conditionId、candidateValue、checkResult、checkedAt、source=HR_NOTE，另外保留条件快照、整体结论及人工继续原因。
- 版本使用规范化条件配置的确定性序列化内容；名称、要求、重要性、启用状态或选项变化均可识别。
- 导入中条件修改后原核验不能再授权 AI / 保存；详情仍展示历史事实并标记过期，不自动改写历史。
- 保存仍由现有 Repository 一次 localStorage 写入完成，不建立第二套候选人或岗位存储。

服务端依据浏览器传入的当前岗位快照重新计算，不假设浏览器与服务端共享 localStorage。本功能仍是单浏览器演示数据管理，不是多用户权限系统。

## 文件与验证

核心规则：`src/screening/conditions.ts`；配置表单：`src/components/job-conditions.tsx`；核验表单：`src/components/pre-screening.tsx`。

现有集成：`src/features/jobs.tsx`、`src/components/candidate-import.tsx`、`screening-details.tsx`、`src/types/recruitment.ts`、`src/data/repository.ts`、`src/screening/schema.ts`、`analyze.ts`、`rules.ts`、`app/globals.css`。

自动化测试：`npm test` 包含 `tests/conditions.test.cjs`；单独执行 `npm run test:conditions`。既有筛选验证脚本已适配新前置确认。

浏览器验收：本地生产服务默认端口 3110，运行 `node scripts/conditions-browser.cjs` 检查配置交互与零请求阻断。设置 `CONDITIONS_LIVE=1` 后额外执行一次真实模型分析和推荐保存（会产生模型成本），仅使用仓库中的合成 PDF。结果保存在被 Git 忽略的 `.local/conditions`。

本次实际验证结果：TypeScript、ESLint、57 项自动化测试及生产构建通过。浏览器已验证条件增删改、文本型 PDF 本地提取、UNKNOWN / FAIL 时全部 AI/RAG 请求数为 0、带原因的人工放行、修改实际值自动重算，以及通过后的一次真实分析请求、推荐保存和刷新恢复；未发现页面运行时异常。版本过期、数字 / 日期 / 布尔 / 枚举判断、冲突与伪造结果拦截由自动化测试覆盖。
