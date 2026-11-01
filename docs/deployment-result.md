# HireFlow AI 部署执行记录

执行日期：2026-11-01。已完成实际私有仓库上传及受保护生产部署，未新增业务功能、未接入数据库。

## 实际资源

| 项目 | 实际结果 |
| --- | --- |
| GitHub | https://github.com/lily-mengchan/hireflow-ai （私有） |
| 生产分支 | `master`；原本无远程仓库，未覆盖任何既有远程历史 |
| 线上演示 | https://hireflow-ai-nu-eight.vercel.app |
| 已验收的部署链接 | https://hireflow-ij3zdtk7r-lily-mengchans-projects.vercel.app |
| Vercel 项目 | https://vercel.com/lily-mengchans-projects/hireflow-ai |
| 已验收业务代码版本 | `31f038e58157c3c5d1e98ffa2cbd84a025243b95` |
| 团队与计划 | `lily-mengchans-projects`，Hobby，未升级套餐 |
| 部署设置 | Next.js、Node 22.x、`npm ci`、`npm run build`、Fluid Compute |
| 访问保护 | Vercel Authentication，All Deployments，包含正式域名 |

文档提交会触发后续自动构建，但不改变上述已验收业务代码。日常访问使用正式地址；特定验收部署链接固定指向当时的版本。

## 配置与上传安全

- GitHub CLI 与 Vercel CLI 均通过用户亲自完成的官方设备授权登录；没有索取密码或个人 Token。
- CLI 网络曾在令牌交换阶段超时，后使用用户已有系统代理和临时 Node 22 补丁版本正常完成；没有修改系统代理或关闭 TLS 校验。
- 8 项模型配置从本地 `.env.local` 白名单读取，通过 CLI 标准输入写入 Production/Preview Secret；值未进入命令参数、Git、README 或终端日志。
- 没有创建 `NEXT_PUBLIC_` 模型密钥。`.env.local`、`.local`、`.vercel`、临时 CLI 和模型索引均被排除。
- 上传前检查了 271 个源文件/资产，没有发现已配置密钥、疑似凭据或候选人文档。补充了简历/私有目录忽略规则及 `.vercelignore`。
- 线上验收使用平台授权的自动化访问权限，未关闭登录保护、未公开分享任何访问凭据。

## 线上实际验收

使用隔离浏览器 Context 和合成 PDF，没有使用真实候选人，也没有将测试档案加入预置样本或代码。

1. 五个页面直接访问、首次 localStorage 初始化。
2. UI 创建新岗位并刷新恢复。
3. HTTPS PDF Worker 和字符映射资源正常。
4. 文本型 PDF 本地提取、真实 AI 简历分析、推荐保存和复制。
5. 智能查询同一岗位申请的待业务复筛状态。
6. 复筛通过并安排一面。
7. 真实 AI 面试反馈提取，HR 确认后更新状态及历史。
8. 面试通过率查询与刚保存的记录一致。
9. 新建岗位 JD 经真实 Embedding/RAG 返回对应来源。
10. 刷新后保留岗位、申请状态及可查询数据。

结果：10 项通过；页面运行异常 0，Hydration 错误 0。扫描 217 个页面、脚本及接口响应，未发现已配置的模型密钥值。

未授权访问：首页和 RAG 状态接口返回 302，重定向至 Vercel；未授权简历分析 POST 返回 401。付费接口未为验收关闭保护。

## 使用与维护

- 本人使用获授权的 Vercel 账号登录后访问线上演示。邀请他人前，应在 Vercel 中管理访问权限，不应直接关闭所有部署保护。
- 源码推送到 GitHub 的 `master` 后，会触发已关联 Vercel 项目的生产构建。环境变量变更需要新部署。
- 单浏览器 localStorage 仍是演示存储；其他浏览器、域名和设备不会共享数据。隔离验收中的档案不会出现在你自己的浏览器里。
- 本次不需要再手动创建仓库、项目或填写模型配置。后续只需按实际需要管理访问成员及供应商余额/限额。
- 账号权限、全局限流、多用户数据库、OCR 等仍未实现，不因部署成功而具备这些能力。
