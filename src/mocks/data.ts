import type { Job } from "../types/recruitment";
export const workflows = [{
  id: "standard",
  name: "标准招聘流程",
  stages: ["HR 初筛", "业务复筛", "一面", "二面", "HR 面", "Offer"]
}, {
  id: "design",
  name: "设计岗位流程",
  stages: ["HR 初筛", "作品集评审", "一面", "二面", "HR 面", "Offer"]
}];
const description = "岗位职责\n1. 参与核心产品的规划与交付，持续优化用户体验。\n2. 与产品、设计及研发团队紧密协作，推动项目落地。\n3. 建立可复用的方法与规范，提升团队协作效率。\n\n任职要求\n1. 本科及以上学历，具备相关领域工作经验。\n2. 扎实的专业基础，良好的沟通能力与责任心。\n3. 对 AI 产品和招聘数字化有兴趣，能够主动解决问题。";
export const jobs: Job[] = [{
  id: "JOB-001",
  title: "高级前端工程师",
  department: "研发部",
  location: "上海",
  salary: "25–40K",
  type: "全职",
  education: "本科",
  experience: "3–5年",
  headcount: 3,
  status: "招聘中",
  jd: "岗位职责\n1. 负责企业级 AI 产品前端架构与核心模块开发。\n2. 使用 React、TypeScript 构建高质量交互体验。\n3. 推进组件库建设与前端性能优化。\n\n任职要求\n1. 本科及以上学历，3 年以上前端开发经验。\n2. 熟练掌握 React、TypeScript、Next.js。\n3. 具备复杂后台系统设计经验，有 AI 产品经验优先。",
  created: "2026-10-12",
  workflowId: "standard"
}, {
  id: "JOB-002",
  title: "AI 产品经理",
  department: "产品部",
  location: "上海",
  salary: "30–45K",
  type: "全职",
  education: "本科",
  experience: "3–5年",
  headcount: 2,
  status: "招聘中",
  jd: description,
  created: "2026-10-15",
  workflowId: "standard"
}, {
  id: "JOB-003",
  title: "高级 UI/UX 设计师",
  department: "设计部",
  location: "杭州",
  salary: "20–35K",
  type: "全职",
  education: "本科",
  experience: "3–5年",
  headcount: 2,
  status: "招聘中",
  jd: description,
  created: "2026-10-16",
  workflowId: "design"
}, {
  id: "JOB-004",
  title: "后端开发工程师",
  department: "研发部",
  location: "上海",
  salary: "25–40K",
  type: "全职",
  education: "本科",
  experience: "3–5年",
  headcount: 4,
  status: "招聘中",
  jd: description,
  created: "2026-10-18",
  workflowId: "standard"
}, {
  id: "JOB-005",
  title: "算法工程师",
  department: "研发部",
  location: "北京",
  salary: "35–55K",
  type: "全职",
  education: "硕士",
  experience: "3–5年",
  headcount: 2,
  status: "已暂停",
  jd: description,
  created: "2026-10-20",
  workflowId: "standard"
}, {
  id: "JOB-006",
  title: "招聘运营专员",
  department: "人力资源部",
  location: "上海",
  salary: "12–18K",
  type: "全职",
  education: "本科",
  experience: "1–3年",
  headcount: 1,
  status: "已结束",
  jd: description,
  created: "2026-10-08",
  workflowId: "standard"
}];
export const candidateNames = ["林沐言", "陈思远", "许知夏", "周予安", "沈佳宁", "陆景行", "顾星辰", "苏雨桐", "江亦舟", "宋清禾", "唐嘉树", "叶舒然", "程一诺", "何书瑶", "季明轩", "温以宁"];
export const suggestions = ["哪些候选人适合高级前端工程师？", "查看本周招聘进展", "查询 AI 产品经理的岗位要求", "有哪些待安排的面试？"];
export const initialMessages = [{
  role: "assistant" as "assistant" | "user",
  text: "你好，我是 HireFlow AI 招聘助手。\n可以帮你查询招聘概况、待业务复筛、面试结果和流程转化，也能依据岗位 JD 回答招聘要求。统计基于当前保存的记录，你可点击结果查看候选人进度。",
  sources: [] as string[]
}];
