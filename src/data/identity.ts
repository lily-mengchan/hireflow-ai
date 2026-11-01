"use client";
import { useSyncExternalStore } from "react";
import { identities, hrIdentity, type Identity } from "./collaboration";
const key = "hireflow-ai:demo-identity";
const listeners = new Set<() => void>();
export function currentIdentity(): Identity { if (typeof window === "undefined") return hrIdentity; return identities.find(i => i.id === window.localStorage.getItem(key)) ?? hrIdentity; }
export function selectIdentity(id: string) { if (!identities.some(i => i.id === id)) throw new Error("演示身份无效"); window.localStorage.setItem(key, id); listeners.forEach(fn => fn()); }
function subscribe(fn: () => void) { listeners.add(fn); window.addEventListener("storage", fn); return () => { listeners.delete(fn); window.removeEventListener("storage", fn); }; }
export function useIdentity() { return useSyncExternalStore(subscribe, currentIdentity, () => hrIdentity); }
