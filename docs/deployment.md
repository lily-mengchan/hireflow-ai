# HireFlow AI 部署前检查报告

检查日期：2026-11-01。目标为 Vercel 上的受控演示，不新增业务功能、不连接数据库，不自动上传 GitHub 或创建线上部署。

## 结论与验证边界

当前代码可在本地 Next.js 生产模式构建和运行。Vercel 必须配置模型环境变量，选择 Node 22.x，并在实际部署后验证 Linux 构建、供应商网络、函数时长、HTTPS PDF Worker 与目标域名下的浏览器存储。本报告不把本地 `next start` 等同于已上线验证。

| 检查项 | 已本地确认 | 上线后仍须确认 |
| --- | --- | --- |
| Next.js 构建 | App Router，Next 16.4.3，React 19.3.0；14 个路由成功生成，保留 Node 服务端 API，无静态导出或 Edge 配置 | Vercel Linux 构建和平台适配结果 |
| 依赖安装 | 精确 Next/React 版本在 npm 官方仓库可用；隔离目录执行官方 `npm ci` 成功 | Vercel 安装日志、网络和 Linux 可选依赖 |
| 函数预算 | 构建 manifest 已识别 RAG ask/index 和简历 screen 240 秒、反馈 parse 和智能 query 120 秒 | 实际账户计划、Fluid Compute 设置与真实耗时；客户端和单次模型请求另有超时 |
| 环境变量 | 本地 8 个模型配置名称均已设置；未输出密钥 | Production/Preview 分别配置，新部署生效，供应商余额与区域可达性 |
| RAG 文件系统 | API 仅可选读取 JSON，无文件写入；EROFS/ENOENT/EACCES、无旧内存、新增/编辑/移除索引均有自动化测试 | 冷实例真实 Embedding 调用及较大 JD 快照耗时 |
| PDF | 浏览器本地提取；本地 Worker 与安装版本哈希一致，CMap 目录 169 个资源文件逐一匹配；生产 HTTP 资源返回正常 | HTTPS、浏览器 Worker、字符映射与目标文件字体；扫描件/OCR 不支持 |
| localStorage / SSR | 固定 serverSnapshot + useSyncExternalStore；订阅后才访问 window，旧数据兼容，写失败不发布伪成功状态 | 目标域名的存储权限、禁用存储和配额限制 |
| 密钥边界 | 扫描 25 个客户端构建文件及公共文本资产，未发现已配置密钥值；无 NEXT_PUBLIC 密钥变量，函数 trace 未包含 `.env` 或隔离安装目录 | 上线浏览器 Sources/Network 复核；密钥轮换和平台权限 |
| 业务闭环 | 52 项自动化测试通过；本轮生产浏览器 10 项闭环检查通过，真实简历/反馈模型及新岗位 JD RAG 成功，页面与 Hydration 错误均为 0 | 在正式域名完整重复演示流程 |
| 部署访问控制 | 源码没有登录、应用层鉴权或全局限流 | 核对 Vercel Deployment Protection 是否覆盖所分享的目标环境 |

本地运行使用 Node v22.10.0。隔离安装出现 eslint-visitor-keys 要求更新 Node 补丁的提示，但安装、Lint、类型检查和构建均成功。线上已固定 `engines.node = 22.x`，由 Vercel 提供该主版本的更新补丁；本地也建议更新至 Node 22 最新补丁。

## 本次最小修复

1. `package.json` 增加 Node 22.x 和统一 `npm test` 命令。
2. `package-lock.json` 将 557 个第三方 npm 镜像 tarball 地址换为官方 registry 地址，保留版本和 integrity；已用隔离目录全新安装验证。
3. 5 个模型相关 Route Handler 增加 `maxDuration`，不改变业务处理逻辑，不指定不兼容的 Edge runtime。
4. `src/rag/model.ts` 和 RAG 状态 API 的缺配置提示同时覆盖部署平台，避免上线后仍只提示修改本地文件。
5. 更新 README 的入口、必填事件时间、当前统计口径、配置、架构、演示步骤和已知限制；新增本报告及不输出凭据的审计/生产浏览器脚本。

未修改原 AI-Hire 项目，未改数据存储架构，未新增运行依赖，未删除已有功能。

## Vercel 环境变量

| 名称 | 用途 | 配置条件 |
| --- | --- | --- |
| `OPENAI_API_KEY` | LLM 密钥及默认 Embedding 密钥 | 必填 |
| `OPENAI_BASE_URL` | OpenAI 兼容 Chat 服务根地址，通常包含 `/v1` | 使用兼容服务时必填；否则使用代码默认值 |
| `RAG_CHAT_MODEL` | 所有 Chat 类业务调用的模型 | 应显式配置为本地验证过的模型 |
| `RAG_EMBEDDING_MODEL` | JD 与问题共用的 Embedding 模型 | 应显式配置 |
| `RAG_EMBEDDING_API_KEY` | 独立向量服务的密钥 | Embedding 供应商或密钥与 Chat 不同时设置 |
| `RAG_EMBEDDING_BASE_URL` | 独立向量服务根地址 | Embedding 供应商与 Chat 不同时设置 |
| `RAG_EMBEDDING_DIMENSIONS` | 输出维度 | 可选，必须与所选模型相符 |
| `RAG_MIN_SIMILARITY` | 检索阈值 | 可选，使用本地已校验值 |

只复制配置到 Vercel 的环境变量界面，不能放进客户端或添加 `NEXT_PUBLIC_`。密钥使用 Secret 类型；不要把密钥放在截图、GitHub、README 或浏览器请求参数中。`.env.local` 已被 Git 忽略，`.env.example` 是无密钥示例。

模型配置位于 `src/rag/model.ts`，仅服务端 API 和本地验证 CLI 引用。所有新查询工具仍使用校验后的快照；模型不读取整个候选人数据库。简历及反馈按当前功能发送必要文本，这与将密钥或全部数据库暴露给客户端不同。

## RAG 与 Serverless

`src/rag/index.ts` 会尝试读取 `process.cwd()/.local/rag/indexes/<key>.json`，只是可选索引种子。文件不存在、只读或不匹配时，当前请求会调用真实 Embedding 建立内存索引；不向该目录写入。新建或编辑的岗位依赖本次客户端岗位快照，不依赖上一次请求或某个实例的旧内存。

文件写入只存在于显式执行的 `scripts/*.cjs` 本地索引导出与验收报告中，不在 Route Handler 运行链路。不要把 `rag:index`、`*:verify` 或浏览器脚本设置为 Vercel 构建命令；构建不需要模型调用或写向量文件。

当前缓存没有跨实例持久性。冷启动会增加 Embedding/模型成本，不等于查询失败；大量岗位和慢供应商仍可能超过客户端或函数预算，需要线上实测。

## 本地证据与重复验证

```powershell
npm ci
npx tsc --noEmit
npm run lint
npm test
npm run build
node scripts/deployment-audit.cjs
npm run start -- --port 3105
# 另一个终端，使用已配置的真实模型及隔离浏览器：
node scripts/deployment-browser.cjs
```

审计摘要：`.local/deployment-audit.json`，只记录变量名称/是否配置、客户端秘密扫描计数、PDF 资产匹配及函数预算，不记录密钥值。

生产浏览器脚本使用合成 PDF 和独立 Edge Context，已通过 10 项检查：5 页直达和首次初始化 → UI 创建岗位并刷新 → PDF 本地提取/真实简历分析 → 核对确认推荐及复制 → 智能查询同一申请 → 复筛通过并安排一面 → 真实 AI 面试反馈及 HR 确认 → 通过率统计 → 新岗位真实 JD RAG → 刷新后恢复。报告为 `.local/deployment-browser-verification.json`，截图为 `.local/deployment-production.png`。未触碰用户现有浏览器数据，未发现页面或 Hydration 错误。

## 手动上传与部署

### GitHub

当前已有本地 Git 仓库，分支为 `master`，尚无远程地址。先在 GitHub 创建空仓库，不生成另一份 README。然后在本项目执行以下命令，仓库地址由你替换：

```powershell
git status --short
git check-ignore .env.local .local/deployment-audit.json
git add .
git diff --cached --stat
git diff --cached --name-only
# 确认暂存区无 .env.local、密钥、.local 报告、node_modules、.next 或真实简历后再提交。
git commit -m "Prepare HireFlow AI recruitment demo for Vercel"
# 如果希望使用 main 作为生产分支：
git branch -M main
git remote add origin https://github.com/<你的账号>/<你的仓库>.git
git push -u origin main
```

应提交 `package-lock.json`、`AGENTS.md`、完整 `src`/`app`、文档和 `public/pdf*` 静态资产。若自行保留 `master`，将 push 和 Vercel 生产分支对应改为 `master`。不要执行强推覆盖未知远程历史。

### Vercel

1. Dashboard → Add New Project → 导入上述 GitHub 仓库。
2. Framework Preset 选择 **Next.js**；Root Directory 选择包含本 README 和 package.json 的根目录；Node 选择 **22.x**。
3. Install Command 使用 `npm ci`；Build Command 使用 `npm run build`；Output Directory 保留框架默认，不填 `out`；不选择静态站点导出。
4. 在 Environment Variables 添加上述配置，至少勾选需要演示的 Production / Preview。使用本地实际验证过的供应商地址和模型，不直接采用示例默认值替代。保存后创建新部署。
5. 查看安装和构建日志：依赖来自官方 npm，14 个路由生成，API 保留服务端函数；在函数设置核对时长与部署区域。
6. 确认访问保护覆盖实际分享的环境。此项目没有应用层登录或限流，不能因 Key 未暴露就认为付费接口对公众不可调用。账户不支持目标环境保护时，不将无保护演示作为公开服务。
7. 完成下一节线上验收后再分享地址。环境变量变更只影响新部署，修改后需 Redeploy。

## 需要线上验证

- Vercel Linux 安装与构建，不以 Windows 本地构建代替。
- 生产 URL 下 `pdf.worker.min.mjs` 和 `pdf-cmaps/Adobe-GB1-UCS2.bcmap` 返回 200，浏览器 Worker 无 CSP/MIME/版本错误；使用实际计划演示的中文文本型 PDF 检查字符提取。
- 五个页面直接刷新，浏览器 Console 无 SSR/Hydration 报错，首次初始化和已有存储恢复均正常。
- 同一正式域名下新建岗位、导入模拟简历、推荐、复筛、面试反馈、查询和看板同步；新岗位/编辑后 JD 被 RAG 查询到。
- 真实 LLM 与 Embedding 供应商在该部署区域可达，余额/限额有效；检查冷启动耗时、429、超时及函数日志，但不记录简历或密钥。
- 在 DevTools 的 Sources/Network 检查：客户端无 API Key，浏览器只调用本站 API，不携带供应商 Bearer Key。
- localStorage 是按协议/域名/端口隔离的；localhost、Preview 地址、正式域名和 www 子域不会自动共享数据。域名变化后显示初始样本不代表服务端丢失数据库。
- 确认 Vercel Deployment Protection 覆盖计划分享的 URL 和部署环境。

## 当前不支持

真实用户权限、多用户/跨设备同步、生产简历隐私库、永久向量数据库、云备份、OCR、批量导入、实际企业微信发送、世纪云猎、短信邮件、供应商全局账单/全局限流均未实现。本次仅检查现有模拟业务闭环，不新增这些能力。

## 官方依据

- [Vercel Node.js 版本与 engines 覆盖规则](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
- [Next.js App Router 函数 maxDuration 与平台时长限制](https://vercel.com/docs/functions/configuring-functions/duration)
- [Vercel 环境变量和新部署生效规则](https://vercel.com/docs/environment-variables)
- [Vercel Deployment Protection](https://vercel.com/docs/deployment-protection)

本机 Next.js 指南：`node_modules/next/dist/docs/01-app/01-getting-started/17-deploying.md`、`02-guides/environment-variables.md`、`03-api-reference/03-file-conventions/02-route-segment-config/maxDuration.md`。套餐可用性和平台默认值以上线时控制台为准。
