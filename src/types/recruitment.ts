export type JobStatus = "招聘中" | "已暂停" | "已结束";
export type ApplicationStatus = "待处理" | "已通过" | "已淘汰";
export type InterviewStatus = "待安排" | "已安排" | "已完成";

export interface Job {
  id: string;
  title: string;
  department: string;
  location: string;
  salary: string;
  type: string;
  education: string;
  experience: string;
  headcount: number;
  status: JobStatus;
  jd: string;
  created: string;
  workflowId: string;
  screeningConditions?: import("../screening/conditions").ScreeningCondition[];
}

export interface Candidate {
  id: string;
  name: string;
  education: string;
  school: string;
  experience: number;
  company: string;
  skills: string[];
  summary: string;
  createdAt: string;
  resumeHashes?: string[];
  resumeProfile?: import("../screening/schema").ResumeProfile;
}

export interface Application {
  id: string;
  candidateId: string;
  jobId: string;
  stage: string;
  status: ApplicationStatus;
  interview: InterviewStatus;
  score: number;
  createdAt: string;
  updatedAt: string;
  preScreening?: import("zod").infer<typeof import("../screening/conditions").savedPreScreeningSchema>;
  recommendation?: import("../screening/schema").Recommendation;
}

export interface InterviewRecord {
  id: string;
  applicationId: string;
  stage: string;
  scheduledAt: string | null;
  status: Exclude<InterviewStatus, "待安排">;
  note: string;
  interviewer?: string | null;
  result?: "通过" | "未通过" | "待定" | null;
  recordedAt?: string;
  /** HR-confirmed completion timestamp; legacy records may not have one. */
  completedAt?: string | null;
  sourceEventId?: string;
}

export interface RecruitmentEvent {
  id: string;
  applicationId?: string;
  jobId: string;
  candidateId?: string;
  type: "job-created" | "job-updated" | "application-created" | "application-updated";
  occurredAt: string;
  title: string;
  note: string;
  before?: Pick<Application, "stage" | "status" | "interview">;
  after?: Pick<Application, "stage" | "status" | "interview">;
  source?: {
    mode?: "ai" | "manual";
    fingerprint: string;
    message: import("../messages/schema").MessageInput;
    original: import("../messages/schema").ExtractedEvent;
    confirmed: import("../messages/schema").ExtractedEvent;
    confirmationNote: string;
  };
  interviewChanges?: { before: InterviewRecord | null; after: InterviewRecord }[];
}

export interface RecruitmentData {
  version: 1;
  jobs: Job[];
  candidates: Candidate[];
  applications: Application[];
  interviews: InterviewRecord[];
  events: RecruitmentEvent[];
}

/** Joined read model for the existing candidate tables; writes always target applicationId. */
export interface CandidateApplication extends Candidate {
  recommendation?: import("../screening/schema").Recommendation;
  applicationId: string;
  jobId: string;
  stage: string;
  status: ApplicationStatus;
  interview: InterviewStatus;
  score: number;
  history: { date: string; title: string; note: string }[];
}
export type JobSummary = Job & { applicants: number; hired: number };
