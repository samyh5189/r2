-- Local development seed data. Money in minor units (laari): 5000 = MVR 50.00
insert into public.branches (id, name, address, lat, lng) values
  ('00000000-0000-0000-0000-0000000000b1', 'Kulhudhuffushi', 'Kulhudhuffushi, Haa Dhaalu Atoll', 6.6224, 73.0702);

insert into public.price_plans (id, name, hourly, daily, weekly, deposit, late_fee_per_hour) values
  ('00000000-0000-0000-0000-0000000000a1', 'Scooter 110–125cc', 5000, 30000, 150000, 100000, 7500),
  ('00000000-0000-0000-0000-0000000000a2', 'Motorbike 150cc+', 8000, 45000, 220000, 200000, 12000);

insert into public.extras (code, label, per_day, max_quantity) values
  ('helmet', 'Helmet', 2000, 2),
  ('phone_holder', 'Phone holder', 1000, 1),
  ('insurance_plus', 'Damage cover (reduces deposit claim cap)', 5000, 1);

insert into public.vehicles (id, branch_id, price_plan_id, plate, make, model, engine_cc, year) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'P-1001', 'Honda', 'Dio', 110, 2024),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'P-1002', 'Yamaha', 'Ray ZR', 125, 2024),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2', 'P-2001', 'Yamaha', 'NMAX', 155, 2025);
