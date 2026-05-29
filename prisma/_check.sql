SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'employee_availability_rules'
ORDER BY ordinal_position;
