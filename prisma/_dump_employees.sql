COPY (SELECT id, "organizationId", "fullName", email, "hourlyRate"::text, "weeklyBudgetHours", "isActive", "createdAt"::text FROM employees) TO STDOUT WITH CSV HEADER;
