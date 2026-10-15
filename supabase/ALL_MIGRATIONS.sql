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
