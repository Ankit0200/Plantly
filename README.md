# Plantly

**Research-backed growing plans for home gardeners and small farms.**

Plantly turns a grower's soil test, crop history, plots and budget into a seasonal plan: how much lime and fertilizer to apply, when, what it will cost, and which crop fits each bed. Every line of the plan comes from a deterministic engine built on university extension guidance and links back to its source. AI handles the conversation (describing your farm, asking "why?"), not the agronomy math.

> Plantly is planning support, not certified agronomic advice. Your results depend on your soil, crops, weather and prices.

---

## Features

- **Conversational intake.** Describe your plots in plain English, or upload a soil-test PDF or photo, and Plantly extracts the data. Manual entry and a demo farm are also available.
- **Soil-based plans.** Lime to reach the crop's target pH, plus nitrogen, phosphorus and potassium rates, split into a feeding schedule around the planting date.
- **Skips what you don't need.** If a soil test shows phosphorus or potassium is already high, the plan says to skip it, with a warning.
- **Credits what you have.** Compost you spread and nitrogen left by last year's legumes are counted before anything is bought.
- **Rotation-aware.** Tracks crop families across years, flags disease and pest risks (for example, nightshades after early blight), and suggests an alternative crop.
- **Cost tracking.** Plan cost against last season, and where the savings come from (skipped P/K, compost and legume credits, cheaper products).
- **"Why?" on every line.** Each recommendation shows its rule ID and source, with a plain-English explanation on request.
- **Plan chat.** Ask questions about your plan, try "what if" changes, and log what you actually applied. Answers are restricted to numbers returned by the engine.
- **Crop recommendations.** Side-by-side alternatives per plot, with a cost report for each.
- **Pest alerts.** Report a pest and nearby growers (within 10 miles, by ZIP code) get a notification.
- **History and tracking.** Saved plans, a record of what you implemented, and an activity timeline.

Not built yet: weather and forecast integration, irrigation planning, sensors (see [TODO.md](TODO.md)).

---

## How it works

```
 Grower input ──► AI intake (Gemini) ──► grower JSON ──► Soil engine (deterministic) ──► Plan
 (text / PDF)                                             backend/engine/soil_engine.py      │
                                                          + research data backend/data/*.yaml │
                                                                                              ▼
                              Plan chat (Gemini or Claude) ◄── tools: get_plan, run_what_if,
                              answers only with engine numbers     explain_rule, lookup_data, ...
```

- **Engine:** `backend/engine/soil_engine.py` reads the YAML research data (crops, lime tables, nutrient recommendations, soil-test levels, credits, rotation rules, products and prices) and builds the plan. It makes no AI calls, so the same input always gives the same plan.
- **AI layer:** `backend/ai/`. Gemini handles intake, recommendations and explanations. Plan chat runs a tool-calling loop on Gemini by default, or on Claude if you configure it. A guard flags any number in a chat answer that no tool returned.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 6, plain CSS (design tokens in `frontend/src/styles.css`) |
| Backend | Python, Flask 3, Flask-SQLAlchemy (SQLite), Flask-Login |
| AI | Google Gemini (`google-genai`), optionally Anthropic Claude (`anthropic`) |
| Data | YAML research files, US ZIP centroids CSV |
| Tests | pytest |

---

## Project structure

```
Plantly/
├── backend/
│   ├── app.py               # Flask app and all /api routes
│   ├── models.py            # SQLAlchemy models (users, farms, plots, plans, chats, pest reports...)
│   ├── engine/soil_engine.py# Deterministic planning engine
│   ├── ai/
│   │   ├── gemini.py        # Shared Gemini client + chat adapter
│   │   ├── chat.py          # Plan chat tool loop (Gemini or Claude)
│   │   ├── ai_tools.py      # Tools the chat can call
│   │   └── intake.py        # Conversational and file intake
│   ├── data/                # Research data (YAML) and sources
│   ├── fixtures/            # Example growers (demo_grower.json, diverse_farm.json...)
│   ├── tests/               # pytest suite
│   ├── requirements.txt
│   └── .env.example         # Copy to .env and add your keys
└── frontend/
    ├── src/
    │   ├── App.tsx          # App shell and screen flow
    │   ├── pages/           # Landing, Login, Intake, Confirm, Plan, History, Profile
    │   ├── components/      # PlotCard, CostTable, PlanSummary, CropSelect, ChatPanel...
    │   ├── api.ts           # API client
    │   └── styles.css       # Theme tokens and app styles
    └── public/images/       # Logo and hero artwork
```

---

## Getting started

### Prerequisites

- **Python 3.12** (3.10+ should work)
- **Node.js 20+** and npm
- A **Gemini API key** from [Google AI Studio](https://aistudio.google.com/apikey) for the AI features. Plans, costs and the rest of the app work without one.

### 1. Backend

```bash
cd backend
python -m venv .venv
# Windows (PowerShell):  .\.venv\Scripts\Activate.ps1
# macOS / Linux:         source .venv/bin/activate
pip install -r requirements.txt

# Settings: copy the example and add your Gemini key
cp .env.example .env            # PowerShell: Copy-Item .env.example .env

# One time: create the demo account and sample data
flask --app app seed-demo

# Run the API on port 5001 (the frontend proxies /api here)
flask --app app run --port 5001
```

### 2. Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. The login form is pre-filled with the demo account:

| Email | Password |
|---|---|
| `demo@plantly.test` | `demo-pass-123` |

---

## Configuration

Settings live in `backend/.env`, which is loaded at startup and ignored by git. Variables set in your shell take precedence. See [`backend/.env.example`](backend/.env.example) for the full list.

| Variable | Default | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | – | Intake, recommendations, "Why?" explanations, plan chat |
| `CHAT_PROVIDER` | `gemini` if no Anthropic key | `gemini` or `anthropic` for plan chat |
| `ANTHROPIC_API_KEY` | – | Optional, to use Claude for plan chat |
| `GEMINI_MODEL` | `gemini-3-flash-preview` | Gemini model |
| `CLAUDE_MODEL` | `claude-sonnet-5-5` | Claude model |
| `SECRET_KEY` | dev value | Session signing; **set a random value in production** |
| `FLASK_ENV` | – | `production` makes session cookies HTTPS-only |
| `SOIL_DATA_DIR` | `backend/data` | Research data folder |

---

## Useful commands

| Where | Command | What it does |
|---|---|---|
| `backend/` | `flask --app app run --port 5001` | Start the API |
| `backend/` | `flask --app app seed-demo` | Create the demo account (safe to re-run) |
| `backend/` | `python -m pytest -q` | Run the backend tests |
| `frontend/` | `npm run dev` | Start the dev server with hot reload |
| `frontend/` | `npm run build` | Typecheck and build to `frontend/dist` |
| `frontend/` | `npm run preview` | Serve the production build locally |

To reset local data, stop the backend, delete `backend/instance/plantly.db`, start it again and re-run `seed-demo`.

---

## Research data and sources

The engine's numbers come from the YAML files in `backend/data/`, which cite university extension and USDA sources (UGA Extension, Clemson HGIC, SE Vegetable Handbook, SARE, WSU Extension, USDA NRCS, Oregon State, UW Madison, NC State, UMN Extension and others) listed in `sources.yaml`.

Each source has a `verified` flag that stays `false` until a teammate has opened the reference and confirmed the details. Most are not verified yet, and one placeholder source (`SRC-PLACEHOLDER`) still needs replacing. Treat the outputs accordingly.

---

## Known issues

- 20 backend tests fail because they expect an older three-plot version of `fixtures/demo_grower.json`; the fixture now has one plot. The engine itself is unaffected.
- Weather Tracking on the landing page is marked "Coming later"; there is no weather integration yet.
- Some research sources are unverified (see above).

---

## Contributing

1. Create a branch from `main`.
2. Never commit `backend/.env` or other secrets. `.gitignore` already excludes `.env`, virtual environments, the local database and uploads.
3. Run `npm run build` (typecheck + build) and `python -m pytest -q` before opening a pull request.
4. Open a pull request into `main`.
