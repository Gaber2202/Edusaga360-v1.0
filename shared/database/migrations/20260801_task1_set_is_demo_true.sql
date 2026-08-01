-- Task 1 final step — pin demo flag to the exact 9 known demo tenants
--
-- Rollback:
--   UPDATE tenants SET is_demo = false
--   WHERE id IN (...this list...);

SET lock_timeout = '5s';
SET statement_timeout = '120s';

BEGIN;

UPDATE tenants SET is_demo = true WHERE id IN (
  'b0000000-0000-0000-0000-000000000001',
  'fc146a82-771c-4e19-ac84-ad32a942bd80',
  '05889539-9a56-4a34-8f57-e5cad92e0d72',
  '2fb308a5-b952-4526-b52c-c1a371679796',
  'ae090b3b-c49a-4972-aab2-61b288df2528',
  '07b2ccff-aab1-4d49-bbea-1cdc1ebbeaee',
  'c34454d7-27ca-4beb-8b9f-f9c291c751b4',
  '8856e193-7153-4486-b693-f0d04ede425f',
  '00000000-0000-0000-0000-000000000001'
);

COMMIT;
