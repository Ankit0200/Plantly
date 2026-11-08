import type { Grower, Plan, ReferenceData, DataStatus, ChatMessage, ChatResponse, IntakeResponse } from './types';

const BASE = '/api';

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw { status: res.status, body };
  }
  return res.json();
}

export function getHealth() {
  return fetchJSON<{ status: string; data_version: string }>(`${BASE}/health`);
}

export function getReference() {
  return fetchJSON<ReferenceData>(`${BASE}/reference`);
}

export function getDemoGrover() {
  return fetchJSON<Grower>(`${BASE}/demo-grower`);
}

export function postCheck(grower: Grower) {
  return fetchJSON<{ errors: string[] }>(`${BASE}/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grower }),
  });
}

export function postPlan(grower: Grower, keepPlannedCropFor?: string[]) {
  return fetchJSON<Plan>(`${BASE}/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grower, keep_planned_crop_for: keepPlannedCropFor || [] }),
  });
}

export function postChat(grower: Grower, messages: ChatMessage[]) {
  return fetchJSON<ChatResponse>(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grower, messages }),
  });
}

export async function postIntake(formData: FormData): Promise<IntakeResponse> {
  const res = await fetch(`${BASE}/intake`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw { status: res.status, body };
  }
  return res.json();
}

export function postExplainLine(line: Record<string, unknown>, plotContext: Record<string, unknown>) {
  return fetchJSON<{ explanation: string }>(`${BASE}/explain-line`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ line, plot_context: plotContext }),
  });
}

export function getDataStatus() {
  return fetchJSON<DataStatus>(`${BASE}/data-status`);
}
