# 业务面试官 Demo 工作台

入口：HR 导航“招聘协作工作台” `/collaboration`；面试官 `/interviewer`。顶栏“Demo 登录”可切换 HR、林面试官、陈面试官，身份和业务数据在当前浏览器 localStorage 中保存。

| 操作 | HR | 业务面试官 |
| --- | --- | --- |
| 岗位维护、简历导入、HR 备注与推荐、智能分析 | 保留 | 禁止 |
| 查看候选人 | 全部 | 自己复筛或面试任务对应的申请 |
| 分配复筛、安排面试 | 允许 | 禁止 |
| 提交复筛意见 | 查看结果 | 仅自己的当前复筛任务 |
| 正式推进、结束申请 | 允许 | 禁止 |
| 面评草稿、正式提交、修订 | 查看历史 | 仅自己的面试任务 |
| 查看面评 | 全部 | 自己提交的记录 |
| 重置 Demo 数据 | 允许 | 禁止 |

## 操作步骤

1. HR 在原有候选人导入流程完成简历初筛与推荐评语。
2. 在“招聘协作工作台”或候选人详情“业务复筛与面评”选择业务面试官，按需填写沟通摘要（选填，留空也可分配，不自动补入 Mock 内容），点击“推荐并分配复筛”。内置虚构样本提供按岗位编写的 Mock 推荐评语及沟通结论，无需重置浏览器数据；已有评语优先保留。初筛或业务复筛阶段的待处理样本可直接分配，其他阶段不会因 Mock 评语被重置。真实导入候选人仍需先完成 HR 推荐评语。
3. 切换对应面试官 Demo 身份，进入面试官工作台“待我复筛”，查看资料与推荐，提交“建议进入面试”或“不建议进入”。
4. HR 查看复筛历史。建议进入面试的申请显示“待 HR 确认推进”，点击“确认推进”才进入下一阶段；不建议进入时，HR 可以重新沟通/分配，或在原招聘流程以变更说明结束申请。
5. HR 确认推进后选择面试官和上海时区的面试时间，分配当前轮面试任务。
6. 面试官在“我的面试任务”填写评价，可保存草稿并刷新恢复，或正式提交。提交后从“发起修订”创建新版本，保留原始记录。面评通过不会自动变更阶段或申请状态。
7. HR 在协作工作台、候选人详情查看复筛与所有版本面评，使用原招聘流程决定后续阶段。

## 数据与权限边界

复用 Application.collaboration、InterviewRecord.interviewerId 和 RecruitmentEvent；没有数据库或真实账号密码。旧 v1 数据兼容，新增协作字段为可选。

所有协作写入以 applicationId 为入口，面评还验证 interviewId 与申请关系；记录保留 reviewerId、submittedAt、revisionOf。当前复筛 assignmentId 用于拒绝过期任务；提交请求 ID 保证重试幂等。Repository 统一验证角色、任务归属、阶段及数据关系后原子写入 localStorage；旧 HR 写入口也检查角色。读取经 visibleData 过滤，不向面试官界面展示原始 HR 私人备注或其他面试官面评。

这些检查仅用于单浏览器演示，不是安全边界。浏览器所有者仍能读取/修改全部 localStorage、切换身份或绕过前端代码；现有 API 也没有服务端身份授权。生产化需要单独设计服务端认证、共享数据库、逐请求授权、审计及并发控制。当前没有跨设备同步，也不承诺跨标签页同时编辑时的事务隔离。

## 验证命令

- `npx tsc --noEmit`
- `npm run lint`
- `npm test`（包含协作边界与原有功能回归）
- `npm run build`
- 另启动本地服务 `npm run start -- --port 3110`，运行 `npm run collaboration:browser`；使用合成数据与独立浏览器上下文，不覆盖用户演示数据。

## 修改文件

- `app/interviewer/page.tsx`、`app/collaboration/page.tsx`：独立工作台路由。
- `src/features/collaboration.tsx`：复筛分配、HR 确认、面试任务、面评草稿/提交/修订、首页统计及最近记录。
- `src/data/collaboration.ts`、`identity.ts`、`visibility.ts`：协作模型、统一角色检查、Demo 身份持久化、按角色过滤读取。
- `src/data/repository.ts`、`store.ts`、`src/types/recruitment.ts`：复用数据层和历史记录，接入权限、幂等和关联检查。
- `src/components/shell.tsx`、`ui.tsx`、`status-badge.tsx`、`src/features/candidates.tsx`、`app/globals.css`：导航、候选人详情、统一状态语义、手机布局。
- `tests/collaboration.test.cjs`、`scripts/collaboration-browser.cjs`、`package.json`：单元回归和完整浏览器验收入口。
- `docs/interviewer-workspace.md`、`docs/collaboration-mobile.png`：操作说明及手机界面验收图。

## 实际验证结果

- `npx tsc --noEmit`：通过。
- `npm run lint`：通过，无错误或警告。
- `npm test`：63/63 通过（包含 6 项协作与 Mock 评语测试，原有 57 项回归保留）。
- `npm run build`：通过，包含两个新增静态路由。
- 无头 Edge 完整流程：HR 分配、他人任务不可见、业务意见回显、HR 推进、草稿刷新恢复、面评提交及修订历史通过；未出现页面脚本错误。面评提交后仍在“一面”，没有自动推进。

测试子进程在沙箱内出现 EPERM，获准在沙箱外重跑后通过。构建中曾遇到修正文件编码后仍返回旧诊断，清理 Turbopack 持久缓存后恢复。没有推送或部署。
