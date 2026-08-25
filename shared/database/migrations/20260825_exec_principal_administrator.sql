-- Extend executive dashboard personas with school principal and administrator boards.

ALTER TABLE exec_dashboard_access DROP CONSTRAINT IF EXISTS exec_dashboard_access_persona_check;
ALTER TABLE exec_dashboard_access ADD CONSTRAINT exec_dashboard_access_persona_check
  CHECK (persona IN ('ceo', 'cfo', 'coo', 'chro', 'principal', 'administrator'));
