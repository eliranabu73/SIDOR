SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE "hourlyRate" IS NULL) AS null_rates FROM employees;
