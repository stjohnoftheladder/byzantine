-- Fellowship Go — seed data
-- Run after schema.sql. Add parishes/meets as the pan-Orthodox rollout grows.

insert into public.parishes (id, slug, name, location) values
  ('d8b7a2f0-0000-4000-8000-000000000001', 'ss-george-alexandra', 'Ss. George & Alexandra', 'Fort Smith, Arkansas')
on conflict (slug) do nothing;

-- The confirmed pilot meet (fourth Friday, 7:30 PM CT)
insert into public.meets (parish_id, title, meet_date, meet_time, notes) values
  ('d8b7a2f0-0000-4000-8000-000000000001', 'Fourth Friday Parish Meet', '2026-08-28', '7:30 PM',
   'First parish pilot — relax, meet your parish family.')
on conflict do nothing;

-- Example for the pan-Orthodox rollout (commented out until the parish is live):
-- insert into public.parishes (id, slug, name, location) values
--   ('d8b7a2f0-0000-4000-8000-000000000002', 'st-john-the-forerunner', 'St. John the Forerunner', 'Somewhere, AR')
-- on conflict (slug) do nothing;
