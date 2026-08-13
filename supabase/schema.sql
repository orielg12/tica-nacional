-- Drop existing tables to ensure a clean slate for the relaxed testing environment
DROP TABLE IF EXISTS public.payouts CASCADE;
DROP TABLE IF EXISTS public.covers CASCADE;
DROP TABLE IF EXISTS public.ticket_numbers CASCADE;
DROP TABLE IF EXISTS public.tickets CASCADE;
DROP TABLE IF EXISTS public.results CASCADE;
DROP TABLE IF EXISTS public.risk_limits CASCADE;
DROP TABLE IF EXISTS public.draws CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- 1. Profiles (Sin FK a auth.users para facilitar testing local anónimo)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL CHECK (role IN ('admin', 'vendor')),
  name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  commission DECIMAL DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'Activo', 'Inactivo')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Sorteos (Draws)
CREATE TABLE public.draws (
  id TEXT PRIMARY KEY, -- TEXT para hacer match con los IDs de '11am-primera'
  name TEXT NOT NULL,
  close_time TIME NOT NULL,
  days_active TEXT[] NOT NULL,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Límites de Riesgo (Risk Limits)
CREATE TABLE public.risk_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number_played TEXT NOT NULL UNIQUE,
  max_limit DECIMAL NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Tickets (Cabecera de la jugada)
CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number SERIAL UNIQUE, 
  vendor_id TEXT NOT NULL, -- Relajado (TEXT) para testing sin profiles estrictos
  client_name TEXT,
  total_amount DECIMAL NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paid', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Ticket Numbers (Detalle de la jugada)
CREATE TABLE public.ticket_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  draw_id TEXT NOT NULL, -- Relajado para hacer match con IDs quemados locales
  number_played TEXT NOT NULL,
  amount DECIMAL NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Covers (Respaldo Automático)
CREATE TABLE public.covers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number_id UUID NOT NULL REFERENCES public.ticket_numbers(id) ON DELETE CASCADE,
  excess_amount DECIMAL NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. Payouts (Premios Pagados)
CREATE TABLE public.payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id),
  amount DECIMAL NOT NULL,
  paid_by TEXT NOT NULL, -- Relajado
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. Resultados Diarios (Results)
CREATE TABLE public.results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_id TEXT NOT NULL, -- Relajado
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  winning_number TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(draw_id, date)
);

-- HABILITAR RLS ABIERTO A TODOS PARA SIMULAR 'UN SOLO SISTEMA' CONECTADO
-- (Deberás ajustar esto más adelante cuando implementes login de usuarios).

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public profiles" ON public.profiles FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.draws ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public draws" ON public.draws FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.risk_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public risk_limits" ON public.risk_limits FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public tickets" ON public.tickets FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.ticket_numbers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public ticket_numbers" ON public.ticket_numbers FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.covers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public covers" ON public.covers FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public payouts" ON public.payouts FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public results" ON public.results FOR ALL USING (true) WITH CHECK (true);
