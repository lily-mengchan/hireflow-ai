# HireFlow AI

基于 Next.js App Router、React、TypeScript 和 Ant Design 的招聘管理 Demo。业务数据使用 localStorage，岗位 JD 支持真实 Embedding 与 RAG 问答，不连接数据库。

## 启动

使用 Node.js **22.x 最新补丁版本**及 npm。首次克隆后：

```bash
npm ci
```

复制 `.env.example` 为 `.env.local`，在本机填写模型配置（不要提交密钥），然后：

```bash
npm run dev
```

打开 http://localhost:3000 。

本地生产模式：`npm run build` 后执行 `npm run start`。需要 Next.js 服务端 API，不能使用纯静态导出。部署步骤、环境变量及线上复核清单见 [部署前检查报告](docs/deployment.md)。

## 页面

| 路由 | 功能 |
| --- | --- |
| `/` | 从当前共享数据计算统计卡片、累计阶段漏斗、最近 7 天趋势、岗位进度、招聘动态和导出报表 |
| `/jobs` | 搜索筛选、创建与编辑岗位、修改岗位状态、查看 JD 和流程模板 |
| `/candidates` | 按岗位申请展示候选人，支持筛选分页、匹配分排序、更新申请状态和查看历史 |
| `/pipeline` | 按模板、岗位、状态筛选，看板/列表切换，更新阶段并保留完整历史 |
| `/assistant` | 岗位 JD RAG 问答；招聘概况、待复筛、面评、转化及积压的自然语言查询，结果可打开候选人详情 |

候选人页的「导入候选人」支持 PDF 文本提取、真实 AI 简历解析、沟通备注、岗位匹配与推荐评语编辑保存。招聘流程页点击「录入面试反馈」展开 AI 快捷录入；单个候选人的手动反馈在详情中填写，两种方式复用相同保存与校验逻辑。

## 服务端环境变量

| 名称 | 用途及配置条件 |
| --- | --- |
| `OPENAI_API_KEY` | 必填；真实 LLM 服务密钥，Embedding 未单独设置时也使用此密钥 |
| `OPENAI_BASE_URL` | Chat Completions 兼容服务根地址；使用非默认服务时必须设置 |
| `RAG_CHAT_MODEL` | Chat 模型；JD 证据选择、面试提取、简历分析、复杂查询意图共用 |
| `RAG_EMBEDDING_MODEL` | JD 和问题向量模型，必须使用同一模型 |
| `RAG_EMBEDDING_API_KEY` | Embedding 使用独立供应商/密钥时设置 |
| `RAG_EMBEDDING_BASE_URL` | Embedding 使用独立服务地址时设置 |
| `RAG_EMBEDDING_DIMENSIONS` | 可选，须与模型支持的输出维度一致 |
| `RAG_MIN_SIMILARITY` | 可选，按实际 Embedding 模型校验检索阈值 |

所有变量只在服务端使用，不添加 `NEXT_PUBLIC_` 前缀。Vercel 中分别为 Production/Preview 配置后重新部署；本地 `.env.local` 不会随 GitHub 上传。应使用本地已验证的实际模型配置，而不是直接照搬示例默认模型。报告及脚本不输出密钥值。

## 持久化与验收

1. 在岗位管理新建岗位，保存后列表与看板立即更新，刷新页面后岗位仍存在。
2. 使用纯模拟文本型 PDF 导入候选人，选择刚创建的岗位，填写可选沟通信息，生成推荐评语。
3. 核对来源差异，编辑评语并确认推荐；申请进入业务复筛或该岗位对应的评审阶段，可复制推荐内容，不自动发送。
4. 初始数据中“林沐言”有两份不同岗位的申请，修改其中一份不会改变另一份。
5. 点击候选人详情，填写必填事件时间，录入复筛结果及下一轮安排；再在招聘流程的 AI 入口输入面试反馈并确认保存。
6. 在助手查询待业务复筛、面试通过率、推荐转化；在候选人详情查看来源和面试历史，在看板查看同步统计。刷新后重新查询保存的招聘数据。
7. 点击各页顶部“重置演示数据”并确认，恢复初始岗位、档案、申请、面试记录和历史。

业务数据存储在当前浏览器和站点来源中。岗位知识快照提交给服务端建立内存索引；简历分析发送必要文本及选中 JD；面试提取发送本次反馈；智能查询发送经裁剪校验的业务快照，复杂意图模型只读取问题和岗位元数据。候选人资料不发送到 JD RAG。localhost、127.0.0.1、Vercel Preview、正式域名属于不同来源，数据不会自动迁移。重置只修改本应用的专用存储键。

候选人按唯一 ID 去重，岗位申请分别计数。当前 Offer 口径为 Offer 阶段且明确已通过；待安排面试只计正式面试，排除初筛/业务复筛。漏斗按明确阶段记录统计，不根据当前阶段补造历史。旧候选人的匹配分是 Mock 数值，新导入申请展示有依据的初筛分析，不伪造数值评分。面试通过率仅使用明确结果记录，并说明分母。

## 技术架构

Next.js App Router + React + TypeScript + Ant Design；看板使用 Recharts。浏览器通过 `useSyncExternalStore` 订阅同一 Repository，统一校验后整体写入 localStorage。服务端 Route Handlers 复用 OpenAI 兼容模型封装，使用 Zod 校验结构化输出。JD RAG 在请求内建立/复用有版本的向量索引；招聘数据由只读 TypeScript 工具统计，模型不执行 SQL 或直接修改状态。PDF.js 在浏览器读取文件，Worker 和字符映射均由本站提供。

## 代码

- `src/types/recruitment.ts`：Job、Candidate、Application、InterviewRecord、RecruitmentEvent。
- `src/mocks/data.ts`、`src/mocks/seed.ts`：岗位、模板、虚构档案及初始化工厂。
- `src/data/repository.ts`：统一读写、格式/关系校验、状态命令和历史事件。
- `src/data/store.ts`：共享订阅、SSR 安全初始化、持久化与同源标签页更新通知。
- `src/data/selectors.ts`：列表联合视图、岗位人数和动态看板计算。
- `src/components/application-editor.tsx`：共用申请进度表单。
- `src/components/data-controls.tsx`：存储状态、异常提示和重置入口。
- `src/features/`：现有五个页面。

详见 [RAG 配置与验收](docs/rag.md)、[数据层说明](docs/mock-data.md) 和 [初始页面参考分析](docs/implementation.md)。

[面试反馈录入说明](docs/recruitment-messages.md)：入口现位于招聘流程页面，默认收起；事件发生时间在输入区域上方必填，采用上海时区。AI 识别结果可修改，HR 确认后才更新；重名或多岗位申请需明确选择唯一申请。候选人详情提供不调用模型的手动表单。

生产 RAG 在当前请求内按需生成内存索引，不依赖本地文件写入或跨请求缓存。Vercel 上需单独配置模型环境变量；冷启动可能重新生成 JD 向量并产生模型调用费用。

## 检查

```bash
npm test
npm run test:data
npm run test:rag
npm run test:messages
npm run test:feedback
npm run test:screening
npm run test:analytics
npm run messages:verify
npm run rag:index
npm run rag:verify
npm run lint
npx tsc --noEmit
npm run build
node scripts/deployment-audit.cjs
```

`npm test`、Lint、类型检查和构建不调用真实模型；`*:verify`、RAG 索引及浏览器真实链路验证会产生供应商调用费用。

## 已知限制

- 这是单浏览器模拟数据演示，没有账号体系、真实多用户同步、数据库或数据备份；只能使用虚构资料，不适合存储真实简历隐私数据。
- 没有应用层鉴权、全局限流或计费控制。付费模型 API 部署后须使用账户可用的 Vercel 访问保护，并确认覆盖目标环境；不要把未保护的演示当成公开生产服务。
- 扫描版 PDF/OCR、批量导入、云存储、企业微信真实发送、短信邮件、世纪云猎均未接入。
- RAG/简历解析/意图缓存是有界实例内优化，冷启动或实例切换可能重新调用模型；没有跨实例永久向量库。大快照和慢模型受请求大小、客户端超时、函数时长限制。
- 完整 PDF 不长期保存；普通助手附件仍仅展示文件名。聊天记录不跨刷新持久化，招聘记录可刷新恢复。

## GitHub 与 Vercel

当前仓库尚未配置远程地址。本次不会自动上传、提交或部署。请按 [GitHub 上传与 Vercel 手动部署步骤](docs/deployment.md#手动上传与部署) 审阅文件、上传仓库、配置环境变量并执行线上验收。

招聘数据会持久化；助手会话和附件文件名仍只保存在当前页面内存。附件不上传、不读取内容。请仅使用模拟信息，不录入真实个人敏感资料。

候选人管理新增 PDF 简历导入、结构化初筛及推荐评语编辑确认功能，详见 [简历初筛与推荐](docs/resume-screening.md)。候选人 PDF 与 AI 助手附件入口独立，文本在浏览器提取后由服务端真实调用模型；完整 PDF 不长期保存。

AI 招聘助手现支持招聘概况、待复筛、面评统计、转化与积压查询，详见 [招聘数据智能查询](docs/recruitment-analytics.md)。统计由只读 TypeScript 工具计算，复杂问题才调用模型识别意图，岗位 JD 问答继续走原 RAG。
