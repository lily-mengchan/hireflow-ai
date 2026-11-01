"use client";
import { useSyncExternalStore } from "react";
import { createSeed } from "../mocks/seed";
import { RecruitmentRepository, STORAGE_KEY, type ApplicationChange, type JobInput } from "./repository";
import { selectApplications, selectJobs } from "./selectors";
import type { RecruitmentData } from "../types/recruitment";
import type { Confirmation } from "../messages/schema";
import type { SaveImport } from "../screening/schema";

type Snapshot = { data: RecruitmentData; ready: boolean; error: string | null };
const serverSnapshot: Snapshot = { data: createSeed(), ready: false, error: null };
let snapshot = serverSnapshot;
const listeners = new Set<() => void>();
let repository: RecruitmentRepository | undefined;
function emit() { listeners.forEach(listener => listener()); }
function publish(data: RecruitmentData) { snapshot = { data, ready: true, error: null }; emit(); }
function load() {
  try { repository = new RecruitmentRepository(window.localStorage); publish(repository.load()); }
  catch { snapshot = { ...snapshot, ready: true, error: "无法读取或校验本地数据。当前显示最近可用数据或初始样本；请检查浏览器存储权限，或重置演示数据。" }; emit(); }
}
function onStorage(event: StorageEvent) { if (event.storageArea === window.localStorage && (event.key === STORAGE_KEY || event.key === null)) load(); }
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) { window.addEventListener("storage", onStorage); load(); }
  return () => { listeners.delete(listener); if (!listeners.size) window.removeEventListener("storage", onStorage); };
}
function mutate(action: (repo: RecruitmentRepository) => RecruitmentData) {
  try {
    if (!repository) repository = new RecruitmentRepository(window.localStorage);
    publish(action(repository));
  } catch (error) { throw new Error(error instanceof Error ? error.message : "保存失败，请检查浏览器本地存储权限或可用空间"); }
}
export const recruitmentActions = {
  saveJob: (input: JobInput, id?: string) => mutate(repo => repo.saveJob(input, id)),
  saveImport: (input: SaveImport) => {
    if (!repository) repository = new RecruitmentRepository(window.localStorage);
    const data = repository.saveImport(input); publish(data); return data;
  },
  updateApplication: (id: string, change: ApplicationChange) => mutate(repo => repo.updateApplication(id, change)),
  reset: () => mutate(repo => repo.reset()),
  confirmMessage: async (input: Confirmation) => {
    if (!repository) repository = new RecruitmentRepository(window.localStorage);
    const data = await repository.confirmMessage(input);
    publish(data);
    return data;
  },
};
export function useRecruitment() {
  const state = useSyncExternalStore(subscribe, () => snapshot, () => serverSnapshot);
  return { ...state, jobs: selectJobs(state.data), candidates: selectApplications(state.data) };
}
