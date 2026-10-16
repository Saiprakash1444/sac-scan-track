-- ALL migrations concatenated in order, for pasting into the Supabase SQL Editor.
-- Generated 2026-08-06. Do NOT edit: regenerate from supabase/migrations/ instead.
-- Enable the pg_cron extension (Database -> Extensions) BEFORE running this.


-- ==========================================================================
-- 20260725193558_cdb6b1ed-94d3-48f0-85ce-8b2086f14c05.sql
-- ==========================================================================

-- roles
CREATE TYPE public.app_role AS ENUM ('admin','member');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text,
  roll_number text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles readable by signed in" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'member') ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- racks
CREATE TABLE public.racks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  location_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.racks TO authenticated;
GRANT ALL ON public.racks TO service_role;
ALTER TABLE public.racks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "racks readable" ON public.racks FOR SELECT TO authenticated USING (true);
CREATE POLICY "racks admin write" ON public.racks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- components
CREATE TABLE public.components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'misc',
  specs text,
  quantity_total integer NOT NULL DEFAULT 1,
  quantity_available integer NOT NULL DEFAULT 1,
  rack_id uuid REFERENCES public.racks(id) ON DELETE SET NULL,
  bin_label text,
  image_url text,
  qr_code text UNIQUE,
  keywords text[] NOT NULL DEFAULT '{}',
  borrowable boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.components TO authenticated;
GRANT ALL ON public.components TO service_role;
ALTER TABLE public.components ENABLE ROW LEVEL SECURITY;
CREATE POLICY "components readable" ON public.components FOR SELECT TO authenticated USING (true);
CREATE POLICY "components admin write" ON public.components FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER components_touch BEFORE UPDATE ON public.components FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- borrow records
CREATE TABLE public.borrow_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id uuid NOT NULL REFERENCES public.components(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1,
  borrowed_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  returned_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.borrow_records TO authenticated;
GRANT ALL ON public.borrow_records TO service_role;
ALTER TABLE public.borrow_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "borrow read own or admin" ON public.borrow_records FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "borrow insert own" ON public.borrow_records FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "borrow update own or admin" ON public.borrow_records FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

CREATE INDEX borrow_open_idx ON public.borrow_records (user_id) WHERE returned_at IS NULL;

-- seed racks
INSERT INTO public.racks (code, name, description, location_note) VALUES
 ('R1','Rack 1 - Microcontrollers','Dev boards and controllers','Left wall, top two shelves'),
 ('R2','Rack 2 - Motors & Drivers','Actuators and motor drivers','Left wall, bottom shelves'),
 ('R3','Rack 3 - Sensors','All sensing modules','Centre island, shelf A'),
 ('R4','Rack 4 - Passives & ICs','Bin boxes for small parts','Centre island, shelf B'),
 ('R5','Rack 5 - Power & Batteries','Batteries, SMPS, chargers','Right wall cabinet'),
 ('R6','Rack 6 - Tools & Mechanical','Tools, fasteners, chassis parts','Workbench cupboard');

-- seed components
INSERT INTO public.components (name, category, specs, quantity_total, quantity_available, rack_id, bin_label, keywords, qr_code, borrowable) VALUES
 ('Arduino Uno R3','microcontroller','ATmega328P, 14 digital IO, USB-B',12,12,(SELECT id FROM public.racks WHERE code='R1'),'B1-01',ARRAY['arduino','uno','atmega328'],'SAC-C-0001',true),
 ('Arduino Nano','microcontroller','ATmega328P, mini USB, breadboard friendly',10,10,(SELECT id FROM public.racks WHERE code='R1'),'B1-02',ARRAY['arduino','nano'],'SAC-C-0002',true),
 ('ESP32 DevKit V1','microcontroller','WiFi + BLE, 30 pin',8,8,(SELECT id FROM public.racks WHERE code='R1'),'B1-03',ARRAY['esp32','wifi','bluetooth'],'SAC-C-0003',true),
 ('ESP8266 NodeMCU','microcontroller','WiFi, CP2102 USB',6,6,(SELECT id FROM public.racks WHERE code='R1'),'B1-04',ARRAY['esp8266','nodemcu','wifi'],'SAC-C-0004',true),
 ('Raspberry Pi 4B 4GB','microcontroller','Quad-core Cortex-A72, 4GB RAM',3,3,(SELECT id FROM public.racks WHERE code='R1'),'B1-05',ARRAY['raspberry','pi','sbc'],'SAC-C-0005',true),
 ('STM32 Blue Pill','microcontroller','STM32F103C8T6, 72MHz',5,5,(SELECT id FROM public.racks WHERE code='R1'),'B1-06',ARRAY['stm32','bluepill'],'SAC-C-0006',true),
 ('SG90 Micro Servo','motor','9g, 180 deg, 4.8-6V',20,20,(SELECT id FROM public.racks WHERE code='R2'),'B2-01',ARRAY['servo','sg90'],'SAC-C-0007',true),
 ('MG996R Servo','motor','Metal gear, 11kg-cm torque',8,8,(SELECT id FROM public.racks WHERE code='R2'),'B2-02',ARRAY['servo','mg996r','metal gear'],'SAC-C-0008',true),
 ('BO Motor 100RPM','motor','Dual shaft geared DC, 12V',16,16,(SELECT id FROM public.racks WHERE code='R2'),'B2-03',ARRAY['bo motor','dc motor','geared'],'SAC-C-0009',true),
 ('NEMA 17 Stepper','motor','1.8 deg step, 1.7A, 42mm',6,6,(SELECT id FROM public.racks WHERE code='R2'),'B2-04',ARRAY['stepper','nema17'],'SAC-C-0010',true),
 ('L298N Motor Driver','driver','Dual H-bridge, 2A per channel',10,10,(SELECT id FROM public.racks WHERE code='R2'),'B2-05',ARRAY['l298n','h bridge','motor driver'],'SAC-C-0011',true),
 ('A4988 Stepper Driver','driver','Up to 2A, microstepping',12,12,(SELECT id FROM public.racks WHERE code='R2'),'B2-06',ARRAY['a4988','stepper driver'],'SAC-C-0012',true),
 ('HC-SR04 Ultrasonic Sensor','sensor','2-400cm range, 5V',15,15,(SELECT id FROM public.racks WHERE code='R3'),'B3-01',ARRAY['ultrasonic','hcsr04','distance'],'SAC-C-0013',true),
 ('MPU6050 IMU','sensor','6-axis accel + gyro, I2C',10,10,(SELECT id FROM public.racks WHERE code='R3'),'B3-02',ARRAY['mpu6050','imu','gyro'],'SAC-C-0014',true),
 ('IR Proximity Sensor','sensor','Adjustable digital output',20,20,(SELECT id FROM public.racks WHERE code='R3'),'B3-03',ARRAY['ir sensor','proximity','line follower'],'SAC-C-0015',true),
 ('DHT11 Temp/Humidity','sensor','Digital, 0-50C',10,10,(SELECT id FROM public.racks WHERE code='R3'),'B3-04',ARRAY['dht11','temperature','humidity'],'SAC-C-0016',true),
 ('LDR Module','sensor','Light dependent resistor board',14,14,(SELECT id FROM public.racks WHERE code='R3'),'B3-05',ARRAY['ldr','light sensor'],'SAC-C-0017',true),
 ('Resistor Box (assorted)','passive-bin','1/4W assorted 10R to 1M, sorted drawers',1,1,(SELECT id FROM public.racks WHERE code='R4'),'BOX-RES',ARRAY['resistor','resistors box','passive'],'SAC-C-0018',false),
 ('Capacitor Box (assorted)','passive-bin','Ceramic + electrolytic assorted',1,1,(SELECT id FROM public.racks WHERE code='R4'),'BOX-CAP',ARRAY['capacitor','caps box'],'SAC-C-0019',false),
 ('IC Box (logic + op-amps)','passive-bin','555, 741, 74xx series, LM317 etc.',1,1,(SELECT id FROM public.racks WHERE code='R4'),'BOX-IC',ARRAY['ic','ic box','555','741','logic'],'SAC-C-0020',false),
 ('LED & Diode Box','passive-bin','LEDs, 1N4007, zeners',1,1,(SELECT id FROM public.racks WHERE code='R4'),'BOX-LED',ARRAY['led','diode','box'],'SAC-C-0021',false),
 ('Jumper Wire Set','wiring','M-M, M-F, F-F, 20cm',30,30,(SELECT id FROM public.racks WHERE code='R4'),'B4-05',ARRAY['jumper','wires','dupont'],'SAC-C-0022',true),
 ('Li-ion 18650 Cell','power','3.7V 2600mAh',24,24,(SELECT id FROM public.racks WHERE code='R5'),'B5-01',ARRAY['18650','battery','liion'],'SAC-C-0023',true),
 ('LiPo 3S 2200mAh','power','11.1V, 25C, XT60',6,6,(SELECT id FROM public.racks WHERE code='R5'),'B5-02',ARRAY['lipo','3s','battery'],'SAC-C-0024',true),
 ('12V 2A SMPS Adapter','power','Barrel jack 5.5mm',8,8,(SELECT id FROM public.racks WHERE code='R5'),'B5-03',ARRAY['smps','adapter','power supply'],'SAC-C-0025',true),
 ('Soldering Iron 60W','tool','Temperature adjustable',5,5,(SELECT id FROM public.racks WHERE code='R6'),'B6-01',ARRAY['soldering','iron','tool'],'SAC-C-0026',true),
 ('Digital Multimeter','tool','DT830D, 2000 counts',6,6,(SELECT id FROM public.racks WHERE code='R6'),'B6-02',ARRAY['multimeter','dmm','tool'],'SAC-C-0027',true),
 ('Screw & Fastener Box','mechanical-bin','M2/M3/M4 screws, nuts, standoffs',1,1,(SELECT id FROM public.racks WHERE code='R6'),'BOX-SCREW',ARRAY['screws','nuts','fasteners','box'],'SAC-C-0028',false);

-- ==========================================================================
-- 20260725193629_e0d59215-aa3b-4a5f-9b8b-76357e2293bd.sql
-- ==========================================================================

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;

-- ==========================================================================
-- 20260725193654_9b7a4a5c-add8-4118-859e-d71dcafadbf7.sql
-- ==========================================================================

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- ==========================================================================
-- 20260725193817_e57fd373-23f0-4030-9384-15ba1c3f273d.sql
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.borrow_component(_component_id uuid, _quantity integer, _days integer DEFAULT 7, _note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _avail integer;
  _borrowable boolean;
  _id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _quantity IS NULL OR _quantity < 1 THEN RAISE EXCEPTION 'Quantity must be at least 1'; END IF;
  IF _days IS NULL OR _days < 1 OR _days > 90 THEN RAISE EXCEPTION 'Days must be between 1 and 90'; END IF;

  SELECT quantity_available, borrowable INTO _avail, _borrowable
  FROM public.components WHERE id = _component_id FOR UPDATE;

  IF _avail IS NULL THEN RAISE EXCEPTION 'Component not found'; END IF;
  IF NOT _borrowable THEN RAISE EXCEPTION 'This item stays in the room and cannot be checked out'; END IF;
  IF _avail < _quantity THEN RAISE EXCEPTION 'Only % available', _avail; END IF;

  UPDATE public.components SET quantity_available = quantity_available - _quantity WHERE id = _component_id;

  INSERT INTO public.borrow_records (component_id, user_id, quantity, due_at, note)
  VALUES (_component_id, _uid, _quantity, now() + (_days || ' days')::interval, _note)
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.return_component(_record_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _rec public.borrow_records;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO _rec FROM public.borrow_records WHERE id = _record_id FOR UPDATE;
  IF _rec.id IS NULL THEN RAISE EXCEPTION 'Record not found'; END IF;
  IF _rec.user_id <> _uid AND NOT public.has_role(_uid,'admin') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF _rec.returned_at IS NOT NULL THEN RETURN; END IF;

  UPDATE public.borrow_records SET returned_at = now() WHERE id = _record_id;
  UPDATE public.components SET quantity_available = LEAST(quantity_total, quantity_available + _rec.quantity)
  WHERE id = _rec.component_id;
END;
$$;

REVOKE ALL ON FUNCTION public.borrow_component(uuid, integer, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.return_component(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.borrow_component(uuid, integer, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.return_component(uuid) TO authenticated, service_role;

-- ==========================================================================
-- 20260725193851_a01934bb-8dd9-4d3b-a9eb-909ba3277ebc.sql
-- ==========================================================================

REVOKE EXECUTE ON FUNCTION public.borrow_component(uuid, integer, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.return_component(uuid) FROM anon;

-- ==========================================================================
-- 20260725200611_1596c1ab-155f-456d-b37c-b426bf22ee8b.sql
-- ==========================================================================

ALTER TABLE public.borrow_records
  ADD COLUMN IF NOT EXISTS extended_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS damage_reported boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS damage_note text,
  ADD COLUMN IF NOT EXISTS reminded_soon_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminded_overdue_at timestamptz;

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  borrow_record_id uuid REFERENCES public.borrow_records(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'reminder',
  title text NOT NULL,
  body text,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications read own" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "notifications update own" ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications (user_id, created_at DESC);

-- Extend a loan
CREATE OR REPLACE FUNCTION public.extend_borrow(_record_id uuid, _days integer DEFAULT 7)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _rec public.borrow_records;
  _new_due timestamptz;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _days IS NULL OR _days < 1 OR _days > 30 THEN RAISE EXCEPTION 'Extension must be between 1 and 30 days'; END IF;

  SELECT * INTO _rec FROM public.borrow_records WHERE id = _record_id FOR UPDATE;
  IF _rec.id IS NULL THEN RAISE EXCEPTION 'Record not found'; END IF;
  IF _rec.user_id <> _uid AND NOT public.has_role(_uid,'admin') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF _rec.returned_at IS NOT NULL THEN RAISE EXCEPTION 'This item is already returned'; END IF;
  IF _rec.extended_count >= 3 AND NOT public.has_role(_uid,'admin') THEN
    RAISE EXCEPTION 'You have already extended this 3 times — talk to an admin';
  END IF;

  _new_due := GREATEST(_rec.due_at, now()) + (_days || ' days')::interval;

  UPDATE public.borrow_records
  SET due_at = _new_due,
      extended_count = extended_count + 1,
      reminded_soon_at = NULL,
      reminded_overdue_at = NULL
  WHERE id = _record_id;

  RETURN _new_due;
END;
$$;

-- Return, with optional damage report
DROP FUNCTION IF EXISTS public.return_component(uuid);

CREATE OR REPLACE FUNCTION public.return_component(
  _record_id uuid,
  _damaged boolean DEFAULT false,
  _damage_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _rec public.borrow_records;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO _rec FROM public.borrow_records WHERE id = _record_id FOR UPDATE;
  IF _rec.id IS NULL THEN RAISE EXCEPTION 'Record not found'; END IF;
  IF _rec.user_id <> _uid AND NOT public.has_role(_uid,'admin') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF _rec.returned_at IS NOT NULL THEN RETURN; END IF;

  UPDATE public.borrow_records
  SET returned_at = now(),
      damage_reported = COALESCE(_damaged, false),
      damage_note = NULLIF(btrim(COALESCE(_damage_note, '')), '')
  WHERE id = _record_id;

  IF COALESCE(_damaged, false) THEN
    -- damaged units come back but leave usable stock
    UPDATE public.components
    SET quantity_total = GREATEST(0, quantity_total - _rec.quantity)
    WHERE id = _rec.component_id;
  ELSE
    UPDATE public.components
    SET quantity_available = LEAST(quantity_total, quantity_available + _rec.quantity)
    WHERE id = _rec.component_id;
  END IF;
END;
$$;

-- Scheduled reminder generator
CREATE OR REPLACE FUNCTION public.generate_return_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer := 0;
  _r record;
BEGIN
  FOR _r IN
    SELECT b.id, b.user_id, b.quantity, b.due_at, c.name AS component_name
    FROM public.borrow_records b
    JOIN public.components c ON c.id = b.component_id
    WHERE b.returned_at IS NULL
      AND b.due_at <= now() + interval '24 hours'
      AND b.reminded_soon_at IS NULL
  LOOP
    INSERT INTO public.notifications (user_id, borrow_record_id, kind, title, body)
    VALUES (
      _r.user_id, _r.id, 'due_soon',
      'Return due soon: ' || _r.component_name,
      _r.quantity || ' × ' || _r.component_name || ' is due back on ' ||
      to_char(_r.due_at, 'DD Mon YYYY') || '. Extend it if you still need it.'
    );
    UPDATE public.borrow_records SET reminded_soon_at = now() WHERE id = _r.id;
    _count := _count + 1;
  END LOOP;

  FOR _r IN
    SELECT b.id, b.user_id, b.quantity, b.due_at, c.name AS component_name
    FROM public.borrow_records b
    JOIN public.components c ON c.id = b.component_id
    WHERE b.returned_at IS NULL
      AND b.due_at < now()
      AND (b.reminded_overdue_at IS NULL OR b.reminded_overdue_at < now() - interval '48 hours')
  LOOP
    INSERT INTO public.notifications (user_id, borrow_record_id, kind, title, body)
    VALUES (
      _r.user_id, _r.id, 'overdue',
      'Overdue: ' || _r.component_name,
      _r.quantity || ' × ' || _r.component_name || ' was due on ' ||
      to_char(_r.due_at, 'DD Mon YYYY') || '. Please return it to the SAC room or extend it.'
    );
    UPDATE public.borrow_records SET reminded_overdue_at = now() WHERE id = _r.id;
    _count := _count + 1;
  END LOOP;

  RETURN _count;
END;
$$;

REVOKE ALL ON FUNCTION public.extend_borrow(uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.return_component(uuid, boolean, text) FROM anon;
REVOKE ALL ON FUNCTION public.generate_return_reminders() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.extend_borrow(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.return_component(uuid, boolean, text) TO authenticated;

-- ==========================================================================
-- 20260725200653_9ee01d8d-92d1-49fd-9c08-d31aa1e7b34d.sql
-- ==========================================================================

REVOKE ALL ON FUNCTION public.extend_borrow(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.return_component(uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_return_reminders() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_return_reminders() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.extend_borrow(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.return_component(uuid, boolean, text) TO authenticated;

-- ==========================================================================
-- 20260725200716_4d41c1de-1db9-4cf2-99fc-9ce00e6efc55.sql
-- ==========================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- ==========================================================================
-- 20260727114914_8e7dee53-86ce-4ffb-a386-f26447c8221e.sql
-- ==========================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by text;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_approval_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_approval_status_check
  CHECK (approval_status IN ('pending','approved','rejected'));

-- grandfather everyone who already signed up
UPDATE public.profiles SET approval_status = 'approved', approved_at = now(), approved_by = 'migration'
WHERE approval_status = 'pending';

CREATE OR REPLACE FUNCTION public.is_approved(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND approval_status = 'approved');
$$;

REVOKE EXECUTE ON FUNCTION public.is_approved(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_approved(uuid) TO authenticated;

-- members can never change their own approval state
CREATE OR REPLACE FUNCTION public.guard_profile_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() = NEW.id THEN
    NEW.approval_status := OLD.approval_status;
    NEW.approved_at := OLD.approved_at;
    NEW.approved_by := OLD.approved_by;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.guard_profile_approval() FROM anon, authenticated;

DROP TRIGGER IF EXISTS guard_profile_approval ON public.profiles;
CREATE TRIGGER guard_profile_approval BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_approval();

-- borrowing requires approval
CREATE OR REPLACE FUNCTION public.borrow_component(_component_id uuid, _quantity integer, _days integer DEFAULT 7, _note text DEFAULT NULL::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  _uid uuid := auth.uid();
  _avail integer;
  _borrowable boolean;
  _id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_approved(_uid) THEN RAISE EXCEPTION 'Your membership is still awaiting admin approval'; END IF;
  IF _quantity IS NULL OR _quantity < 1 THEN RAISE EXCEPTION 'Quantity must be at least 1'; END IF;
  IF _days IS NULL OR _days < 1 OR _days > 90 THEN RAISE EXCEPTION 'Days must be between 1 and 90'; END IF;

  SELECT quantity_available, borrowable INTO _avail, _borrowable
  FROM public.components WHERE id = _component_id FOR UPDATE;

  IF _avail IS NULL THEN RAISE EXCEPTION 'Component not found'; END IF;
  IF NOT _borrowable THEN RAISE EXCEPTION 'This item stays in the room and cannot be checked out'; END IF;
  IF _avail < _quantity THEN RAISE EXCEPTION 'Only % available', _avail; END IF;

  UPDATE public.components SET quantity_available = quantity_available - _quantity WHERE id = _component_id;

  INSERT INTO public.borrow_records (component_id, user_id, quantity, due_at, note)
  VALUES (_component_id, _uid, _quantity, now() + (_days || ' days')::interval, _note)
  RETURNING id INTO _id;

  RETURN _id;
END;
$function$;

CREATE TABLE IF NOT EXISTS public.unknown_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  guessed_name text NOT NULL,
  guessed_category text,
  notes text,
  resolved_component_id uuid REFERENCES public.components(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.unknown_scans TO authenticated;
GRANT ALL ON public.unknown_scans TO service_role;
ALTER TABLE public.unknown_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "unknown scans insert own" ON public.unknown_scans
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "unknown scans read own or admin" ON public.unknown_scans
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- ==========================================================================
-- 20260727114958_c988aea6-0eb0-4639-bf5d-6eba190d2c7b.sql
-- ==========================================================================

REVOKE EXECUTE ON FUNCTION public.is_approved(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_approved(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_profile_approval() FROM PUBLIC, anon, authenticated;

-- ==========================================================================
-- 20260806120000_schedule_return_reminders.sql
-- ==========================================================================

-- generate_return_reminders() existed since 20260725200611 but was never scheduled:
-- the pg_cron extension was created and then nothing called it, so the entire
-- notification feature only ran when an admin pressed "Send reminders now".
-- This schedules the daily sweep and adds the two indexes it actually reads.

-- Supabase installs pg_cron into the `extensions` schema; the callable API is
-- still `cron.*`. Guarded so the migration is a no-op on a database where the
-- extension could not be created (e.g. a local dev instance without it).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron is not installed — skipping reminder schedule. Enable it under Database → Extensions, then re-run this migration.';
    RETURN;
  END IF;

  -- Make re-running safe.
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sac-return-reminders') THEN
    PERFORM cron.unschedule('sac-return-reminders');
  END IF;

  -- 03:30 UTC = 09:00 IST. pg_cron schedules are UTC; adjust if the club moves.
  PERFORM cron.schedule(
    'sac-return-reminders',
    '30 3 * * *',
    $cron$SELECT public.generate_return_reminders()$cron$
  );
END $$;

-- The sweep's exact predicate: open loans ordered by due date. Without this it
-- is a full scan of borrow_records every night.
CREATE INDEX IF NOT EXISTS borrow_due_open_idx
  ON public.borrow_records (due_at)
  WHERE returned_at IS NULL;

-- deleteComponent() counts open loans per component before allowing a delete.
CREATE INDEX IF NOT EXISTS borrow_component_idx
  ON public.borrow_records (component_id);


-- ==========================================================================
-- 20261015120000_member_component_submissions.sql
-- ==========================================================================

-- Members can add components to the catalogue. An admin setting decides whether
-- those additions go live immediately ('direct') or wait in a review queue
-- ('approval'). Either way every addition is kept in component_submissions so
-- there is a record of who added what.
--
-- Members never get INSERT on components: the only member path is
-- submit_component(), which reads the setting and does the right thing.
-- Reviewing (approve / reject) runs through the admin panel with the service role.

-- ---------------------------------------------------------------- settings

CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settings readable" ON public.app_settings;
CREATE POLICY "settings readable" ON public.app_settings
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.app_settings (key, value)
VALUES ('member_additions', 'approval')
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------- submissions

CREATE TABLE IF NOT EXISTS public.component_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'misc',
  specs text,
  quantity integer NOT NULL CHECK (quantity >= 0),
  rack_id uuid REFERENCES public.racks(id) ON DELETE SET NULL,
  bin_label text,
  note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  component_id uuid REFERENCES public.components(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.component_submissions TO authenticated;
GRANT ALL ON public.component_submissions TO service_role;
ALTER TABLE public.component_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "submissions read own or admin" ON public.component_submissions;
CREATE POLICY "submissions read own or admin" ON public.component_submissions
  FOR SELECT TO authenticated
  USING (auth.uid() = submitted_by OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS component_submissions_pending_idx
  ON public.component_submissions (created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS component_submissions_member_idx
  ON public.component_submissions (submitted_by, created_at DESC);

-- ------------------------------------------------------------- submit path

CREATE OR REPLACE FUNCTION public.submit_component(
  _name text,
  _quantity integer,
  _rack_id uuid DEFAULT NULL,
  _bin_label text DEFAULT NULL,
  _category text DEFAULT NULL,
  _specs text DEFAULT NULL,
  _note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _mode text;
  _component_id uuid;
  _submission_id uuid;
  _clean_name text := btrim(COALESCE(_name, ''));
  _clean_category text := COALESCE(NULLIF(btrim(COALESCE(_category, '')), ''), 'misc');
  _clean_specs text := NULLIF(btrim(COALESCE(_specs, '')), '');
  _clean_bin text := NULLIF(btrim(COALESCE(_bin_label, '')), '');
  _clean_note text := NULLIF(btrim(COALESCE(_note, '')), '');
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_approved(_uid) THEN RAISE EXCEPTION 'Your account is not active yet'; END IF;
  IF length(_clean_name) < 1 OR length(_clean_name) > 120 THEN
    RAISE EXCEPTION 'Name must be 1–120 characters';
  END IF;
  IF _quantity IS NULL OR _quantity < 0 OR _quantity > 100000 THEN
    RAISE EXCEPTION 'Quantity must be between 0 and 100000';
  END IF;
  IF _rack_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.racks WHERE id = _rack_id) THEN
    RAISE EXCEPTION 'That section no longer exists';
  END IF;

  SELECT value INTO _mode FROM public.app_settings WHERE key = 'member_additions';
  _mode := COALESCE(_mode, 'approval');

  IF _mode = 'direct' THEN
    INSERT INTO public.components
      (name, category, specs, quantity_total, quantity_available, rack_id, bin_label)
    VALUES
      (_clean_name, _clean_category, _clean_specs, _quantity, _quantity, _rack_id, _clean_bin)
    RETURNING id INTO _component_id;

    INSERT INTO public.component_submissions
      (submitted_by, name, category, specs, quantity, rack_id, bin_label, note,
       status, component_id, reviewed_at, review_note)
    VALUES
      (_uid, _clean_name, _clean_category, _clean_specs, _quantity, _rack_id, _clean_bin, _clean_note,
       'approved', _component_id, now(), 'Added directly')
    RETURNING id INTO _submission_id;

    RETURN jsonb_build_object('status', 'approved', 'id', _submission_id, 'component_id', _component_id);
  END IF;

  INSERT INTO public.component_submissions
    (submitted_by, name, category, specs, quantity, rack_id, bin_label, note)
  VALUES
    (_uid, _clean_name, _clean_category, _clean_specs, _quantity, _rack_id, _clean_bin, _clean_note)
  RETURNING id INTO _submission_id;

  RETURN jsonb_build_object('status', 'pending', 'id', _submission_id);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_component(text, integer, uuid, text, text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_component(text, integer, uuid, text, text, text, text)
  TO authenticated, service_role;

-- ==========================================================================
-- 20261015140000_borrow_purpose_and_part_requests.sql
-- ==========================================================================

-- 1. Every borrow records why: for a club project (with its name) or personal use.
-- 2. Members can ask admins to source a part the room doesn't have (or needs
--    more of), optionally with a shop link and price. Admins finalise each one.

-- ------------------------------------------------------------ borrow purpose

ALTER TABLE public.borrow_records
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'personal',
  ADD COLUMN IF NOT EXISTS project_name text;

ALTER TABLE public.borrow_records DROP CONSTRAINT IF EXISTS borrow_records_purpose_check;
ALTER TABLE public.borrow_records ADD CONSTRAINT borrow_records_purpose_check
  CHECK (purpose IN ('project', 'personal'));

-- Replace borrow_component with a version that takes the purpose. Dropping the
-- old 4-argument signature first avoids two overloads that PostgREST can't
-- choose between.
DROP FUNCTION IF EXISTS public.borrow_component(uuid, integer, integer, text);

CREATE OR REPLACE FUNCTION public.borrow_component(
  _component_id uuid,
  _quantity integer,
  _days integer DEFAULT 7,
  _note text DEFAULT NULL,
  _purpose text DEFAULT 'personal',
  _project_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _avail integer;
  _borrowable boolean;
  _id uuid;
  _clean_project text := NULLIF(btrim(COALESCE(_project_name, '')), '');
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_approved(_uid) THEN RAISE EXCEPTION 'Your membership is still awaiting admin approval'; END IF;
  IF _quantity IS NULL OR _quantity < 1 THEN RAISE EXCEPTION 'Quantity must be at least 1'; END IF;
  IF _days IS NULL OR _days < 1 OR _days > 90 THEN RAISE EXCEPTION 'Days must be between 1 and 90'; END IF;
  IF _purpose IS NULL OR _purpose NOT IN ('project', 'personal') THEN
    RAISE EXCEPTION 'Purpose must be project or personal';
  END IF;
  IF _purpose = 'project' AND _clean_project IS NULL THEN
    RAISE EXCEPTION 'Name the project you are borrowing for';
  END IF;

  SELECT quantity_available, borrowable INTO _avail, _borrowable
  FROM public.components WHERE id = _component_id FOR UPDATE;

  IF _avail IS NULL THEN RAISE EXCEPTION 'Component not found'; END IF;
  IF NOT _borrowable THEN RAISE EXCEPTION 'This item stays in the room and cannot be checked out'; END IF;
  IF _avail < _quantity THEN RAISE EXCEPTION 'Only % available', _avail; END IF;

  UPDATE public.components SET quantity_available = quantity_available - _quantity WHERE id = _component_id;

  INSERT INTO public.borrow_records
    (component_id, user_id, quantity, due_at, note, purpose, project_name)
  VALUES
    (_component_id, _uid, _quantity, now() + (_days || ' days')::interval, _note,
     _purpose, CASE WHEN _purpose = 'project' THEN _clean_project END)
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.borrow_component(uuid, integer, integer, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.borrow_component(uuid, integer, integer, text, text, text)
  TO authenticated, service_role;

-- ------------------------------------------------------------ part requests

CREATE TABLE IF NOT EXISTS public.part_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 100000),
  reason text CHECK (reason IS NULL OR length(reason) <= 500),
  link text CHECK (link IS NULL OR length(link) <= 500),
  est_price numeric(10, 2) CHECK (est_price IS NULL OR est_price >= 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'ordered', 'received')),
  admin_note text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.part_requests TO authenticated;
GRANT ALL ON public.part_requests TO service_role;
ALTER TABLE public.part_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "requests read own or admin" ON public.part_requests;
CREATE POLICY "requests read own or admin" ON public.part_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = requested_by OR public.has_role(auth.uid(), 'admin'));

-- Members can only file new, pending requests in their own name; every later
-- status change goes through the admin panel (service role).
DROP POLICY IF EXISTS "requests insert own pending" ON public.part_requests;
CREATE POLICY "requests insert own pending" ON public.part_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = requested_by
    AND status = 'pending'
    AND admin_note IS NULL
    AND reviewed_at IS NULL
    AND public.is_approved(auth.uid())
  );

CREATE INDEX IF NOT EXISTS part_requests_status_idx
  ON public.part_requests (status, created_at);
CREATE INDEX IF NOT EXISTS part_requests_member_idx
  ON public.part_requests (requested_by, created_at DESC);

-- ==========================================================================
-- 20261015160000_stock_counting.sql
-- ==========================================================================

-- Stock-take support. Imported parts start with count_pending = true. While an
-- admin has counting "open", any active member can record how many units are
-- physically on the shelf; once counting is done the admin locks it and only
-- admins can change counts.
--
-- Members count what's on the shelf (= available). Units out on loan aren't on
-- the shelf, so total = shelf count + units currently out.

ALTER TABLE public.components
  ADD COLUMN IF NOT EXISTS count_pending boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS counted_at timestamptz,
  ADD COLUMN IF NOT EXISTS counted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

INSERT INTO public.app_settings (key, value)
VALUES ('member_counting', 'locked')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.update_component_count(
  _component_id uuid,
  _on_shelf integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _mode text;
  _total integer;
  _available integer;
  _out integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_approved(_uid) THEN RAISE EXCEPTION 'Your account is not active yet'; END IF;
  IF _on_shelf IS NULL OR _on_shelf < 0 OR _on_shelf > 100000 THEN
    RAISE EXCEPTION 'Count must be between 0 and 100000';
  END IF;

  IF NOT public.has_role(_uid, 'admin') THEN
    SELECT value INTO _mode FROM public.app_settings WHERE key = 'member_counting';
    IF COALESCE(_mode, 'locked') <> 'open' THEN
      RAISE EXCEPTION 'Counting is locked — ask an admin to open it';
    END IF;
  END IF;

  SELECT quantity_total, quantity_available INTO _total, _available
  FROM public.components WHERE id = _component_id FOR UPDATE;
  IF _total IS NULL THEN RAISE EXCEPTION 'Component not found'; END IF;

  _out := GREATEST(0, _total - _available);

  UPDATE public.components
  SET quantity_available = _on_shelf,
      quantity_total = _on_shelf + _out,
      count_pending = false,
      counted_at = now(),
      counted_by = _uid
  WHERE id = _component_id;

  RETURN jsonb_build_object('available', _on_shelf, 'total', _on_shelf + _out, 'out', _out);
END;
$$;

REVOKE ALL ON FUNCTION public.update_component_count(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_component_count(uuid, integer) TO authenticated, service_role;

-- ==========================================================================
-- 20261015161000_import_sac_inventory_2026.sql
-- ==========================================================================

-- Import of 'SAC Inventory - 2026-2027.xlsx' (generated; regenerate rather than edit).
-- Replaces the demo racks/parts Lovable seeded, keeping any demo part that has ever
-- been borrowed so no loan history is lost. Safe to re-run: existing real items are
-- matched on (section, name, row) and left alone.
--
-- 7 sections, 204 items. Every item starts at quantity 1 with
-- count_pending = true until someone records the real count.

BEGIN;

-- 1. Demo parts (seeded QR codes SAC-C-0001…0028) with no borrow history.
DELETE FROM public.components c
WHERE c.qr_code LIKE 'SAC-C-%'
  AND NOT EXISTS (SELECT 1 FROM public.borrow_records b WHERE b.component_id = c.id);

-- 2. Demo racks R1–R6 once nothing is left in them.
DELETE FROM public.racks r
WHERE r.code IN ('R1','R2','R3','R4','R5','R6')
  AND NOT EXISTS (SELECT 1 FROM public.components c WHERE c.rack_id = r.id);

-- 3. Real sections.
INSERT INTO public.racks (code, name, description, location_note) VALUES
  ('EE1', 'EE Rack 1', 'Electronics — boards, test gear, misc', NULL),
  ('EE2', 'EE Rack 2', 'Electronics — sensors, modules, ICs, dev boards', NULL),
  ('EE3', 'EE Rack 3', 'Electronics — switches, motors, drivers, controllers', NULL),
  ('EE4', 'EE Rack 4', 'Electronics — power, chargers, adapters', NULL),
  ('EE5', 'EE Rack 5', 'Electronics — cables, wires, connectors', NULL),
  ('ME1', 'Mech Rack 1', 'Mechanical — fasteners, tools, consumables', NULL),
  ('ME2', 'Mech Rack 2', 'Mechanical — motors, servos, pneumatics', NULL)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- 4. Real items.
INSERT INTO public.components
  (name, category, specs, quantity_total, quantity_available, rack_id, bin_label,
   keywords, borrowable, count_pending)
SELECT v.name, v.category, v.specs, 1, 1, r.id, v.bin_label, v.keywords, v.borrowable, true
FROM (VALUES
  ('EE1', 'Jetson Nano', 'board', 'Single-board computer for AI and edge computing developed by NVIDIA.', NULL, ARRAY['jetson','jetson nano','nano']::text[], true),
  ('EE1', 'Lidar', 'sensor', NULL, NULL, ARRAY['lidar']::text[], true),
  ('EE1', 'Tachometer', 'tool', NULL, NULL, ARRAY['tachometer','tacometer']::text[], true),
  ('EE1', 'Oscilloscope probe', 'tool', NULL, NULL, ARRAY['oscilloscope','probe']::text[], true),
  ('EE1', 'Stationary box', 'misc', NULL, NULL, ARRAY['box','stationary']::text[], false),
  ('EE1', 'Used PCBs', 'consumable', NULL, 'Row 3', ARRAY['pcbs','used']::text[], false),
  ('EE2', 'Ultrasonic Sensors', 'sensor', NULL, 'Row 1', ARRAY['sensors','ultrasonic']::text[], true),
  ('EE2', 'Mosfets', 'passive', NULL, 'Row 1', ARRAY['mosfets']::text[], true),
  ('EE2', 'DHT', 'sensor', NULL, 'Row 1', ARRAY['dht']::text[], true),
  ('EE2', 'Buck Converters', 'power', NULL, 'Row 1', ARRAY['buck','converters']::text[], true),
  ('EE2', 'USB Connectors', 'cable', NULL, 'Row 1', ARRAY['connectors','usb']::text[], true),
  ('EE2', 'Pressure Sensor', 'sensor', NULL, 'Row 1', ARRAY['pressure','sensor']::text[], true),
  ('EE2', 'MPU6050', 'sensor', NULL, 'Row 1', ARRAY['mpu6050']::text[], true),
  ('EE2', 'Color Sensor', 'sensor', NULL, 'Row 1', ARRAY['color','sensor']::text[], true),
  ('EE2', 'DC motor speed regulator', 'motor', NULL, 'Row 1', ARRAY['dc','motor','regulator','speed']::text[], true),
  ('EE2', 'Transducers', 'sensor', NULL, 'Row 1', ARRAY['transducers']::text[], true),
  ('EE2', 'IR distance sensor', 'sensor', NULL, 'Row 1', ARRAY['distance','ir','sensor']::text[], true),
  ('EE2', 'Audio Decoding Module', 'misc', NULL, 'Row 1', ARRAY['audio','decoding','module']::text[], true),
  ('EE2', 'Boost Converters', 'power', NULL, 'Row 1', ARRAY['boost','converters']::text[], true),
  ('EE2', 'Transistor', 'passive', NULL, 'Row 1', ARRAY['transistor']::text[], true),
  ('EE2', 'LDR', 'sensor', NULL, 'Row 1', ARRAY['ldr']::text[], true),
  ('EE2', 'Female Jack adapter connector', 'power', NULL, 'Row 1', ARRAY['adapter','connector','female','jack']::text[], true),
  ('EE2', 'RF Connector', 'board', NULL, 'Row 1', ARRAY['connector','rf']::text[], true),
  ('EE2', 'Capacitors', 'passive', NULL, 'Row 1', ARRAY['capacitors']::text[], true),
  ('EE2', 'AC Dimmer Module', 'driver', NULL, 'Row 1', ARRAY['ac','dimmer','module']::text[], true),
  ('EE2', 'Lipo battery protection module', 'power', NULL, 'Row 1', ARRAY['battery','lipo','module','protection']::text[], true),
  ('EE2', 'Potentiometer', 'passive', NULL, 'Row 1', ARRAY['potentiometer']::text[], true),
  ('EE2', 'Charging Module', 'power', NULL, 'Row 1', ARRAY['charging','module']::text[], true),
  ('EE2', 'Magnetic Coil', 'passive', NULL, 'Row 1', ARRAY['coil','magnetic']::text[], true),
  ('EE2', 'Flight Controller', 'driver', NULL, 'Row 1', ARRAY['controller','flight']::text[], true),
  ('EE2', 'Moisture Sensor', 'sensor', NULL, 'Row 1', ARRAY['moisture','sensor']::text[], true),
  ('EE2', 'Audio Sensor', 'sensor', NULL, 'Row 1', ARRAY['audio','sensor']::text[], true),
  ('EE2', 'Battery Checker', 'power', NULL, 'Row 1', ARRAY['battery','checker']::text[], true),
  ('EE2', 'Diodes', 'passive', NULL, 'Row 1', ARRAY['diodes']::text[], true),
  ('EE2', 'Photoresistors', 'sensor', NULL, 'Row 1', ARRAY['photoresistors']::text[], true),
  ('EE2', 'Logic Gates', 'passive', '4035, IC 7048, 7432, 7485, 7404,7486', 'Row 1', ARRAY['gates','logic']::text[], true),
  ('EE2', 'Logic gates, motor driver ICs', 'passive', '7392, OP AMP, 7402,7408,7400,L293D,7402,L293D,7432,555,DSI307,16 PIN IC SOCKETS,MUX', 'Row 1', ARRAY['driver','gates','ics','logic','logic gates , motion ic','motor']::text[], true),
  ('EE2', 'Raspberry pi', 'board', NULL, 'Row 2', ARRAY['pi','raspberry']::text[], true),
  ('EE2', 'Arduinos', 'board', NULL, 'Row 2', ARRAY['arduinos']::text[], true),
  ('EE2', 'Resistors', 'passive', NULL, 'Row 2', ARRAY['resistors']::text[], true),
  ('EE2', 'LCD', 'passive', NULL, 'Row 2', ARRAY['lcd']::text[], true),
  ('EE2', 'LED', 'passive', NULL, 'Row 2', ARRAY['led']::text[], true),
  ('EE2', 'Connectors', 'cable', NULL, 'Row 2', ARRAY['connectors']::text[], true),
  ('EE2', 'MSP430', 'board', NULL, 'Row 2', ARRAY['msp 430','msp430']::text[], true),
  ('EE2', 'ESP32', 'board', NULL, 'Row 2', ARRAY['esp 32','esp32']::text[], true),
  ('EE2', 'Miscellaneous programmable boards', 'board', NULL, 'Row 2', ARRAY['boards','miscellaneous','programmable']::text[], true),
  ('EE2', '3D printer touch sensor', 'sensor', NULL, 'Row 3', ARRAY['3d','printer','sensor','touch']::text[], true),
  ('EE2', 'Pneumatic Y connector', 'cable', NULL, 'Row 3', ARRAY['connector','pneumatic']::text[], true),
  ('EE2', 'Drone stuff', 'misc', NULL, 'Row 3', ARRAY['drone','stuff']::text[], true),
  ('EE2', 'Bluetooth module', 'board', NULL, 'Row 3', ARRAY['bluetooth','module']::text[], true),
  ('EE2', 'IR sensor module', 'sensor', NULL, 'Row 3', ARRAY['ir','module','sensor']::text[], true),
  ('EE2', 'Breadboard power supply module', 'power', NULL, 'Row 3', ARRAY['breadboard','module','power','supply']::text[], true),
  ('EE2', 'Touch sensor module', 'sensor', NULL, 'Row 3', ARRAY['module','sensor','touch']::text[], true),
  ('EE2', 'Camera module', 'sensor', NULL, 'Row 3', ARRAY['camera','module']::text[], true),
  ('EE2', 'PIR sensor', 'sensor', NULL, 'Row 3', ARRAY['pir','sensor']::text[], true),
  ('EE2', 'Touch sensor', 'sensor', NULL, 'Row 3', ARRAY['sensor','touch']::text[], true),
  ('EE2', 'Clock', 'board', NULL, 'Row 3', ARRAY['clock']::text[], true),
  ('EE2', 'Li battery protector', 'power', NULL, 'Row 3', ARRAY['battery','li','protector']::text[], true),
  ('EE2', 'Ppm encoder', 'board', NULL, 'Row 3', ARRAY['encoder','ppm']::text[], true),
  ('EE2', 'USB dongle', 'cable', NULL, 'Row 3', ARRAY['dongle','usb','usp dongle']::text[], true),
  ('EE2', 'Vision sensor', 'sensor', NULL, 'Row 3', ARRAY['sensor','vision']::text[], true),
  ('EE2', 'Zigbee adaptor', 'board', NULL, 'Row 3', ARRAY['adaptor','zigbee']::text[], true),
  ('EE2', 'Logic analyser', 'tool', NULL, 'Row 3', ARRAY['analyser','logic']::text[], true),
  ('EE2', 'Power module', 'power', NULL, 'Row 3', ARRAY['module','power']::text[], true),
  ('EE2', 'Sd card', 'misc', NULL, 'Row 3', ARRAY['card','sd']::text[], true),
  ('EE2', 'Sound sensor module', 'sensor', NULL, 'Row 3', ARRAY['module','sensor','sound']::text[], true),
  ('EE2', 'Ldr sensor module', 'sensor', NULL, 'Row 3', ARRAY['ldr','module','sensor']::text[], true),
  ('EE2', 'Push button', 'passive', NULL, 'Row 3', ARRAY['button','push']::text[], true),
  ('EE2', 'Servo consistency module', 'motor', NULL, 'Row 3', ARRAY['consistency','module','servo','servo consistentcy module']::text[], true),
  ('EE2', 'Motion detector', 'sensor', NULL, 'Row 3', ARRAY['detector','motion']::text[], true),
  ('EE2', 'Light sensor', 'sensor', NULL, 'Row 3', ARRAY['light','sensor']::text[], true),
  ('EE2', 'Toggle switch', 'passive', NULL, 'Row 3', ARRAY['switch','toggle']::text[], true),
  ('EE2', 'Transceiver module', 'board', NULL, 'Row 3', ARRAY['module','transceiver']::text[], true),
  ('EE2', 'Piezo buzzer', 'passive', NULL, 'Row 3', ARRAY['buzzer','piezo','pizo buzzer']::text[], true),
  ('EE2', 'Sd card reader', 'misc', NULL, 'Row 3', ARRAY['card','reader','sd']::text[], true),
  ('EE2', 'Sd card module', 'misc', NULL, 'Row 3', ARRAY['card','module','sd']::text[], true),
  ('EE2', 'Small joystick', 'misc', NULL, 'Row 3', ARRAY['joystick','small']::text[], true),
  ('EE2', 'Voltmeter ammeter', 'tool', NULL, 'Row 3', ARRAY['ammeter','voltmeter']::text[], true),
  ('EE2', 'Usb servo controller', 'motor', NULL, 'Row 3', ARRAY['controller','servo','usb']::text[], true),
  ('EE2', 'Accelerometer and gyroscope module', 'sensor', NULL, 'Row 3', ARRAY['accelerometer','and','gyroscope','module']::text[], true),
  ('EE2', 'Smoother module', 'misc', NULL, 'Row 3', ARRAY['module','smoother']::text[], true),
  ('EE2', 'Accelerometer', 'sensor', NULL, 'Row 3', ARRAY['accelerometer']::text[], true),
  ('EE3', 'Breadboard', 'passive', 'breadboards, power rails', 'Row 1', ARRAY['breadboard']::text[], true),
  ('EE3', 'Push Buttons', 'passive', NULL, 'Row 1', ARRAY['buttons','push']::text[], true),
  ('EE3', 'Communication Modules', 'board', NULL, 'Row 1', ARRAY['communication','modules']::text[], true),
  ('EE3', 'Car Fuses', 'power', 'rating for ampere, colored', 'Row 1', ARRAY['car','fuses']::text[], true),
  ('EE3', 'Switches', 'passive', NULL, 'Row 1', ARRAY['switches']::text[], true),
  ('EE3', 'Connectors - Levers', 'cable', 'Levers', 'Row 1', ARRAY['connectors','levers']::text[], true),
  ('EE3', 'Connectors - Ethernet', 'cable', 'Ethernet', 'Row 1', ARRAY['connectors','ethernet']::text[], true),
  ('EE3', 'N20 Motors', 'motor', NULL, 'Row 2', ARRAY['motors','n20']::text[], true),
  ('EE3', 'Servo Motors', 'motor', 'ST Series', 'Row 2', ARRAY['motors','servo']::text[], true),
  ('EE3', 'Micro Servo', 'motor', NULL, 'Row 2', ARRAY['micro','servo']::text[], true),
  ('EE3', 'Motor Drivers - 1', 'motor', NULL, 'Row 2', ARRAY['drivers','motor']::text[], true),
  ('EE3', 'Motor Drivers - 2', 'motor', NULL, 'Row 2', ARRAY['drivers','motor']::text[], true),
  ('EE3', 'Converters', 'power', 'Buck and Boost', 'Row 2', ARRAY['converters']::text[], true),
  ('EE3', 'Stepper Motor Drivers', 'motor', 'Control Boards', 'Row 3', ARRAY['drivers','motor','stepper']::text[], true),
  ('EE3', 'Car Fuse Holder', 'power', NULL, 'Row 1', ARRAY['car','fuse','holder']::text[], true),
  ('EE3', '3D printer Control Board', 'driver', NULL, 'Row 3', ARRAY['3d','board','control','printer']::text[], true),
  ('EE3', 'Control Modules', 'driver', 'Relay, IR sensor Module, Current Sensor, Camera, Radar Module, BMS', 'Row 3', ARRAY['control','modules']::text[], true),
  ('EE3', 'Proximity Switch', 'sensor', NULL, 'Row 1', ARRAY['proximity','switch']::text[], true),
  ('EE3', 'GPS', 'sensor', NULL, 'Row 3', ARRAY['gps']::text[], true),
  ('EE3', 'Pixhawk flight controller', 'driver', NULL, 'Row 3', ARRAY['controller','flight','pixhawk','pixhawk flight controller']::text[], true),
  ('EE3', 'Controller', 'driver', NULL, 'Row 3', ARRAY['controller']::text[], true),
  ('EE3', 'Relay', 'driver', NULL, 'Row 3', ARRAY['relay']::text[], true),
  ('EE3', 'IR Sensor Module', 'sensor', NULL, 'Row 3', ARRAY['ir','module','sensor']::text[], true),
  ('EE3', 'Current Sensor', 'sensor', NULL, 'Row 3', ARRAY['current','sensor']::text[], true),
  ('EE3', 'Camera', 'sensor', NULL, 'Row 3', ARRAY['camera']::text[], true),
  ('EE3', 'Radar Module', 'sensor', NULL, 'Row 3', ARRAY['module','radar']::text[], true),
  ('EE3', 'BMS', 'power', NULL, 'Row 3', ARRAY['bms']::text[], true),
  ('EE3', 'Miscellaneous sd cards and usb', 'cable', NULL, 'Row 1', ARRAY['and','cards','miscellaneous','sd','usb']::text[], true),
  ('EE4', 'AC to DC Adapter', 'power', NULL, 'Row 3', ARRAY['ac','adapter','dc','to']::text[], true),
  ('EE4', 'AC Power cord', 'power', NULL, 'Row 3', ARRAY['ac','cord','power']::text[], true),
  ('EE4', 'POE adapter', 'power', NULL, 'Row 3', ARRAY['adapter','poe']::text[], true),
  ('EE4', 'HDMI Cables', 'cable', NULL, 'Row 3', ARRAY['cables','hdmi']::text[], true),
  ('EE4', 'Batteries', 'power', NULL, 'Row 1', ARRAY['batteries']::text[], true),
  ('EE4', 'Wires', 'cable', NULL, 'Row 3', ARRAY['wires']::text[], true),
  ('EE4', 'Adapters', 'power', NULL, 'Row 2', ARRAY['adapters']::text[], true),
  ('EE4', 'RJ45 Couplers', 'cable', NULL, 'Row 2', ARRAY['couplers','rj45']::text[], true),
  ('EE4', 'Battery adapters', 'power', NULL, 'Row 2', ARRAY['adapters','battery']::text[], true),
  ('EE4', 'Extension Cords', 'power', NULL, 'Row 2', ARRAY['cords','extension']::text[], true),
  ('EE4', 'Battery Balance Chargers', 'power', NULL, 'Row 2', ARRAY['balance','battery','chargers']::text[], true),
  ('EE4', 'Compact Chargers', 'power', NULL, 'Row 2', ARRAY['chargers','compact']::text[], true),
  ('EE4', 'Transformers', 'power', NULL, 'Row 1', ARRAY['transformers']::text[], true),
  ('EE4', 'USB Charger', 'power', NULL, 'Row 2', ARRAY['charger','usb']::text[], true),
  ('EE4', 'Battery Chargers', 'power', NULL, 'Row 3', ARRAY['battery','chargers']::text[], true),
  ('EE4', 'ESC', 'motor', NULL, 'Row 3', ARRAY['esc']::text[], true),
  ('EE5', 'USB Cables', 'cable', NULL, 'Row 3', ARRAY['cables','usb']::text[], true),
  ('EE5', 'RJ45', 'cable', NULL, 'Row 3', ARRAY['rj45']::text[], true),
  ('EE5', 'Jumper M-M', 'cable', NULL, 'Row 1', ARRAY['jumper']::text[], true),
  ('EE5', 'Jumper F-F', 'cable', NULL, 'Row 1', ARRAY['jumper']::text[], true),
  ('EE5', 'Jumper F-M', 'cable', NULL, 'Row 1', ARRAY['jumper']::text[], true),
  ('EE5', 'Servo Motor Extender', 'motor', NULL, 'Row 1', ARRAY['extender','motor','servo']::text[], true),
  ('EE5', 'Twisted Servo Motor Extender Cable', 'motor', NULL, 'Row 1', ARRAY['cable','extender','motor','servo','twisted']::text[], true),
  ('EE5', 'JST Wires', 'cable', 'two boxes', 'Row 2', ARRAY['jst','wires']::text[], true),
  ('EE5', 'Wires', 'cable', 'Wires - 1 box', 'Row 2', ARRAY['wires']::text[], true),
  ('EE5', 'XT60', 'power', NULL, 'Row 2', ARRAY['xt60']::text[], true),
  ('EE5', 'Power connector (RC)', 'power', 'with XT60', 'Row 2', ARRAY['connector','power','rc']::text[], true),
  ('EE5', 'T-connector', 'cable', 'with XT60', 'Row 2', ARRAY['connector']::text[], true),
  ('EE5', 'USB-A to USB-B', 'cable', NULL, 'Row 3', ARRAY['to','usb']::text[], true),
  ('EE5', 'USB 2.0 female to USB', 'cable', 'USB Cables box', 'Row 3', ARRAY['female','to','usb']::text[], true),
  ('EE5', 'Headers', 'cable', NULL, 'Row 1', ARRAY['headers']::text[], true),
  ('EE5', 'Crocodile Clip Attachments', 'cable', 'Wires - 1 box', 'Row 2', ARRAY['attachments','clip','crocodile']::text[], true),
  ('ME1', 'Bearing', 'mechanical', NULL, 'Row 1', ARRAY['bearing']::text[], true),
  ('ME1', 'Castor wheels', 'mechanical', NULL, 'Row 1', ARRAY['castor','wheels']::text[], true),
  ('ME1', 'Coupling', 'mechanical', NULL, 'Row 1', ARRAY['coupling']::text[], true),
  ('ME1', 'Box 1 - Nuts and Bolts', 'fastener', NULL, 'Row 1', ARRAY['and','bolts','box','nuts']::text[], false),
  ('ME1', 'Box 2 - Misc', 'fastener', NULL, 'Row 1', ARRAY['box','misc']::text[], false),
  ('ME1', 'Box 3 - Washers', 'fastener', NULL, 'Row 1', ARRAY['box','washers']::text[], false),
  ('ME1', 'Box 4 - Small Bolts', 'fastener', NULL, 'Row 1', ARRAY['bolts','box','small']::text[], false),
  ('ME1', 'Box 5 - Screw driver tips', 'tool', NULL, 'Row 2', ARRAY['box','driver','screw','tips']::text[], false),
  ('ME1', 'Box 6 - Screw driver tips', 'tool', NULL, 'Row 2', ARRAY['box','driver','screw','tips']::text[], false),
  ('ME1', 'Box 7 - Nuts', 'fastener', NULL, 'Row 1', ARRAY['box','nuts']::text[], false),
  ('ME1', 'Box 8 - Non power tools', 'tool', NULL, 'Row 2', ARRAY['box','non','power','tools']::text[], false),
  ('ME1', 'Box 9 - Big nuts', 'fastener', NULL, 'Row 1', ARRAY['big','box','nuts']::text[], false),
  ('ME1', 'Box 10 - Nuts and Bolts', 'fastener', NULL, 'Row 1', ARRAY['10','and','bolts','box','nuts']::text[], false),
  ('ME1', 'Box 11 - Big Nuts', 'fastener', NULL, 'Row 1', ARRAY['11','big','box','nuts']::text[], false),
  ('ME1', 'Box 12 - Clamps', 'tool', NULL, 'Row 1', ARRAY['12','box','clamps']::text[], false),
  ('ME1', 'Office chair wheels', 'mechanical', 'Yellow 3d printing filament boxes', 'Row 1', ARRAY['chair','office','wheels']::text[], true),
  ('ME1', 'Box 14,15,16,19 - Msc Screws, Nuts, Bolts, Washers', 'fastener', NULL, 'Row 2', ARRAY['14','15','16','19','bolts','box','msc','nuts','screws','washers']::text[], false),
  ('ME1', 'Box 13 - Nuts', 'fastener', NULL, 'Row 1', ARRAY['13','box','nuts']::text[], false),
  ('ME1', 'Servo Parts', 'motor', NULL, 'Row 1', ARRAY['parts','servo']::text[], true),
  ('ME1', 'Box 17 - Clamps', 'tool', NULL, 'Row 1', ARRAY['17','box','clamps']::text[], false),
  ('ME1', 'Box 18 - Msc', 'fastener', NULL, 'Row 1', ARRAY['18','box','msc']::text[], false),
  ('ME1', 'Sand Paper', 'consumable', NULL, 'Row 1', ARRAY['paper','sand']::text[], false),
  ('ME1', 'Drill Bits', 'tool', NULL, 'Row 1', ARRAY['bits','drill']::text[], true),
  ('ME1', 'Random 3d prints', 'consumable', 'White filament box', 'Row 1', ARRAY['3d','prints','random']::text[], false),
  ('ME1', 'Box 20 - Huge Nuts', 'fastener', NULL, 'Row 1', ARRAY['20','box','huge','nuts']::text[], false),
  ('ME1', 'Box 21 - Screw, Nuts, Bolts, Washers', 'fastener', NULL, 'Row 3', ARRAY['21','bolts','box','nuts','screw','washers']::text[], false),
  ('ME1', 'Black Spray Paint', 'consumable', NULL, 'Row 3', ARRAY['black','paint','spray']::text[], false),
  ('ME1', 'Silicone Rubber', 'consumable', NULL, 'Row 3', ARRAY['rubber','silicone']::text[], false),
  ('ME1', 'Box 22 - Allen Keys', 'tool', NULL, 'Row 3', ARRAY['22','allen','box','keys']::text[], false),
  ('ME1', 'Hot glue stick', 'consumable', NULL, 'Row 3', ARRAY['glue','hot','stick']::text[], false),
  ('ME1', 'Steering Mechanism', 'mechanical', NULL, 'Row 3', ARRAY['mechanism','steering']::text[], true),
  ('ME1', 'Box 23 - Thread, Wire Frame, Wooden Sticks', 'fastener', NULL, 'Row 3', ARRAY['23','box','frame','sticks','thread','wire','wooden']::text[], false),
  ('ME1', 'WD-40', 'consumable', NULL, 'Row 3', ARRAY['40','wd','wd 40']::text[], false),
  ('ME1', 'Ziplock + plastic bags + packaging', 'consumable', NULL, 'Row 3', ARRAY['bags','packaging','plastic','ziplock']::text[], false),
  ('ME1', 'Grease', 'consumable', NULL, 'Row 3', ARRAY['grease']::text[], false),
  ('ME1', 'M-Seal', 'consumable', NULL, 'Row 3', ARRAY['m seal','seal']::text[], false),
  ('ME1', 'Nails', 'consumable', NULL, 'Row 3', ARRAY['nails']::text[], false),
  ('ME1', 'Hydro - Epoxy', 'consumable', NULL, 'Row 3', ARRAY['epoxy','hydro']::text[], false),
  ('ME1', 'Washers Box', 'fastener', NULL, 'Row 1', ARRAY['box','washers']::text[], false),
  ('ME1', '90 Degree Pump Connecting', 'motor', NULL, 'Row 1', ARRAY['90','connecting','degree','pump']::text[], true),
  ('ME2', 'Gear Motors', 'motor', NULL, 'Ground', ARRAY['gear','motors']::text[], true),
  ('ME2', '60 Kg Servo', 'motor', NULL, 'Ground', ARRAY['60','kg','servo']::text[], true),
  ('ME2', 'MG995 Servo', 'motor', NULL, 'Row 1', ARRAY['mg995','servo']::text[], true),
  ('ME2', 'S3003 Servo', 'motor', NULL, 'Row 1', ARRAY['s3003','servo']::text[], true),
  ('ME2', 'Servo Horns', 'motor', NULL, 'Row 1', ARRAY['horns','servo']::text[], true),
  ('ME2', 'DC Servo', 'motor', NULL, 'Row 1', ARRAY['dc','servo']::text[], true),
  ('ME2', 'Brushless Motors', 'motor', NULL, 'Row 2', ARRAY['brushless','motors']::text[], true),
  ('ME2', 'Metal Chassis', 'mechanical', NULL, 'Row 2', ARRAY['chassis','metal']::text[], true),
  ('ME2', 'Computer Power Supply', 'sensor', NULL, 'Row 2', ARRAY['computer','power','supply']::text[], true),
  ('ME2', 'Servo Parts', 'motor', NULL, 'Row 3', ARRAY['parts','servo']::text[], true),
  ('ME2', 'BO motors', 'motor', NULL, 'Row 3', ARRAY['bo','bow motors','motors']::text[], true),
  ('ME2', 'Small Stepper Motor', 'motor', NULL, 'Row 3', ARRAY['motor','small','stepper']::text[], true),
  ('ME2', 'Pneumatic Actuators', 'motor', NULL, 'Row 3', ARRAY['actuators','pneumatic']::text[], true),
  ('ME2', 'Pumps', 'motor', NULL, 'Row 3', ARRAY['pumps']::text[], true),
  ('ME2', 'Pressure Gauge', 'sensor', NULL, 'Row 3', ARRAY['gauge','pressure']::text[], true),
  ('ME2', 'Battery Holders', 'power', NULL, 'Row 3', ARRAY['battery','holders']::text[], true),
  ('ME2', 'Stepper Motor', 'motor', NULL, 'Row 4', ARRAY['motor','stepper']::text[], true),
  ('ME2', 'Cooling Fan', 'mechanical', NULL, 'Row 4', ARRAY['cooling','fan']::text[], true),
  ('ME2', 'Gears', 'mechanical', NULL, 'Row 4', ARRAY['gears']::text[], true),
  ('ME2', 'Gear Motors', 'motor', NULL, 'Row 4', ARRAY['gear','motors']::text[], true),
  ('ME2', 'Heat sink', 'mechanical', NULL, 'Row 4', ARRAY['heat','heat simk','sink']::text[], true),
  ('ME2', 'Waterproof Tape', 'consumable', NULL, 'Row 4', ARRAY['tape','waterproof']::text[], false)
) AS v(code, name, category, specs, bin_label, keywords, borrowable)
JOIN public.racks r ON r.code = v.code
WHERE NOT EXISTS (
  SELECT 1 FROM public.components c
  WHERE c.rack_id = r.id
    AND lower(c.name) = lower(v.name)
    AND c.bin_label IS NOT DISTINCT FROM v.bin_label
);

COMMIT;


-- ==========================================================================
-- 20261016120000_member_damage_reports.sql
-- ==========================================================================

-- Members can flag a part as damaged without having borrowed it — e.g. they
-- found a burnt module in the bin, or a room-use-only tool stopped working.
-- (Damage on a borrowed part is still reported through return_component.)
--
-- A report does NOT touch stock on its own: an admin reviews it and either
-- writes the units off (total and available both drop) or dismisses it.

CREATE TABLE IF NOT EXISTS public.damage_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id uuid NOT NULL REFERENCES public.components(id) ON DELETE CASCADE,
  reported_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 100000),
  note text NOT NULL CHECK (length(btrim(note)) BETWEEN 1 AND 300),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'written_off', 'dismissed')),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.damage_reports TO authenticated;
GRANT ALL ON public.damage_reports TO service_role;
ALTER TABLE public.damage_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "damage read own or admin" ON public.damage_reports;
CREATE POLICY "damage read own or admin" ON public.damage_reports
  FOR SELECT TO authenticated
  USING (auth.uid() = reported_by OR public.has_role(auth.uid(), 'admin'));

-- Members may only file open reports in their own name; resolution goes through
-- resolve_damage_report (service role, from the admin panel).
DROP POLICY IF EXISTS "damage insert own open" ON public.damage_reports;
CREATE POLICY "damage insert own open" ON public.damage_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = reported_by
    AND status = 'open'
    AND resolved_at IS NULL
    AND public.is_approved(auth.uid())
  );

CREATE INDEX IF NOT EXISTS damage_reports_open_idx
  ON public.damage_reports (status, created_at DESC);

-- Write-off is done in SQL with a row lock so it can't race a borrow/return.
-- Units come off the shelf first; we never take more than is actually there.
CREATE OR REPLACE FUNCTION public.resolve_damage_report(_report_id uuid, _write_off boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _component uuid;
  _qty integer;
  _status text;
  _available integer;
  _removed integer := 0;
BEGIN
  SELECT component_id, quantity, status INTO _component, _qty, _status
  FROM public.damage_reports WHERE id = _report_id FOR UPDATE;
  IF _component IS NULL THEN RAISE EXCEPTION 'Report not found'; END IF;
  IF _status <> 'open' THEN RAISE EXCEPTION 'This report was already handled'; END IF;

  IF _write_off THEN
    SELECT quantity_available INTO _available
    FROM public.components WHERE id = _component FOR UPDATE;
    _removed := LEAST(_qty, GREATEST(_available, 0));
    UPDATE public.components
    SET quantity_available = quantity_available - _removed,
        quantity_total = GREATEST(0, quantity_total - _removed)
    WHERE id = _component;
  END IF;

  UPDATE public.damage_reports
  SET status = CASE WHEN _write_off THEN 'written_off' ELSE 'dismissed' END,
      resolved_at = now()
  WHERE id = _report_id;

  RETURN jsonb_build_object('removed', _removed);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_damage_report(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_damage_report(uuid, boolean) TO service_role;
