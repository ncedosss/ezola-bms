-- LES BMS - Phase 1 schema (Technical Design v1.0, Section 3)
-- Idempotent: safe to run on every deploy (Heroku release phase)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  email VARCHAR(160) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  pin_hash TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner','office_manager','facility_manager','reception','waiter','shop_attendant','kitchen')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_number VARCHAR(10) UNIQUE NOT NULL,          -- D1-D4, U1-U6 (numbering pending Open Item)
  floor TEXT NOT NULL CHECK (floor IN ('downstairs','upstairs')),
  hourly_rate NUMERIC(10,2) NOT NULL,               -- R130 d/s, R150 u/s - flat regardless of amenities
  overnight_rate NUMERIC(10,2) NOT NULL DEFAULT 550,-- includes one R65 meal credit
  has_tv BOOLEAN NOT NULL DEFAULT FALSE,            -- informational only, never changes price
  has_fridge BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'vacant' CHECK (status IN ('vacant','occupied','cleaning','maintenance')),
  max_guests INTEGER NOT NULL DEFAULT 2,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id),
  captured_by UUID NOT NULL REFERENCES users(id),
  guest_name VARCHAR(160) NOT NULL,
  signature_ref TEXT,                               -- replaces the paper login book
  stay_type TEXT NOT NULL CHECK (stay_type IN ('hourly','overnight')),
  hours_purchased INTEGER,                          -- 1-5 for hourly; NULL for overnight
  check_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,                           -- check_in + hours (hourly): drives room-grid countdown
  check_out_at TIMESTAMPTZ,
  amount_due NUMERIC(10,2) NOT NULL DEFAULT 0,      -- never reduced on early checkout (no refunds)
  amount_paid NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stay_topups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stay_id UUID NOT NULL REFERENCES stays(id),
  extra_hours INTEGER NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  payment_id UUID,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meal_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stay_id UUID NOT NULL REFERENCES stays(id),
  value NUMERIC(10,2) NOT NULL DEFAULT 65,
  funding_method TEXT NOT NULL CHECK (funding_method IN ('cash_walked','card_noted')),
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','redeemed','expired')),
  redeemed_order_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(160) NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (category IN ('plate','protein_standalone','braai_per_kg','drink','alcohol','snack','household','addon')),
  pricing_type TEXT NOT NULL CHECK (pricing_type IN ('dual_fixed','per_kg','unit')),
  price_sit_down NUMERIC(10,2),                     -- R65 (plate / ulusu-with-starch)
  price_takeaway NUMERIC(10,2),                     -- R70
  price_per_kg NUMERIC(10,2),                       -- braai: pork 110, beef 160, wings 140, boerewors 100
  price_unit NUMERIC(10,2),                         -- tuck shop & add-ons
  is_available BOOLEAN NOT NULL DEFAULT TRUE,       -- Tshisa Nyama seeded FALSE until renovation done
  stock_register TEXT CHECK (stock_register IN ('kitchen','shop','guest_house')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS menu_option_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,                        -- 'Starch' (choose 1), 'Protein' (choose 1)
  required BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS menu_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES menu_option_groups(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  register TEXT NOT NULL CHECK (register IN ('kitchen','shop','guest_house')),
  name VARCHAR(160) NOT NULL,
  category VARCHAR(60),                             -- shop: household, groceries, snacks, soft_drinks, energy_drinks, alcohol
  unit TEXT NOT NULL DEFAULT 'unit' CHECK (unit IN ('kg','litre','unit','whole_animal','cylinder')),
  current_quantity NUMERIC(10,3) NOT NULL DEFAULT 0,
  low_stock_threshold NUMERIC(10,3),                -- NULL = alert skipped until set (Open Item)
  cost_per_unit NUMERIC(10,2),
  sell_price NUMERIC(10,2),
  plate_yield NUMERIC(10,2),                        -- sheep pack -> 10 plates, whole chicken -> 5
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (register, name)
);

CREATE TABLE IF NOT EXISTS recipe_consumption (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  menu_option_id UUID REFERENCES menu_options(id) ON DELETE CASCADE, -- NULL = applies to the item itself
  stock_item_id UUID NOT NULL REFERENCES stock_items(id),
  quantity_per_unit NUMERIC(10,4) NOT NULL          -- per plate/unit sold; per kg for per_kg items
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number VARCHAR(20) NOT NULL,                -- R-014 / S-031 / RM-002, resets daily
  channel TEXT NOT NULL CHECK (channel IN ('restaurant','tuck_shop','room')),
  stay_id UUID REFERENCES stays(id),
  service_type TEXT NOT NULL DEFAULT 'sit_down' CHECK (service_type IN ('sit_down','takeaway')),
  table_number INTEGER CHECK (table_number BETWEEN 1 AND 9),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','paid','in_kitchen','served','cancelled','voided')),
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(10,2) NOT NULL DEFAULT 0,
  paid_at TIMESTAMPTZ,
  business_date DATE NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES menu_items(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL,
  weight_kg NUMERIC(10,3),                          -- per-kg braai lines: total = weight x price_per_kg
  selected_options JSONB,                           -- {"Starch":"Pap","Protein":"Lamb"}
  meal_credit_id UUID REFERENCES meal_credits(id),
  line_total NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payable_type TEXT NOT NULL CHECK (payable_type IN ('order','stay','stay_topup','sundry')),
  payable_id UUID NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('cash','card')),
  till TEXT NOT NULL CHECK (till IN ('restaurant','guest_house')),
  amount NUMERIC(10,2) NOT NULL,
  received_by UUID NOT NULL REFERENCES users(id),
  business_date DATE NOT NULL,                      -- 00:30 payment belongs to prior trading day
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cash_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_till TEXT NOT NULL CHECK (from_till IN ('restaurant','guest_house')),
  to_till TEXT NOT NULL CHECK (to_till IN ('restaurant','guest_house')),
  amount NUMERIC(10,2) NOT NULL,
  meal_credit_id UUID REFERENCES meal_credits(id),
  carried_by UUID REFERENCES users(id),
  confirmed_by UUID REFERENCES users(id),
  confirmed_at TIMESTAMPTZ,
  business_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id UUID NOT NULL REFERENCES stock_items(id),
  quantity NUMERIC(10,3) NOT NULL,
  total_cost NUMERIC(10,2) NOT NULL,
  receipt_ref TEXT,                                 -- receipt reference/photo key (S3 in later phase)
  supplier_note VARCHAR(200),
  purchased_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id UUID NOT NULL REFERENCES stock_items(id),
  quantity_change NUMERIC(10,3) NOT NULL,           -- negative = write-off
  reason TEXT NOT NULL,                             -- mandatory
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  submitted_by UUID NOT NULL REFERENCES users(id),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_stock_item_id UUID NOT NULL REFERENCES stock_items(id),  -- source register's item (decremented)
  to_stock_item_id UUID NOT NULL REFERENCES stock_items(id),    -- destination register's item (incremented)
  quantity NUMERIC(10,3) NOT NULL CHECK (quantity > 0),
  note VARCHAR(200),                                            -- e.g. "kitchen ran out mid-service"
  transferred_by UUID NOT NULL REFERENCES users(id),
  business_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_date DATE NOT NULL,
  till TEXT NOT NULL CHECK (till IN ('restaurant','guest_house')),
  system_cash_total NUMERIC(10,2) NOT NULL,
  system_card_total NUMERIC(10,2) NOT NULL,
  counted_cash NUMERIC(10,2) NOT NULL,
  counted_card NUMERIC(10,2) NOT NULL,
  cash_variance NUMERIC(10,2) NOT NULL,             -- counted - system; negative = shortfall
  card_variance NUMERIC(10,2) NOT NULL,
  plates_counted INTEGER,
  shop_items_counted INTEGER,
  guests_counted INTEGER,
  notes TEXT,
  submitted_by UUID NOT NULL REFERENCES users(id),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_date, till)
);

CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(60) NOT NULL,                        -- low_stock, variance_breach, adjustment_pending, cash_transfer_unconfirmed, stay_expired_unclosed
  message TEXT NOT NULL,
  payload JSONB,
  acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(80) NOT NULL,
  entity VARCHAR(60) NOT NULL,
  entity_id UUID,
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS petty_cash_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('topup','expense','count')),
  amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),   
  description TEXT,                                    
  receipt_ref TEXT,                                    
  counted_amount NUMERIC(10,2),                        
  variance NUMERIC(10,2),                              
  created_by UUID NOT NULL REFERENCES users(id),
  business_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


CREATE INDEX IF NOT EXISTS idx_payments_bdate_till ON payments (business_date, till);
CREATE INDEX IF NOT EXISTS idx_orders_bdate ON orders (business_date, channel);
CREATE INDEX IF NOT EXISTS idx_stays_status ON stays (status);
CREATE INDEX IF NOT EXISTS idx_stock_register ON stock_items (register);
CREATE INDEX IF NOT EXISTS idx_alerts_ack ON alerts (acknowledged, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_bdate ON stock_transfers (business_date);
CREATE INDEX IF NOT EXISTS idx_petty_bdate ON petty_cash_entries (business_date, type);