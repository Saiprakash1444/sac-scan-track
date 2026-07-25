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