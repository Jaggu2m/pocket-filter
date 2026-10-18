# AI-Driven Personal Finance Copilot — Implementation Roadmap & Status

This document tracks the phased development roadmap of the AI-Driven Personal Finance Copilot platform across the **Track**, **Plan**, **Achieve**, and **AI Copilot** functional pillars.

---

## 🗺️ Release Milestones Overview

```
PHASE 0: Product & Architecture                          [ COMPLETED ]
    ↓
PHASE 1: Backend Foundation & Authentication             [ COMPLETED ]
    ↓
PHASE 2: Financial Account Management                    [ COMPLETED ]
    ↓
PHASE 3: Transaction Management                          [ COMPLETED ]
    ↓
PHASE 4: Statement Import & Ingestion (CSV/PDF)          [ COMPLETED ]
    ↓
PHASE 5: Smart Categorization
    ↓
PHASE 6: Financial Dashboard & Analytics
    ↓
PHASE 7: Budget Management
    ↓
PHASE 8: Monthly Goals & Goal Funding
───────────────────────────────────────────────────────────────────────
                      🏁 MVP COMPLETE (Phase 1–8)
───────────────────────────────────────────────────────────────────────
    ↓
PHASE 9: Budget Pace & Recurring Payments
    ↓
PHASE 10: Forecasting & Anomaly Detection
    ↓
PHASE 11: Yearly Goals & Goal Intelligence
    ↓
PHASE 12: Goal-Aware Spending Engine
    ↓
PHASE 13: What-If Simulator & Goal Impact Analysis
───────────────────────────────────────────────────────────────────────
                      🚀 VERSION 1.0 (V1) COMPLETE
───────────────────────────────────────────────────────────────────────
    ↓
PHASE 14: React Native Mobile Application
    ↓
PHASE 15: Long-Term Bucket List Goals
    ↓
PHASE 16: AI Finance Copilot (Conversational Engine)     [ COMPLETED ]
    ↓
PHASE 17: AI Spending Insights & Smart Notifications    [ COMPLETED ]
    ↓
PHASE 18: Security Hardening, Testing & Production Infra
───────────────────────────────────────────────────────────────────────
                      🌟 VERSION 2.0 (V2) COMPLETE
───────────────────────────────────────────────────────────────────────
```

---

## Phase 0 — Product Architecture & Specification
- [x] Define continuous financial lifecycle (Track → Plan → Achieve → AI Copilot)
- [x] Specify hybrid data ingestion strategy (Account Aggregator, PDF/CSV parsing, notifications, manual ledger)
- [x] Specify mathematical formulation for budget pacing, month-end forecasting, and goal delay modeling
- [x] Decouple deterministic financial calculation engine from probabilistic LLM conversational layer
- [x] Define 26-capability feature taxonomy and release phasing (MVP, V1, V2)

---

## Phase 1 — Backend Foundation & Authentication
**Goal:** Build the production-style Node.js / Express foundation with strict TypeScript, PostgreSQL, and Redis.

### Project Setup
- [x] Initialize Node.js + TypeScript
- [x] Configure Express
- [x] Configure ESLint
- [x] Configure Prettier
- [x] Configure environment variables (`src/config/env.ts` with Zod validation)
- [x] Create application bootstrap (`src/server.ts` with graceful shutdown)
- [x] Create error-handling middleware (`src/middlewares/error.middleware.ts`, `src/errors/app-error.ts`)
- [x] Create request logging (`src/middlewares/logger.middleware.ts`)
- [x] Create validation middleware (`src/middlewares/validate.middleware.ts` with Zod)

### Architecture
- [x] Controller layer (`src/controllers/auth.controller.ts`, `src/controllers/health.controllers.ts`)
- [x] Service layer (`src/services/auth.service.ts`, `src/services/session.service.ts`, `src/services/health.service.ts`)
- [x] Repository layer (`src/repositories/user.repository.ts`)
- [x] Route layer (`src/routes/auth.routes.ts`, `src/routes/health.routes.ts`)
- [x] Database layer (`src/db/schema.sql`, `src/db/migrate.ts`, `src/config/database.ts`, `src/config/redis.ts`)
- [x] Shared utilities (`src/utils/response.ts`, `src/utils/password.ts`, `src/utils/jwt.ts`)

### Authentication
- [x] User registration (`POST /api/auth/register`)
- [x] Login (`POST /api/auth/login`)
- [x] Password hashing (`bcryptjs` with 12 salt rounds)
- [x] JWT authentication (Bearer access token verification)
- [x] Refresh-token / session strategy (`src/services/session.service.ts` using Redis with token rotation)
- [x] Logout (`POST /api/auth/logout` revoking Redis session)
- [x] Authentication middleware (`src/middlewares/auth.middleware.ts`)
- [x] User profile (`GET /api/auth/profile`, `PATCH /api/auth/profile`)

**Deliverable:**
```
Register ──► Login ──► Receive JWT & Redis Session ──► Access Protected APIs
```
*Status: 100% Completed & Verified with Integration Tests (`npm run test:auth`)*

---

## Phase 2 — Financial Account Management
**Goal:** Establish the user's financial sources with full flexibility (Adding accounts/cards is **100% optional & non-mandatory**).
- [x] Design accounts table (`id`, `user_id`, `name`, `type`, `balance`, `currency`, `credit_limit`, `is_archived`, `is_default`)
- [x] Create account repository (`src/repositories/account.repository.ts`)
- [x] Create account service (`src/services/account.service.ts`)
- [x] Create account controller (`src/controllers/account.controller.ts`)
- [x] Create account routes (`src/routes/account.routes.ts`)
- [x] Add bank account (`POST /api/accounts` with `type: 'bank'`)
- [x] Add credit card (`POST /api/accounts` with `type: 'credit_card'`)
- [x] Add cash account (`POST /api/accounts` with `type: 'cash'`)
- [x] Add UPI / wallet account (`POST /api/accounts` with `type: 'upi_wallet'`)
- [x] Edit account (`PATCH /api/accounts/:id`)
- [x] Delete / archive account (`DELETE /api/accounts/:id` and `POST /api/accounts/:id/archive`)
- [x] View account balances & financial summary (`GET /api/accounts/summary`)
- [x] Associate accounts with authenticated users & enforce strict cross-user tenant isolation
- [x] Graceful zero-account handling (accounts and cards are completely optional; 0 accounts returns empty list and 0 summary)

**Deliverable:**
```
User (Accounts are purely OPTIONAL)
 ├── (Optional) Bank Account
 ├── (Optional) Credit Card
 ├── (Optional) Cash
 └── (Optional) UPI / Wallet
```
*Status: 100% Completed & Verified with Integration Tests (`npm run test:accounts`)*

---

## Phase 3 — Transaction Management
**Goal:** Build the core financial ledger (Supports both unlinked/cash tracking and optional account synchronization).
- [x] Design transaction schema (`id`, `user_id`, `account_id`, `to_account_id`, `type`, `amount`, `currency`, `category`, `merchant`, `description`, `date`, `payment_rail`, `is_recurring`, `tags`)
- [x] Define transaction types
  - [x] Income
  - [x] Expense
  - [x] Transfer (atomic inter-account transfers)
- [x] Create transaction repository (`src/repositories/transaction.repository.ts`)
- [x] Create transaction service with atomic balance synchronization (`src/services/transaction.service.ts`)
- [x] Create transaction APIs & validation (`src/routes/transaction.routes.ts`, `src/schemas/transaction.schema.ts`)
- [x] Add transaction (`POST /api/transactions`)
- [x] Edit transaction with balance delta adjustments (`PATCH /api/transactions/:id`)
- [x] Delete transaction with balance reversal (`DELETE /api/transactions/:id`)
- [x] View transaction (`GET /api/transactions/:id`)
- [x] List transactions (`GET /api/transactions`)
- [x] Search transactions (keyword matching against merchant, description, category)
- [x] Filter by date range (`startDate`, `endDate`)
- [x] Filter by account (`accountId`)
- [x] Filter by category (`category`)
- [x] Sort transactions (`sortBy=date|amount|created_at`, `sortOrder=ASC|DESC`)
- [x] Pagination with total count (`limit`, `offset`)
- [x] Validate transaction amounts & transfer constraints
- [x] Prevent invalid account ownership (strict cross-user tenant isolation)

**Deliverable:**
```
Transaction (Income / Expense / Transfer / Unlinked)
      ↓
Atomic Balance Sync (Optional linked account)
      ↓
Double-Entry Ledger Output
```
*Status: 100% Completed & Verified with Integration Tests (`npm run test:transactions`)*

---

## Phase 4 — Statement Import & Transaction Ingestion
**Goal:** Ingest external bank statements to eliminate manual logging overhead.
### CSV Ingestion
- [x] CSV upload endpoint
- [x] File validation (MIME, size, and binary-content checks)
- [x] Column auto-detection (Date, Description, Debit, Credit, Balance)
- [x] Transaction extraction
- [x] Date normalization
- [x] Amount normalization
- [x] Merchant extraction

### PDF Ingestion
- [x] PDF upload endpoint
- [x] PDF validation
- [x] Text extraction
- [x] OCR fallback for scanned PDFs through configurable `OCR_ENDPOINT`
- [x] Transaction extraction
- [x] Generic Indian bank-statement parsing rules (date, debit/credit, narration, amount)

### Import Workflow
- [x] Preview extracted transactions
- [x] Detect malformed rows
- [x] Detect duplicates (hash-based transaction deduplication)
- [x] Allow user review and corrections
- [x] Confirm import and batch persist
- [x] Ingestion history logging

**Deliverable:**
```
Bank Statement (PDF / CSV)
            ↓
          Parser
            ↓
  Normalized Transactions
            ↓
       User Review
            ↓
        Database
```

---

## Phase 5 — Smart Categorization
**Goal:** Automatically classify transactions into financial taxonomy.
- [x] Define category taxonomy (Food & Dining, Utilities, Travel, Shopping, etc.)
- [x] Create categories database table
- [x] Merchant string normalization (regex & token cleaning)
- [x] Keyword matching (MCC mapping reserved until MCC data is ingested)
- [x] Merchant mapping rules engine
- [x] Category assignment with confidence scoring
- [x] User category correction override
- [x] Store categorization corrections per user
- [x] Reapply learned merchant rules
- [x] Handle unknown merchants fallback
- [x] TF-IDF feature extraction & per-user classifier for ambiguous strings

**Deliverable:**
```
"UPI-PAYTM-SWIGGY-BANGALORE-4089" ──► Merchant Normalization ──► "Food & Dining"
```

---

## Phase 6 — Financial Dashboard & Analytics
**Goal:** Give users clear visibility into their monthly cash flow and spending distribution.
- [x] Calculate monthly income
- [x] Calculate monthly expenses
- [x] Calculate monthly net savings
- [x] Calculate savings rate percentage
- [x] Category breakdown calculation
- [x] Spending by account
- [x] Spending distribution by day / week / month
- [x] Month-over-month comparison
- [x] Category variance analysis
- [x] Historical burn rate analytics
- [x] Largest transactions detection
- [x] Top spending categories summary

---

## Phase 7 — Budget Management
**Goal:** Allow users to define monthly category caps and spending limits.
- [x] Create monthly budget
- [x] Category budgets configuration
- [x] Overall spending limit
- [x] Edit budget
- [x] Delete budget
- [x] Calculate budget utilization percentage
- [x] Remaining budget calculations
- [x] Budget historical tracking
- [x] Budget vs. actual spending calculations
- [x] Budget REST APIs
- [x] Budget dashboard summary

---

## Phase 8 — Monthly Goals & Goal Funding
**Goal:** Introduce short-term capital targets and savings allocations.
- [x] Create monthly goal
- [x] Goal attributes: Name, target amount, target date, priority
- [x] Current contribution tracking
- [x] Remaining required amount calculation
- [x] Goal progress calculation
- [x] Add contribution
- [x] Remove contribution
- [x] Goal funding history audit
- [x] Link account balance to goal
- [x] Calculate required monthly/weekly savings rate: $M_k = \frac{T_k - A_k}{m_k}$
- [x] Goal progress visualization payload

> 🏁 **MILESTONE: MVP COMPLETE (Phases 1–8)**

---

## Phase 9 — Budget Pace & Recurring Payments
**Goal:** Transition from static budgeting to predictive velocity monitoring.
### Budget Pace Tracking
- [ ] Calculate ideal spending velocity: $V_{\text{ideal}} = \frac{d}{D} \times B_{\text{total}}$
- [ ] Compare actual cumulative spending vs. ideal velocity
- [ ] Calculate pace variance: $\Delta V = S(d) - V_{\text{ideal}}$
- [ ] Define warning thresholds ($\theta$)
- [ ] Generate pace status (Ahead, On Track, Overspending)
- [ ] Mid-month pace warning payload

### Recurring Payments Detection
- [ ] Identify repeated merchants and cadences
- [ ] Detect subscriptions (Netflix, Spotify, etc.)
- [ ] Detect utility payments (Electricity, Internet, Water)
- [ ] Detect loan EMIs and credit card minimums
- [ ] Calculate total monthly recurring commitment ($C_{\text{recurring}}$)
- [ ] Detect subscription price hikes
- [ ] Store recurring payment schedules

---

## Phase 10 — Forecasting & Anomaly Detection
**Goal:** Predict where the user's month is heading and flag unusual activity.
### Month-End Forecasting
- [ ] Separate fixed commitments from variable daily spending
- [ ] Calculate variable daily burn rate: $\frac{S_{\text{variable}}(d)}{d}$
- [ ] Project end-of-month expenses: $E_{\text{projected}} = S(d) + C_{\text{remaining}} + \left(\frac{S_{\text{variable}}(d)}{d} \times (D - d)\right)$
- [ ] Calculate projected net savings
- [ ] Handle low-data early-month cold starts
- [ ] Output forecast confidence metrics

### Anomaly Detection
- [ ] Establish historical category spending baseline
- [ ] Detect category spending spikes
- [ ] Detect statistical outlier transactions
- [ ] Detect duplicate charges
- [ ] Detect uncharacteristic merchant transactions
- [ ] Generate anomaly alerts

---

## Phase 11 — Yearly Goals & Goal Intelligence
**Goal:** Connect financial behaviors to medium-term ambitions.
### Yearly Goals
- [ ] Create yearly goal model
- [ ] Set target amounts and multi-month deadlines
- [ ] Calculate required monthly contributions
- [ ] Track contribution history and schedule adherence

### Goal Health Indicator
- [ ] Compare actual savings velocity against required funding rate
- [ ] Implement status indicator: 🟢 **On Track**
- [ ] Implement status indicator: 🟡 **At Risk**
- [ ] Implement status indicator: 🔴 **Unlikely**
- [ ] Dynamic health status recalculation

### Goal Prioritization & Allocation Waterfall
- [ ] User-defined goal ranking matrix
- [ ] Calculate available savings surplus
- [ ] Execute capital allocation waterfall based on priority rank
- [ ] Partial funding allocation for lower-ranked targets
- [ ] Auto-recalculate completion dates for impacted goals

---

## Phase 12 — Goal-Aware Spending Engine
**Goal:** Product differentiator: convert discretionary overspends directly into goal timeline delays.
- [ ] Connect transaction spending anomalies to month-end forecast
- [ ] Connect forecasted savings reduction to goal allocation waterfall
- [ ] Calculate exact deadline shifts across active goals
- [ ] Calculate target capital shortfalls
- [ ] Generate goal-impact events
- [ ] Produce contextual notifications (e.g. *"A ₹3,500 overspend delays your Kashmir trip by 1 month"*)

---

## Phase 13 — What-If Simulator & Goal Impact Analysis
**Goal:** Allow users to simulate prospective purchases before spending money.
- [x] Simulation REST API
- [x] Accept hypothetical purchase payload `{ amount, category, date }`
- [x] Fork temporary in-memory financial state (non-persistent)
- [x] Evaluate available liquid balance vs. enforced emergency reserve cap
- [x] Recalculate projected net savings and goal allocations
- [x] Compute before vs. after timeline impact across all active goals
- [x] Identify schedule delays per goal (e.g., Kashmir Trip: July 2027 → Sept 2027)
- [ ] Return comparative timeline diff without modifying production records

> 🚀 **MILESTONE: VERSION 1.0 (V1) COMPLETE (Phases 9–13)**

---

## Phase 14 — React Native Mobile Application
**Goal:** Build the cross-platform iOS & Android client consuming backend APIs.
### Setup & Foundations
- [ ] Initialize Expo / React Native project
- [ ] Navigation structure (Tabs + Stack)
- [ ] Design system tokens (typography, color palettes, dark mode)
- [ ] Secure token storage (Expo SecureStore / Keychain)
- [ ] API client integration with JWT interceptor & auto-refresh

### Screens
- [ ] Splash & Onboarding
- [ ] Login & Registration
- [ ] Financial Dashboard
- [ ] Accounts Management (Bank, Cards, Cash, UPI)
- [ ] Transaction Ledger & Details
- [ ] Budget Planner & Pace Indicators
- [ ] Goal Tracker & Health Badges
- [ ] What-If Simulator Interface
- [ ] User Profile & Currency Settings

---

## Phase 15 — Long-Term Bucket List Goals
**Goal:** Support multi-year aspirational life milestones.
- [ ] Create bucket-list goal model (Real estate, sabbatical, wedding, retirement)
- [ ] Target date & inflation-adjusted target amount
- [ ] Monthly contribution schedule
- [ ] Milestone checkpoints & progress visualization
- [ ] Feasibility calculator based on long-term compound growth

---

## Phase 16 — AI Finance Copilot (Conversational Engine)  [ COMPLETED ]
**Goal:** Natural language conversational interface sitting above the deterministic calculation engine.
- [x] Conversational chat endpoint (`POST /api/copilot/chat`)
- [x] Intent detection & parameter extraction (Groq/Gemini LLM with deterministic regex fallback):
  - [x] Transaction queries
  - [x] Spending diagnostics
  - [x] Budget queries
  - [x] Goal progress queries
  - [x] Purchase simulations ("Can I buy a ₹40,000 phone next month?")
  - [x] Debt & EMI queries
  - [x] Account balance queries
  - [x] Income queries
- [x] Deterministic engine orchestration (`CopilotService` routes strictly to existing deterministic services)
- [x] Natural language explanation generation with verified factual assertions
- [x] Trade-off advice formatting & alternative recommendation cards
- [x] Regulatory safety guardrails & mandatory non-advisory disclaimer
- [x] Full PostgreSQL conversation persistence & thread retrieval
- [x] React Native Copilot chat screen with typing animation, intent tags, suggestion chips, and history drawer

---

## Phase 17 — AI Spending Insights & Smart Notifications  [ COMPLETED ]
**Goal:** Proactive financial intelligence engine.
### AI Spending Insights
- [x] Automated causal diagnostics for spending shifts (3-month baseline, category deviations, merchant contributors)
- [x] Synthesize macro spending trends and micro anomalies into human-readable narratives
- [x] End-of-month retrospective narrative generation with performance metrics, achievements, and suggested focus

### Smart Notifications
- [x] Budget pace breach & over-budget warnings (`BUDGET_PACE_BREACH`, `BUDGET_EXCEEDED`)
- [x] Goal health risk downgrade notifications (`GOAL_HEALTH_DOWNGRADE`)
- [x] Upcoming subscription & bill reminders (`BILL_UPCOMING`, `SUBSCRIPTION_UPCOMING`)
- [x] Unusual spending / anomaly alerts (`SPENDING_ANOMALY`)
- [x] Milestone completion celebrations (`GOAL_MILESTONE`, `SAVINGS_MILESTONE`, `DEBT_MILESTONE`)
- [x] Multi-level Redis & DB deduplication engine with cooldowns
- [x] Mobile Notifications screen (`mobile/app/notifications.tsx`) & header notification bell with unread badge
- [x] Mobile Insights & Retrospective screen (`mobile/app/insights.tsx`)

---

## Phase 18 — Security Hardening, Testing & Production Infra
**Goal:** Enterprise-grade security, comprehensive test coverage, and production reliability.
### Security
- [ ] Rate limiting (`express-rate-limit` + Redis)
- [ ] Helmet HTTP security headers
- [ ] Strict CORS configuration
- [ ] SQL injection & XSS sanitization
- [ ] File upload virus & MIME validation
- [ ] Audit logging for sensitive operations

### Testing
- [ ] Unit tests for deterministic math algorithms
- [ ] Integration tests for all API endpoints
- [ ] Goal simulation test suite
- [ ] Statement parser tests with sample PDF/CSV statements

### Infrastructure & CI/CD
- [ ] Docker & Docker Compose setup
- [ ] Production PostgreSQL connection pooling & migrations
- [ ] Redis caching & session clustering
- [ ] GitHub Actions CI pipeline (lint, typecheck, test)
- [ ] Structured logging & APM monitoring

> 🌟 **MILESTONE: VERSION 2.0 (V2) COMPLETE (Phases 14–18)**
