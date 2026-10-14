-- Pocket Filter: Database Schema
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100),
  base_currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (LOWER(email));

-- Financial Accounts Table (Optional: Users are NOT required to link or add accounts)
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('bank', 'credit_card', 'cash', 'upi_wallet', 'investment', 'other')),
  institution_name VARCHAR(100),
  account_number_last4 VARCHAR(4),
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  credit_limit NUMERIC(14, 2),
  color VARCHAR(30),
  icon VARCHAR(50),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts (user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_user_type ON accounts (user_id, type);
CREATE INDEX IF NOT EXISTS idx_accounts_user_archived ON accounts (user_id, is_archived);

-- Transactions Table (Core Financial Ledger)
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  to_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  category VARCHAR(100) NOT NULL DEFAULT 'General',
  category_confidence NUMERIC(5, 2) NOT NULL DEFAULT 0,
  category_source VARCHAR(20) NOT NULL DEFAULT 'manual',
  merchant VARCHAR(150),
  description TEXT,
  date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payment_rail VARCHAR(50),
  is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
  tags TEXT[] DEFAULT '{}',
  import_hash VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_category ON transactions (user_id, category);
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions (account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_to_account_id ON transactions (to_account_id);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS import_hash VARCHAR(64);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS category_confidence NUMERIC(5, 2) NOT NULL DEFAULT 0;
ALTER TABLE transactions ALTER COLUMN category_confidence TYPE NUMERIC(5, 2) USING category_confidence::NUMERIC(5, 2);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS category_source VARCHAR(20) NOT NULL DEFAULT 'manual';
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_user_import_hash
  ON transactions (user_id, import_hash) WHERE import_hash IS NOT NULL;

-- Import Batches Table (Statement Ingestion History)
CREATE TABLE IF NOT EXISTS import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(20) NOT NULL CHECK (file_type IN ('csv', 'pdf')),
  total_rows INT NOT NULL DEFAULT 0,
  imported_rows INT NOT NULL DEFAULT 0,
  duplicate_rows INT NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_import_batches_user_id ON import_batches (user_id);

-- Phase 5: shared taxonomy and per-user learned merchant mappings
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  kind VARCHAR(20) NOT NULL DEFAULT 'expense' CHECK (kind IN ('income', 'expense', 'transfer', 'system')),
  icon VARCHAR(50),
  color VARCHAR(20),
  is_system BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_merchant_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  normalized_merchant VARCHAR(150) NOT NULL,
  category VARCHAR(100) NOT NULL REFERENCES categories(name),
  confidence NUMERIC(5, 2) NOT NULL DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, normalized_merchant)
);

CREATE INDEX IF NOT EXISTS idx_user_merchant_rules_user_id ON user_merchant_rules (user_id);

-- Phase 7: Budget Management
CREATE TABLE IF NOT EXISTS monthly_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month VARCHAR(7) NOT NULL,
  overall_limit NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (overall_limit >= 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, month, currency)
);

CREATE INDEX IF NOT EXISTS idx_monthly_budgets_user_month ON monthly_budgets (user_id, month);

CREATE TABLE IF NOT EXISTS budget_category_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID NOT NULL REFERENCES monthly_budgets(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  limit_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (limit_amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (budget_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_budget_category_limits_budget_id ON budget_category_limits (budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_category_limits_category_id ON budget_category_limits (category_id);

-- Phase 8: Monthly Goals & Goal Funding
CREATE TABLE IF NOT EXISTS savings_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  name VARCHAR(120) NOT NULL,
  target_amount NUMERIC(14, 2) NOT NULL CHECK (target_amount >= 0),
  target_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_savings_goals_user_id ON savings_goals (user_id);
CREATE INDEX IF NOT EXISTS idx_savings_goals_user_status ON savings_goals (user_id, status);

CREATE TABLE IF NOT EXISTS goal_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  type VARCHAR(20) NOT NULL DEFAULT 'contribution' CHECK (type IN ('contribution', 'reversal')),
  reversed_contribution_id UUID REFERENCES goal_contributions(id) ON DELETE SET NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_goal_contributions_goal_id ON goal_contributions (goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_contributions_user_id ON goal_contributions (user_id);

INSERT INTO categories (name, kind, icon, color) VALUES
  ('Food & Dining', 'expense', 'utensils', '#F97316'),
  ('Groceries', 'expense', 'shopping-basket', '#22C55E'),
  ('Transportation', 'expense', 'car', '#3B82F6'),
  ('Shopping', 'expense', 'shopping-bag', '#A855F7'),
  ('Utilities', 'expense', 'bolt', '#EAB308'),
  ('Health', 'expense', 'heart-pulse', '#EF4444'),
  ('Entertainment', 'expense', 'film', '#EC4899'),
  ('Education', 'expense', 'graduation-cap', '#06B6D4'),
  ('Housing', 'expense', 'house', '#64748B'),
  ('Insurance', 'expense', 'shield', '#14B8A6'),
  ('Financial Services', 'expense', 'landmark', '#6366F1'),
  ('Salary', 'income', 'wallet', '#16A34A'),
  ('Other Income', 'income', 'circle-plus', '#10B981'),
  ('Transfer', 'transfer', 'arrow-right-left', '#64748B'),
  ('General', 'system', 'tag', '#94A3B8')
ON CONFLICT (name) DO NOTHING;
