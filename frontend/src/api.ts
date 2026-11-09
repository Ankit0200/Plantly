import type {
  Grower, Plan, ReferenceData, DataStatus, ChatMessage, ChatResponse,
  IntakeResponse, AuthUser, PlanSummaryItem, SavedPlanDetail, PlanChatResponse,
  HistoryItem, NotificationsResponse, ImplementedItemData, ImplementedSummary
} from './types';

const BASE = '/api';

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw { status: res.status, body };
  }
  return res.json();
}

// ==================== Auth ====================

export function authRegister(email: string, password: string, name: string, zipCode?: string) {
  return fetchJSON<AuthUser>(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name, zip_code: zipCode }),
  });
}

export function authLogin(email: string, password: string) {
  return fetchJSON<AuthUser>(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

export function authLogout() {
  return fetchJSON<{ ok: boolean }>(`${BASE}/auth/logout`, { method: 'POST' });
}

export function authMe() {
  return fetchJSON<AuthUser>(`${BASE}/auth/me`);
}

// ==================== Farm ====================

export function getFarm() {
  return fetchJSON<{ grower: Grower | null; farm_id?: number }>(`${BASE}/farm`);
}

export function saveFarm(grower: Grower) {
  return fetchJSON<{ farm_id: number; grower: Grower }>(`${BASE}/farm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grower }),
  });
}

// ==================== Existing routes ====================

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

export function postPlanPreview(grower: Grower, keepPlannedCropFor?: string[]) {
  return fetchJSON<Plan>(`${BASE}/plan/preview`, {
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

export function postIntakeChat(messages: { role: string; content: string }[]) {
  return fetchJSON<{ reply: string; grower?: Grower; errors?: string[] }>(`${BASE}/intake-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
}

export interface CropRecommendation {
  crop_id: string
  crop_name: string
  reasons: string[]
}

export interface PlotRecommendation {
  plot_id: string
  plot_name: string
  recommendations: CropRecommendation[]
}

export function postRecommend(grower: Grower, plan: Plan) {
  return fetchJSON<{ plots: PlotRecommendation[] }>(`${BASE}/recommend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grower, plan }),
  });
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

// ==================== Plans & History ====================

export function getPlans() {
  return fetchJSON<PlanSummaryItem[]>(`${BASE}/plans`);
}

export function getPlan(planId: number) {
  return fetchJSON<SavedPlanDetail>(`${BASE}/plans/${planId}`);
}

export function postPlanChat(planId: number, message: string, conversationId?: number, context?: string) {
  return fetchJSON<PlanChatResponse>(`${BASE}/plans/${planId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, conversation_id: conversationId, context }),
  });
}

export function getHistory(page = 1) {
  return fetchJSON<{ items: HistoryItem[]; page: number }>(`${BASE}/history?page=${page}`);
}

// ==================== UI Events ====================

export function postEvent(type: string, payload: Record<string, unknown> = {}, planId?: number) {
  return fetchJSON<{ ok: boolean }>(`${BASE}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, payload, plan_id: planId }),
  });
}

// ==================== Implemented Items ====================

export function addImplemented(planId: number, plotId: string, lineIndex: number) {
  return fetchJSON<ImplementedItemData>(`${BASE}/plans/${planId}/implemented`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plot_id: plotId, line_index: lineIndex }),
  });
}

export function removeImplemented(itemId: number) {
  return fetchJSON<{ ok: boolean }>(`${BASE}/implemented/${itemId}`, { method: 'DELETE' });
}

export function getPlanImplemented(planId: number) {
  return fetchJSON<{ items: ImplementedItemData[] }>(`${BASE}/plans/${planId}/implemented`);
}

export function getAllImplemented() {
  return fetchJSON<ImplementedSummary>(`${BASE}/implemented`);
}

export function updateImplementedActual(itemId: number, data: {
  actual_quantity?: number | null;
  actual_unit?: string | null;
  actual_date?: string | null;
  actual_note?: string | null;
  source?: 'chat' | 'manual';
}) {
  return fetchJSON<ImplementedItemData>(`${BASE}/implemented/${itemId}/actual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

// ==================== Profile ====================

export function updateProfile(zipCode: string) {
  return fetchJSON<AuthUser>(`${BASE}/auth/profile`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ zip_code: zipCode }),
  });
}

// ==================== Pest Reports & Notifications ====================

export function postPestReport(pestId: string, cropId?: string, note?: string) {
  return fetchJSON<{ id: number; pest_id: string; notified_count?: number }>(`${BASE}/pest-reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pest_id: pestId, crop_id: cropId, note }),
  });
}

export function getNotifications() {
  return fetchJSON<NotificationsResponse>(`${BASE}/notifications`);
}

export function markNotificationRead(id: number) {
  return fetchJSON<{ ok: boolean }>(`${BASE}/notifications/${id}/read`, { method: 'POST' });
}

export function markAllNotificationsRead() {
  return fetchJSON<{ ok: boolean }>(`${BASE}/notifications/read-all`, { method: 'POST' });
}
