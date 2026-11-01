-- Isolate user-funded question traffic from the editorial model budget.
INSERT INTO budgets (service, per_minute, per_hour, per_day, note)
VALUES ('byok_llm', 30, 300, 1000, 'Reader BYOK question request limit')
ON CONFLICT (service) DO NOTHING;
