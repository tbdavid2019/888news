-- Purge obsolete Chinese / unused third-party services from budgets
DELETE FROM budgets WHERE service IN ('jina', 'socialdata', 'dajiala', 'zhipu', 'mimo', 'dashscope', 'deepseek');

-- Delete legacy Feishu deliveries and notify targets (modern notifications use Slack / Discord / Telegram webhooks)
DELETE FROM deliveries WHERE target_key LIKE 'feishu%';
DELETE FROM notify_targets WHERE key LIKE 'feishu%';
