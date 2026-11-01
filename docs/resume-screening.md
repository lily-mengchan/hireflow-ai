# 简历初筛与推荐

入口：候选人管理 → 导入候选人。仅使用模拟资料；localStorage 是单浏览器演示存储，不是生产隐私数据库。

## 数据流

1. 浏览器用 PDF.js 提取文本，检查 PDF 扩展名、MIME、签名、5 MB、20 页、16000 字限制。少于 40 个有效字符时提示扫描件，当前不接 OCR。不上传或持久化完整 PDF。
2. 选择共享 Repository 中的最新岗位；填写可选沟通信息。文本先移除常见手机号、邮箱，再以 JSON 发送 `/api/recruitment/screen`，不发送其他岗位、招聘历史或完整文件。
3. `src/screening/analyze.ts` 通过现有服务端模型配置调用 `completeMeasured`：首次提取结构化简历，第二次分析选定 JD 的相关经历。Zod 校验输出；原文证据必须属于简历，匹配依据必须属于选中 JD 及已验证事实。日期不明确保持原文，工作年限仅使用明确年数。
4. 学历、明确年限、地点意愿执行 TypeScript 条件校验，区分不符合、待核实及来源冲突。JD 明确条件和岗位表单字段分别检查。语义关联由真实 LLM 分析，不使用 Embedding 分数作为录用概率。
5. 推荐评语由 AI 提取和匹配的证据、HR 沟通信息及规则结果套入固定结构组装，**没有额外的长文本润色模型调用**。这样便于核对事实，也节省一次调用。HR 可编辑评语并核对后保存。
6. 通过 `recruitmentActions.saveImport`、`RecruitmentRepository.saveImport` 一次写入候选人、岗位申请、推荐及招聘事件，成功后发布共享状态。保存失败不会部分更新；旧数据无新增字段时仍可读取。

## 来源、身份与状态

- 原文提取字段标记 `RESUME`；HR 沟通及手工修订标记 `HR_NOTE`。修订字段保留 `originalEvidence`，沟通信息与简历分别保存；差异不自动覆盖。
- 不新增电话、邮箱、性别、年龄字段，不据此作招聘评价。复制内容清除常见手机号和邮箱；其他自由文本仍需要 HR 核对，不能视为通用隐私脱敏服务。
- 简历文本 SHA-256 指纹命中时必须选中已有候选人；同名记录提示人工选择或确认不同的人。不同文件/改名/履历变化无法保证自动识别同一自然人，允许 HR 明确关联已有编号。
- 候选人与岗位申请独立，同一候选人可申请不同岗位。已有同岗位进行中的申请不允许被导入覆盖；保存后的 HR 草稿允许经明确确认推进复筛。
- 待审核保存到岗位流程第 1 阶段，显示「待 HR 审核」；确认推荐进入第 2 阶段，显示「待业务复筛」。设计流程第 2 阶段为作品集评审，保留该岗位模板。不会直接进入一面。
- Repository 保存前核对当前岗位版本；岗位已变更须重新分析。推荐保存当时的岗位快照和匹配依据，后续编辑岗位不改写历史记录。
- `IMPORT-<importId>` 事件确保同一次确认重试幂等；同时用简历指纹、候选人唯一 ID、候选人/岗位唯一申请关系阻止重复导入。
- 详情「初筛与推荐」显示来源、沟通、评语、推荐时间和匹配依据；原招聘历史、面试反馈表单继续使用现有逻辑。导入申请不伪造 AI 数值评分，列表显示「见初筛分析」。

## 缓存与成本

- 每个服务端实例两个有界内存缓存，各最多 20 条、TTL 10 分钟：简历指纹 + 模型配置/版本缓存解析结果；简历 + 当前岗位完整版本 + HR 信息 + 人工修订缓存分析结果。
- 相同请求和并发解析复用结果；更换岗位/备注通常只需一次语义分析，复用原简历解析；人工修订可直接分析经校验的结构化字段。
- 冷启动、实例切换、超时失效会重新计费；不依赖 Vercel 文件写入或跨请求缓存持久性。缓存不写磁盘，不输出简历日志。
- 首次完整分析通常 2 次模型请求，备注或岗位调整通常 1 次，完全命中为 0 次。没有 Embedding 请求。
- `completeMeasured` 读取供应商实际 usage，兼容原 `complete` 返回值。当前导入累计成功调用与 Token 显示并保存在推荐记录；供应商未返回时显示未知，不估算成 0。失败调用的费用、所有用户全局账单不在此本地统计范围内。

## 文件

- `src/screening/{schema,prompt,analyze,rules,pdf}.ts`：类型校验、Prompt、真实分析、规则/评语/复制、本地 PDF。
- `app/api/recruitment/screen/route.ts`：服务端分析入口，密钥仅在服务端。
- `src/components/{candidate-import,screening-details}.tsx`、`candidate-import.css`：导入四步抽屉及推荐详情。
- `src/features/{candidates,pipeline}.tsx`、`src/components/ui.tsx`：入口、展示、导入申请评分处理。
- `src/types/recruitment.ts`、`src/data/{repository,store}.ts`：可选字段和共享原子保存。
- `src/rag/model.ts`：增加带 usage 的调用，原 RAG 和面试提取调用方式兼容。
- `public/pdf.worker.min.mjs`、`public/pdf-cmaps/`、`public/pdfjs-LICENSE.txt`：与固定 PDF.js 5.4.296 版本匹配的本地 Worker、中文等字符映射及许可；不依赖 CDN。升级库时须同步资产。
- `package.json`、锁文件：PDF.js 运行依赖；Playwright 开发验收依赖；`eslint.config.mjs` 只排除第三方压缩 Worker 的 lint。
- `tests/screening.test.cjs`、`tests/helpers/screening.cjs`：初筛单元测试及纯合成 PDF，无真实候选人。
- `scripts/screening-{verify,browser}.cjs`：真实模型及独立浏览器验收，不操作用户现有浏览器数据。

## 验证命令

```powershell
npm run test:screening
node --test tests/screening.test.cjs tests/feedback.test.cjs tests/messages.test.cjs tests/recruitment.test.cjs tests/rag.test.cjs
npm run screening:verify # 使用已配置的真实模型，有调用费用
npm run build
npm run start -- --port 3101 # 另一个终端
npm run screening:browser # 使用本机 Edge；真实 API；隔离浏览器，仅合成 PDF
npm run lint
npx tsc --noEmit
```

浏览器地址可通过 `SCREENING_TEST_URL` 指定。结果摘要和截图放在已忽略的 `.local/`；报告不包含简历文本和密钥。未实现真实企业微信发送、OCR、批量导入、云存储、数据库或全局多用户同步。
