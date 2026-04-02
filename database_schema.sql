-- 行程規劃器資料庫結構
-- 適用：Supabase SQL Editor
-- 內容：
-- 1. profiles（若尚未建立）
-- 2. trips
-- 3. trip_items
-- 4. updated_at trigger
-- 5. RLS policies
-- 6. helper functions

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- profiles
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- trips
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (btrim(name) <> ''),
  start_date date NOT NULL,
  duration_days integer NOT NULL DEFAULT 7 CHECK (duration_days >= 1 AND duration_days <= 40),
  show_all boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_trips_user_id
  ON public.trips (user_id);

CREATE INDEX IF NOT EXISTS idx_trips_user_id_created_at
  ON public.trips (user_id, created_at DESC);

-- ------------------------------------------------------------
-- trip_items
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.trip_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (btrim(title) <> ''),
  location text NOT NULL DEFAULT '',
  transport text NOT NULL DEFAULT '',
  budget integer NOT NULL DEFAULT 0 CHECK (budget >= 0),
  start_local timestamptz NOT NULL,
  notes_html text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trip_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_trip_items_trip_id
  ON public.trip_items (trip_id);

CREATE INDEX IF NOT EXISTS idx_trip_items_trip_id_start_local
  ON public.trip_items (trip_id, start_local);

-- ------------------------------------------------------------
-- updated_at trigger
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at_on_trips ON public.trips;
CREATE TRIGGER set_updated_at_on_trips
BEFORE UPDATE ON public.trips
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_on_trip_items ON public.trip_items;
CREATE TRIGGER set_updated_at_on_trip_items
BEFORE UPDATE ON public.trip_items
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- helper functions
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.owns_trip(p_trip_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.trips
    WHERE id = p_trip_id
      AND user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.owns_trip(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owns_trip(uuid) TO authenticated;

-- ------------------------------------------------------------
-- RLS policies: profiles
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own user profile" ON public.profiles;
CREATE POLICY "Users can insert own user profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id AND role = 'user');

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
  ON public.profiles
  FOR SELECT
  USING (public.is_admin());

-- 為了避免前端自行升權，不建立一般使用者可更新 role 的 policy。
-- 若未來需要改 username，建議另外寫 SECURITY DEFINER function 處理。

-- ------------------------------------------------------------
-- RLS policies: trips
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "Users can view own trips" ON public.trips;
CREATE POLICY "Users can view own trips"
  ON public.trips
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own trips" ON public.trips;
CREATE POLICY "Users can insert own trips"
  ON public.trips
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND duration_days >= 1
    AND duration_days <= 40
  );

DROP POLICY IF EXISTS "Users can update own trips" ON public.trips;
CREATE POLICY "Users can update own trips"
  ON public.trips
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND duration_days >= 1
    AND duration_days <= 40
  );

DROP POLICY IF EXISTS "Users can delete own trips" ON public.trips;
CREATE POLICY "Users can delete own trips"
  ON public.trips
  FOR DELETE
  USING (user_id = auth.uid());

-- ------------------------------------------------------------
-- RLS policies: trip_items
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "Users can view own trip items" ON public.trip_items;
CREATE POLICY "Users can view own trip items"
  ON public.trip_items
  FOR SELECT
  USING (public.owns_trip(trip_id));

DROP POLICY IF EXISTS "Users can insert own trip items" ON public.trip_items;
CREATE POLICY "Users can insert own trip items"
  ON public.trip_items
  FOR INSERT
  WITH CHECK (
    public.owns_trip(trip_id)
    AND budget >= 0
  );

DROP POLICY IF EXISTS "Users can update own trip items" ON public.trip_items;
CREATE POLICY "Users can update own trip items"
  ON public.trip_items
  FOR UPDATE
  USING (public.owns_trip(trip_id))
  WITH CHECK (
    public.owns_trip(trip_id)
    AND budget >= 0
  );

DROP POLICY IF EXISTS "Users can delete own trip items" ON public.trip_items;
CREATE POLICY "Users can delete own trip items"
  ON public.trip_items
  FOR DELETE
  USING (public.owns_trip(trip_id));
