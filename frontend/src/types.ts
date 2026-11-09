export interface SoilTest {
  ph: number;
  p_ppm: number;
  k_ppm: number;
  organic_matter_pct: number;
  lab_lime_lb_per_1000sqft?: number | null;
}

export interface BaselineInput {
  product_id: string;
  amount_lb: number;
}

export interface Baseline {
  inputs: BaselineInput[];
  pesticide_applications: number;
}

export interface Plot {
  id: string;
  name: string;
  area_sqft: number;
  soil_texture: 'sandy' | 'loam' | 'clay';
  soil_test: SoilTest;
  crop_two_years_ago: string | null;
  crop_last_year: string;
  crop_planned: string;
  problems: string[];
  baseline: Baseline;
}

export type Season = 'spring' | 'summer' | 'fall' | 'winter';

export function defaultSeason(): Season {
  const m = new Date().getMonth() // 0-11
  if (m >= 1 && m <= 3) return 'spring'   // Feb-Apr
  if (m >= 4 && m <= 6) return 'summer'   // May-Jul
  if (m >= 7 && m <= 9) return 'fall'     // Aug-Oct
  return 'winter'                          // Nov-Jan
}

export interface Grower {
  name: string;
  season: Season;
  plots: Plot[];
  crops_needed: string[];
  compost_available_cu_yd: number;
  compost_price_usd_per_cu_yd: number;
  price_overrides: Record<string, number>;
}

export interface CropRef {
  id: string;
  name: string;
  family: string;
  n_demand: string;
}

export interface ProblemRef {
  id: string;
  name: string;
  kind: string;
  affects_families: string[];
}

export interface ProductRef {
  id: string;
  name: string;
  type: string;
  role: string | null;
}

export interface ReferenceData {
  crops: CropRef[];
  problems: ProblemRef[];
  products: ProductRef[];
  data_version: string;
  unverified_count: number;
}

export interface PlanLine {
  category: string;
  text: string;
  quantity: number | null;
  unit: string | null;
  cost_usd: number | null;
  rule_id: string;
  source_id: string;
  verified: boolean;
  inputs_used: Record<string, unknown>;
}

export interface SavingsBreakdown {
  skipped_p_k: number;
  legume_credit: number;
  compost_credit: number;
  product_choice: number;
}

export interface CostSummary {
  baseline_usd: number;
  plan_usd: number;
  difference_usd: number;
  synthetic_n_lb_baseline: number;
  synthetic_n_lb_plan: number;
  pesticide_applications_baseline: number;
  wasted_baseline_p2o5_lb?: number;
  wasted_baseline_k2o_lb?: number;
  savings_breakdown_usd?: SavingsBreakdown;
}

export interface PlotPlan {
  plot_id: string;
  plot_name: string;
  area_sqft: number;
  crop_planned: string;
  crop_suggested: string;
  p_level: string;
  k_level: string;
  compost_cu_yd: number;
  lines: PlanLine[];
  baseline_cost_usd: number | null;
  plan_cost_usd: number;
  synthetic_n_lb_baseline: number;
  synthetic_n_lb_plan: number;
}

export interface Plan {
  grower_name: string;
  season?: Season;
  plots: PlotPlan[];
  totals: CostSummary;
  warnings: string[];
  data_version: string;
  plan_record_id?: number;
}

export interface DataStatusRow {
  file: string;
  id: string;
  verified: boolean;
  source: string | null;
}

export interface DataStatus {
  rows: DataStatusRow[];
  counts: Record<string, { verified: number; total: number }>;
  warnings: string[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ToolUsage {
  tool: string;
  input: Record<string, unknown>;
  is_error: boolean;
}

export interface ChatResponse {
  reply: string;
  tools_used: ToolUsage[];
  unsupported_numbers: number[];
}

export interface IntakeResponse {
  draft: Grower;
  errors: string[];
}

// ==================== Auth types ====================

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  zip_code: string | null;
}

export interface NotificationItem {
  id: number;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
}

export interface NotificationsResponse {
  notifications: NotificationItem[];
  unread_count: number;
}

// ==================== Implemented items ====================

export interface ImplementedItemData {
  id: number;
  plan_id: number;
  plot_id: string;
  plot_name: string;
  line_index: number;
  category: string;
  rule_id: string;
  source_id: string | null;
  text: string;
  quantity: number | null;
  unit: string | null;
  cost_usd: number | null;
  actual_quantity: number | null;
  actual_unit: string | null;
  actual_date: string | null;
  actual_note: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface ImplementedSummary {
  items: ImplementedItemData[];
  count: number;
  total_cost_usd: number;
}

export interface PendingItemChange {
  item_id: number;
  plot_id: string;
  plot_name: string;
  text: string;
  planned_quantity: number | null;
  planned_unit: string | null;
  actual_quantity?: number;
  actual_unit?: string;
  actual_date?: string;
  actual_note?: string;
}

// ==================== Plan history types ====================

export interface PlanSummaryItem {
  id: number;
  title: string;
  season?: Season;
  created_at: string;
  data_version: string;
  crops: string[];
  totals: CostSummary;
  plot_crops?: Record<string, string>;
}

export interface SavedConversation {
  id: number;
  title: string;
  context?: string;
  created_at: string;
  messages: {
    role: string;
    content: string;
    tools_used: ToolUsage[];
    unsupported_numbers: number[];
  }[];
}

export interface SavedPlanDetail {
  id: number;
  title: string;
  created_at: string;
  grower_json: Grower;
  plan_json: Plan;
  data_version: string;
  stale: boolean;
  conversations: SavedConversation[];
}

export interface PlanChatResponse {
  conversation_id: number;
  reply: string;
  tools_used: ToolUsage[];
  unsupported_numbers: number[];
  stale: boolean;
  attachment_id?: number | null;  // id of the photo sent with this message, if any
}

export interface HistoryItem {
  kind: 'plan' | 'event';
  id: number;
  title?: string;
  type?: string;
  payload?: Record<string, unknown>;
  plan_id?: number;
  timestamp: string;
  totals?: CostSummary;
}
