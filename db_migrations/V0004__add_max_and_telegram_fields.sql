ALTER TABLE t_p54486869_greeting_initiative_.users
  ADD COLUMN IF NOT EXISTS max_api_instance_id VARCHAR(100) DEFAULT '',
  ADD COLUMN IF NOT EXISTS max_api_token VARCHAR(200) DEFAULT '',
  ADD COLUMN IF NOT EXISTS telegram_bot_token VARCHAR(200) DEFAULT '';
