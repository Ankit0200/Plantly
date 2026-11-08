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

export interface Grower {
  name: string;
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

export interface CostSummary {
  baseline_usd: number;
  plan_usd: number;
  difference_usd: number;
  synthetic_n_lb_baseline: number;
  synthetic_n_lb_plan: number;
  pesticide_applications_baseline: number;
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
  baseline_cost_usd: number;
  plan_cost_usd: number;
  synthetic_n_lb_baseline: number;
  synthetic_n_lb_plan: number;
}

export interface Plan {
  grower_name: string;
  plots: PlotPlan[];
  totals: CostSummary;
  warnings: string[];
  data_version: string;
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
