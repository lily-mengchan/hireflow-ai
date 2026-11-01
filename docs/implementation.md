# 参考分析与实现说明

## 实际参考代码

只读参考目录：`D:/project/ai-hire`。

| 参考路径（相对原项目） | 实际观察 | 新项目处理 |
| --- | --- | --- |
| `package.json`、`src/pages` | Next.js 15.3.8 / React 18 / Pages Router / Tailwind 3 / Ant Design 6 / Lucide | 适配当前 Next.js 16 / React 19 / App Router，不迁移 `_app`、`next/router` 或数据 Provider |
| `src/components/appShell/Layout.tsx` | Sidebar + flex 主内容；背景 #F5F7FB | 独立 Shell、浅色侧栏和顶栏、移动端折叠菜单 |
| `src/components/appShell/Sidebar.tsx` | 首页、岗位管理、企业人才库；面试菜单已注释；包含鉴权及同步组件 | 重新实现五页导航，不引入旧账号、公司和同步逻辑 |
| `src/styles/globals.css` | 系统字体、灰色正文、Tailwind 基础样式 | 使用系统字体和当前 Tailwind 4，全局样式重新编写 |
| `src/features/dashboard/hr/components/StatCard.tsx` | 白底圆角卡片、#2F6BFF 数字、#E7ECF3 边框、淡蓝激活态 | 复用视觉方案；新增漏斗、趋势、岗位进度和动态模块 |
| `src/features/jobs/hr/components/JobsTable.tsx` | 岗位名称、薪资/类型、部门、人数、简历数和操作 | 展示字段与布局延续；改用 Ant Design Table，去除同步、上传和删除等接口操作 |
| `src/features/jobs/hr/modals/CreateJobModal.tsx` | 名称、部门、JD、人数、薪资、用工类型，依赖部门及岗位 queries | 重新实现纯前端校验表单；新增/编辑共享表单，不调用原接口 |
| `src/features/jobs/hr/settings/JobSettingsDrawer.tsx` | 基本信息、JD、AI、筛选规则、流程等分区，依赖 react-hook-form 与 API | 保留基本信息、JD 和流程展示，不实现真实 AI 配置 |
| `src/features/talents/hr/TalentPoolPage.tsx` | 关键词筛选、分页、岗位筛选、AI 排序；业务状态和后端耦合 | 重新实现本地筛选、分页与预置分数排序 |
| `src/features/candidate/hr` | 候选人摘要、详情主内容/侧栏、招聘流程模块 | 公共候选人详情抽屉，基本资料、匹配概览、流程时间线 |
| `src/components/talentPool/RequirementMatchDetails.tsx` | 逐项要求、匹配状态、说明与原文引用 | 借鉴分区及引用展示方式，所有内容标记为 Mock，不伪装实时 AI 核验 |
| `src/components/ui/DataTable.tsx` | 可配置列、浅灰表头、空态和圆角容器；另有 Pagination/ConfirmModal | 使用 Ant Design 对应组件统一交互，避免复制有旧依赖的代码 |
| `src/pages/hr/interview/flow/index.tsx` | 实际为建设中占位页 | 新实现流程看板和列表，不将建议流程误认为旧项目已实现 |

## 实现边界

没有直接复制旧业务组件；复用的是从实际代码确认的布局、字段、颜色和组件组合方式。新增可复用组件位于 `src/components`，仅依赖新项目的 Mock 类型和展示库。

流程使用 `workflows` 模板，岗位通过 `workflowId` 关联模板，候选人通过 `jobId` 获取有效阶段。标准模板为 HR 初筛、业务复筛、一面、二面、HR 面、Offer；设计模板额外展示不同的作品集评审阶段。可以追加模板，无需复制整个流程页。

本地修改不跨页同步，不做持久化。看板汇总与部分样本不要求数量一致，页面中已有说明。AI 助手以本地关键词分支选择预设演示文本；知识库入口只执行本地字符串筛选。

新增运行依赖仅 `antd`、`lucide-react`、`recharts`。未读取或迁移旧项目 `.env`、密钥、内部数据和 API；未修改旧项目。

## 后续数据层升级

上述“仅内存、不跨页同步”的说明仅对应最初页面搭建阶段。当前版本已升级为统一共享数据与 localStorage 持久化，详细模型、统计口径及验收方式见 [Mock 数据层说明](mock-data.md)。

当前岗位助手已实现真实 RAG，替代最初的预设文本分支，详见 [RAG 说明](rag.md)。
