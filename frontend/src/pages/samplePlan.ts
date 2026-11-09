// Generated from real engine output: backend/fixtures/diverse_farm.json, season spring.
// Regenerate rather than hand-edit, so the landing samples stay true to what the engine produces.
import type { CropRef, Plan } from '../types'

export const SAMPLE_PLAN: Plan = {
  "grower_name": "Sunny Acres Small Farm",
  "season": "spring",
  "data_version": "d1c9c81b",
  "plots": [
    {
      "plot_id": "A",
      "plot_name": "Front Field",
      "area_sqft": 21780,
      "crop_planned": "bush_bean",
      "crop_suggested": "bush_bean",
      "p_level": "high",
      "k_level": "high",
      "compost_cu_yd": 0.0,
      "lines": [
        {
          "category": "soil",
          "text": "Apply 436 lb of Agricultural lime 2-3 months before planting to raise pH from 6.0 toward 6.5.",
          "quantity": 435.6,
          "unit": "lb",
          "cost_usd": 43.56,
          "rule_id": "LIME-LOAM-03",
          "source_id": "SRC-PLACEHOLDER",
          "verified": false,
          "inputs_used": {
            "ph": 6.0,
            "soil_texture": "loam",
            "rate_lb_per_1000sqft": 20
          }
        },
        {
          "category": "feeding",
          "text": "Apply 43.6 lb Triple superphosphate 0-46-0 for 20.0 lb P2O5.",
          "quantity": 43.56,
          "unit": "lb",
          "cost_usd": 26.14,
          "rule_id": "NUT-P2O5-bush_bean",
          "source_id": "SRC-SE-VEG-HANDBOOK",
          "verified": false,
          "inputs_used": {
            "need_lb": 20.0376,
            "p_level": "high",
            "k_level": "high"
          }
        },
        {
          "category": "feeding",
          "text": "Apply 33.4 lb Muriate of potash 0-0-60 for 20.0 lb K2O.",
          "quantity": 33.4,
          "unit": "lb",
          "cost_usd": 8.4,
          "rule_id": "NUT-K2O-bush_bean",
          "source_id": "SRC-SE-VEG-HANDBOOK",
          "verified": false,
          "inputs_used": {
            "need_lb": 20.0376,
            "p_level": "high",
            "k_level": "high"
          }
        },
        {
          "category": "nutrient_warning",
          "text": "Last season added 40.0 lb P2O5 to soil already rated high for P. Skip P2O5 this season.",
          "quantity": null,
          "unit": null,
          "cost_usd": null,
          "rule_id": "STL-P",
          "source_id": "SRC-UGA-CROPSHEETS",
          "verified": false,
          "inputs_used": {
            "added_lb": 40.0,
            "level": "high"
          }
        },
        {
          "category": "nutrient_warning",
          "text": "Last season added 40.0 lb K2O to soil already rated high for K. Skip K2O this season.",
          "quantity": null,
          "unit": null,
          "cost_usd": null,
          "rule_id": "STL-K",
          "source_id": "SRC-UGA-CROPSHEETS",
          "verified": false,
          "inputs_used": {
            "added_lb": 40.0,
            "level": "high"
          }
        }
      ],
      "baseline_cost_usd": 160.0,
      "plan_cost_usd": 78.1,
      "synthetic_n_lb_baseline": 40.0,
      "synthetic_n_lb_plan": 0.0
    },
    {
      "plot_id": "B",
      "plot_name": "Side Garden",
      "area_sqft": 5000,
      "crop_planned": "squash",
      "crop_suggested": "squash",
      "p_level": "low",
      "k_level": "medium",
      "compost_cu_yd": 2.0,
      "lines": [
        {
          "category": "soil",
          "text": "Apply 125 lb of Agricultural lime 2-3 months before planting to raise pH from 5.8 toward 6.5.",
          "quantity": 125.0,
          "unit": "lb",
          "cost_usd": 12.5,
          "rule_id": "LIME-SANDY-02",
          "source_id": "SRC-PLACEHOLDER",
          "verified": false,
          "inputs_used": {
            "ph": 5.8,
            "soil_texture": "sandy",
            "rate_lb_per_1000sqft": 25
          }
        },
        {
          "category": "feeding",
          "text": "Spread 2.00 cu yd of compost.",
          "quantity": 2.0,
          "unit": "cu yd",
          "cost_usd": 0.0,
          "rule_id": "CRED-COMPOST",
          "source_id": "SRC-WSU-COMPOST",
          "verified": false,
          "inputs_used": {
            "cap_cu_yd_per_1000sqft": 0.4
          }
        },
        {
          "category": "feeding",
          "text": "At planting: Apply 9.2 lb Urea 46-0-0 for 4.2 lb N.",
          "quantity": 9.22,
          "unit": "lb",
          "cost_usd": 3.11,
          "rule_id": "squash",
          "source_id": "SRC-UGA-COMMERCIAL",
          "verified": false,
          "inputs_used": {
            "need_lb": 4.240500000000001,
            "p_level": "low",
            "k_level": "medium",
            "timing": "preplant"
          }
        },
        {
          "category": "feeding",
          "text": "Sidedress 1 (3-4 weeks after planting): Apply 6.2 lb Urea 46-0-0 for 2.9 lb N.",
          "quantity": 6.24,
          "unit": "lb",
          "cost_usd": 2.1,
          "rule_id": "squash",
          "source_id": "SRC-UGA-COMMERCIAL",
          "verified": false,
          "inputs_used": {
            "need_lb": 2.8698333333333337,
            "p_level": "low",
            "k_level": "medium",
            "timing": "sidedress_1"
          }
        },
        {
          "category": "feeding",
          "text": "Sidedress 2 (3-4 weeks after sidedress 1): Apply 6.2 lb Urea 46-0-0 for 2.9 lb N.",
          "quantity": 6.24,
          "unit": "lb",
          "cost_usd": 2.1,
          "rule_id": "squash",
          "source_id": "SRC-UGA-COMMERCIAL",
          "verified": false,
          "inputs_used": {
            "need_lb": 2.8698333333333337,
            "p_level": "low",
            "k_level": "medium",
            "timing": "sidedress_2"
          }
        },
        {
          "category": "feeding",
          "text": "Sidedress 3 (3-4 weeks after sidedress 2): Apply 6.2 lb Urea 46-0-0 for 2.9 lb N.",
          "quantity": 6.24,
          "unit": "lb",
          "cost_usd": 2.1,
          "rule_id": "squash",
          "source_id": "SRC-UGA-COMMERCIAL",
          "verified": false,
          "inputs_used": {
            "need_lb": 2.8698333333333337,
            "p_level": "low",
            "k_level": "medium",
            "timing": "sidedress_3"
          }
        },
        {
          "category": "feeding",
          "text": "Apply 21.3 lb Triple superphosphate 0-46-0 for 9.8 lb P2O5.",
          "quantity": 21.3,
          "unit": "lb",
          "cost_usd": 12.78,
          "rule_id": "NUT-P2O5-squash",
          "source_id": "SRC-SE-VEG-HANDBOOK",
          "verified": false,
          "inputs_used": {
            "need_lb": 9.799999999999999,
            "p_level": "low",
            "k_level": "medium"
          }
        }
      ],
      "baseline_cost_usd": 32.0,
      "plan_cost_usd": 34.69,
      "synthetic_n_lb_baseline": 8.0,
      "synthetic_n_lb_plan": 12.85
    },
    {
      "plot_id": "C",
      "plot_name": "Back Patch",
      "area_sqft": 3000,
      "crop_planned": "cabbage",
      "crop_suggested": "cabbage",
      "p_level": "very_high",
      "k_level": "very_high",
      "compost_cu_yd": 1.2,
      "lines": [
        {
          "category": "soil",
          "text": "No lime needed: pH 6.6 is at or above the 6.5 target.",
          "quantity": null,
          "unit": null,
          "cost_usd": null,
          "rule_id": "cabbage",
          "source_id": "SRC-UGA-COMMERCIAL",
          "verified": false,
          "inputs_used": {
            "ph": 6.6,
            "target_ph": 6.5
          }
        },
        {
          "category": "feeding",
          "text": "Spread 1.20 cu yd of compost.",
          "quantity": 1.2,
          "unit": "cu yd",
          "cost_usd": 0.0,
          "rule_id": "CRED-COMPOST",
          "source_id": "SRC-WSU-COMPOST",
          "verified": false,
          "inputs_used": {
            "cap_cu_yd_per_1000sqft": 0.4
          }
        },
        {
          "category": "feeding",
          "text": "At planting: Apply 9.7 lb Urea 46-0-0 for 4.5 lb N.",
          "quantity": 9.7,
          "unit": "lb",
          "cost_usd": 3.27,
          "rule_id": "cabbage",
          "source_id": "SRC-UGA-COMMERCIAL",
          "verified": false,
          "inputs_used": {
            "need_lb": 4.4639999999999995,
            "p_level": "very_high",
            "k_level": "very_high",
            "timing": "preplant"
          }
        },
        {
          "category": "feeding",
          "text": "Sidedress 1 (3-4 weeks after planting): Apply 7.3 lb Urea 46-0-0 for 3.3 lb N.",
          "quantity": 7.28,
          "unit": "lb",
          "cost_usd": 2.45,
          "rule_id": "cabbage",
          "source_id": "SRC-UGA-COMMERCIAL",
          "verified": false,
          "inputs_used": {
            "need_lb": 3.3479999999999994,
            "p_level": "very_high",
            "k_level": "very_high",
            "timing": "sidedress_1"
          }
        },
        {
          "category": "feeding",
          "text": "Sidedress 2 (3-4 weeks after sidedress 1): Apply 7.3 lb Urea 46-0-0 for 3.3 lb N.",
          "quantity": 7.28,
          "unit": "lb",
          "cost_usd": 2.45,
          "rule_id": "cabbage",
          "source_id": "SRC-UGA-COMMERCIAL",
          "verified": false,
          "inputs_used": {
            "need_lb": 3.3479999999999994,
            "p_level": "very_high",
            "k_level": "very_high",
            "timing": "sidedress_2"
          }
        },
        {
          "category": "nutrient_warning",
          "text": "Last season added 6.0 lb P2O5 to soil already rated very high for P. Skip P2O5 this season.",
          "quantity": null,
          "unit": null,
          "cost_usd": null,
          "rule_id": "STL-P",
          "source_id": "SRC-UGA-CROPSHEETS",
          "verified": false,
          "inputs_used": {
            "added_lb": 6.0,
            "level": "very_high"
          }
        },
        {
          "category": "nutrient_warning",
          "text": "Last season added 6.0 lb K2O to soil already rated very high for K. Skip K2O this season.",
          "quantity": null,
          "unit": null,
          "cost_usd": null,
          "rule_id": "STL-K",
          "source_id": "SRC-UGA-CROPSHEETS",
          "verified": false,
          "inputs_used": {
            "added_lb": 6.0,
            "level": "very_high"
          }
        }
      ],
      "baseline_cost_usd": 24.0,
      "plan_cost_usd": 8.17,
      "synthetic_n_lb_baseline": 6.0,
      "synthetic_n_lb_plan": 11.16
    },
    {
      "plot_id": "D",
      "plot_name": "Hill Plot",
      "area_sqft": 4000,
      "crop_planned": "sweet_corn",
      "crop_suggested": "sweet_corn",
      "p_level": "low",
      "k_level": "medium",
      "compost_cu_yd": 1.6,
      "lines": [
        {
          "category": "soil",
          "text": "Apply 200 lb of Agricultural lime 2-3 months before planting to raise pH from 5.2 toward 6.5.",
          "quantity": 200.0,
          "unit": "lb",
          "cost_usd": 20.0,
          "rule_id": "LIME-LOAM-01",
          "source_id": "SRC-PLACEHOLDER",
          "verified": false,
          "inputs_used": {
            "ph": 5.2,
            "soil_texture": "loam",
            "rate_lb_per_1000sqft": 50
          }
        },
        {
          "category": "feeding",
          "text": "Spread 1.60 cu yd of compost.",
          "quantity": 1.6,
          "unit": "cu yd",
          "cost_usd": 0.0,
          "rule_id": "CRED-COMPOST",
          "source_id": "SRC-WSU-COMPOST",
          "verified": false,
          "inputs_used": {
            "cap_cu_yd_per_1000sqft": 0.4
          }
        },
        {
          "category": "feeding",
          "text": "At planting: Apply 7.0 lb Urea 46-0-0 for 3.2 lb N.",
          "quantity": 7.03,
          "unit": "lb",
          "cost_usd": 2.37,
          "rule_id": "sweet_corn",
          "source_id": "SRC-UGA-COMMERCIAL",
          "verified": false,
          "inputs_used": {
            "need_lb": 3.2340000000000004,
            "p_level": "low",
            "k_level": "medium",
            "timing": "preplant"
          }
        },
        {
          "category": "feeding",
          "text": "Sidedress 1 (3-4 weeks after planting): Apply 7.1 lb Urea 46-0-0 for 3.3 lb N.",
          "quantity": 7.14,
          "unit": "lb",
          "cost_usd": 2.41,
          "rule_id": "sweet_corn",
          "source_id": "SRC-UGA-COMMERCIAL",
          "verified": false,
          "inputs_used": {
            "need_lb": 3.2830000000000004,
            "p_level": "low",
            "k_level": "medium",
            "timing": "sidedress_1"
          }
        },
        {
          "category": "feeding",
          "text": "Sidedress 2 (3-4 weeks after sidedress 1): Apply 7.1 lb Urea 46-0-0 for 3.3 lb N.",
          "quantity": 7.14,
          "unit": "lb",
          "cost_usd": 2.41,
          "rule_id": "sweet_corn",
          "source_id": "SRC-UGA-COMMERCIAL",
          "verified": false,
          "inputs_used": {
            "need_lb": 3.2830000000000004,
            "p_level": "low",
            "k_level": "medium",
            "timing": "sidedress_2"
          }
        },
        {
          "category": "feeding",
          "text": "Apply 19.0 lb Triple superphosphate 0-46-0 for 8.8 lb P2O5.",
          "quantity": 19.04,
          "unit": "lb",
          "cost_usd": 11.43,
          "rule_id": "NUT-P2O5-sweet_corn",
          "source_id": "SRC-SE-VEG-HANDBOOK",
          "verified": false,
          "inputs_used": {
            "need_lb": 8.759999999999998,
            "p_level": "low",
            "k_level": "medium"
          }
        },
        {
          "category": "feeding",
          "text": "Apply 0.5 lb Muriate of potash 0-0-60 for 0.3 lb K2O.",
          "quantity": 0.47,
          "unit": "lb",
          "cost_usd": 0.12,
          "rule_id": "NUT-K2O-sweet_corn",
          "source_id": "SRC-SE-VEG-HANDBOOK",
          "verified": false,
          "inputs_used": {
            "need_lb": 0.27999999999999936,
            "p_level": "low",
            "k_level": "medium"
          }
        }
      ],
      "baseline_cost_usd": 40.0,
      "plan_cost_usd": 38.74,
      "synthetic_n_lb_baseline": 10.0,
      "synthetic_n_lb_plan": 9.8
    },
    {
      "plot_id": "E",
      "plot_name": "Creek Bottom",
      "area_sqft": 2000,
      "crop_planned": "tomato",
      "crop_suggested": "cabbage",
      "p_level": "very_high",
      "k_level": "very_high",
      "compost_cu_yd": 0.8,
      "lines": [
        {
          "category": "rotation",
          "text": "This bed has a history of Early Blight; planting a nightshade-family crop here increases risk.",
          "quantity": null,
          "unit": null,
          "cost_usd": null,
          "rule_id": "ROT-03",
          "source_id": "SRC-UMN-EARLYBLIGHT",
          "verified": false,
          "inputs_used": {
            "problem": "early-blight",
            "crop_planned": "tomato"
          }
        },
        {
          "category": "rotation",
          "text": "Suggested instead: Cabbage (brassica family).",
          "quantity": null,
          "unit": null,
          "cost_usd": null,
          "rule_id": "ROT-03",
          "source_id": "SRC-SARE-ROTATION",
          "verified": false,
          "inputs_used": {
            "blocked_families": [
              "cucurbit",
              "legume",
              "nightshade"
            ],
            "options": [
              "cabbage",
              "carrot",
              "okra",
              "sweet_corn"
            ]
          }
        },
        {
          "category": "soil",
          "text": "No lime needed: pH 6.9 is at or above the 6.5 target.",
          "quantity": null,
          "unit": null,
          "cost_usd": null,
          "rule_id": "cabbage",
          "source_id": "SRC-UGA-COMMERCIAL",
          "verified": false,
          "inputs_used": {
            "ph": 6.9,
            "target_ph": 6.5
          }
        },
        {
          "category": "feeding",
          "text": "Credit 0.9 lb N left by last year's bush bean.",
          "quantity": 0.92,
          "unit": "lb N",
          "cost_usd": null,
          "rule_id": "CRED-LEGUME",
          "source_id": "SRC-UW-NCREDIT",
          "verified": false,
          "inputs_used": {
            "crop_last_year": "bush_bean",
            "credit_lb_per_1000sqft": 0.46
          }
        },
        {
          "category": "feeding",
          "text": "Spread 0.80 cu yd of compost.",
          "quantity": 0.8,
          "unit": "cu yd",
          "cost_usd": 0.0,
          "rule_id": "CRED-COMPOST",
          "source_id": "SRC-WSU-COMPOST",
          "verified": false,
          "inputs_used": {
            "cap_cu_yd_per_1000sqft": 0.4
          }
        },
        {
          "category": "feeding",
          "text": "At planting: Apply 5.7 lb Urea 46-0-0 for 2.6 lb N.",
          "quantity": 5.67,
          "unit": "lb",
          "cost_usd": 1.91,
          "rule_id": "cabbage",
          "source_id": "SRC-UGA-COMMERCIAL",
          "verified": false,
          "inputs_used": {
            "need_lb": 2.608,
            "p_level": "very_high",
            "k_level": "very_high",
            "timing": "preplant"
          }
        },
        {
          "category": "feeding",
          "text": "Sidedress 1 (3-4 weeks after planting): Apply 4.3 lb Urea 46-0-0 for 2.0 lb N.",
          "quantity": 4.25,
          "unit": "lb",
          "cost_usd": 1.43,
          "rule_id": "cabbage",
          "source_id": "SRC-UGA-COMMERCIAL",
          "verified": false,
          "inputs_used": {
            "need_lb": 1.9559999999999997,
            "p_level": "very_high",
            "k_level": "very_high",
            "timing": "sidedress_1"
          }
        },
        {
          "category": "feeding",
          "text": "Sidedress 2 (3-4 weeks after sidedress 1): Apply 4.3 lb Urea 46-0-0 for 2.0 lb N.",
          "quantity": 4.25,
          "unit": "lb",
          "cost_usd": 1.43,
          "rule_id": "cabbage",
          "source_id": "SRC-UGA-COMMERCIAL",
          "verified": false,
          "inputs_used": {
            "need_lb": 1.9559999999999997,
            "p_level": "very_high",
            "k_level": "very_high",
            "timing": "sidedress_2"
          }
        },
        {
          "category": "nutrient_warning",
          "text": "Last season added 4.0 lb P2O5 to soil already rated very high for P. Skip P2O5 this season.",
          "quantity": null,
          "unit": null,
          "cost_usd": null,
          "rule_id": "STL-P",
          "source_id": "SRC-UGA-CROPSHEETS",
          "verified": false,
          "inputs_used": {
            "added_lb": 4.0,
            "level": "very_high"
          }
        },
        {
          "category": "nutrient_warning",
          "text": "Last season added 4.0 lb K2O to soil already rated very high for K. Skip K2O this season.",
          "quantity": null,
          "unit": null,
          "cost_usd": null,
          "rule_id": "STL-K",
          "source_id": "SRC-UGA-CROPSHEETS",
          "verified": false,
          "inputs_used": {
            "added_lb": 4.0,
            "level": "very_high"
          }
        }
      ],
      "baseline_cost_usd": 16.0,
      "plan_cost_usd": 4.77,
      "synthetic_n_lb_baseline": 4.0,
      "synthetic_n_lb_plan": 6.52
    }
  ],
  "totals": {
    "baseline_usd": 272.0,
    "plan_usd": 164.47,
    "difference_usd": -107.53,
    "synthetic_n_lb_baseline": 68.0,
    "synthetic_n_lb_plan": 40.33,
    "pesticide_applications_baseline": 17,
    "wasted_baseline_p2o5_lb": 50.0,
    "wasted_baseline_k2o_lb": 50.0,
    "savings_breakdown_usd": {
      "skipped_p_k": 39.56,
      "legume_credit": 0.67,
      "compost_credit": 45.84,
      "product_choice": 21.46
    }
  },
  "warnings": []
}

export const SAMPLE_CROPS: CropRef[] = [
  {
    "id": "tomato",
    "name": "Tomato",
    "family": "nightshade",
    "n_demand": "heavy"
  },
  {
    "id": "pepper",
    "name": "Pepper",
    "family": "nightshade",
    "n_demand": "medium"
  },
  {
    "id": "eggplant",
    "name": "Eggplant",
    "family": "nightshade",
    "n_demand": "medium"
  },
  {
    "id": "potato",
    "name": "Potato",
    "family": "nightshade",
    "n_demand": "heavy"
  },
  {
    "id": "cabbage",
    "name": "Cabbage",
    "family": "brassica",
    "n_demand": "heavy"
  },
  {
    "id": "broccoli",
    "name": "Broccoli",
    "family": "brassica",
    "n_demand": "heavy"
  },
  {
    "id": "collards",
    "name": "Collards",
    "family": "brassica",
    "n_demand": "medium"
  },
  {
    "id": "kale",
    "name": "Kale",
    "family": "brassica",
    "n_demand": "medium"
  },
  {
    "id": "squash",
    "name": "Squash",
    "family": "cucurbit",
    "n_demand": "medium"
  },
  {
    "id": "cucumber",
    "name": "Cucumber",
    "family": "cucurbit",
    "n_demand": "medium"
  },
  {
    "id": "watermelon",
    "name": "Watermelon",
    "family": "cucurbit",
    "n_demand": "medium"
  },
  {
    "id": "bush_bean",
    "name": "Bush Bean",
    "family": "legume",
    "n_demand": "fixer"
  },
  {
    "id": "southern_pea",
    "name": "Southern Pea",
    "family": "legume",
    "n_demand": "fixer"
  },
  {
    "id": "snap_pea",
    "name": "Snap Pea",
    "family": "legume",
    "n_demand": "fixer"
  },
  {
    "id": "onion",
    "name": "Onion",
    "family": "allium",
    "n_demand": "heavy"
  },
  {
    "id": "garlic",
    "name": "Garlic",
    "family": "allium",
    "n_demand": "medium"
  },
  {
    "id": "sweet_corn",
    "name": "Sweet Corn",
    "family": "grass",
    "n_demand": "medium"
  },
  {
    "id": "lettuce",
    "name": "Lettuce",
    "family": "aster",
    "n_demand": "heavy"
  },
  {
    "id": "carrot",
    "name": "Carrot",
    "family": "carrot",
    "n_demand": "medium"
  },
  {
    "id": "okra",
    "name": "Okra",
    "family": "mallow",
    "n_demand": "medium"
  },
  {
    "id": "sweet_potato",
    "name": "Sweet Potato",
    "family": "morning_glory",
    "n_demand": "heavy"
  }
]
