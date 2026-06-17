CREATE TABLE t_p54486869_greeting_initiative_.wa_accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES t_p54486869_greeting_initiative_.users(id),
    name VARCHAR(200) NOT NULL DEFAULT '',
    platform VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
    instance_id VARCHAR(100) NOT NULL DEFAULT '',
    token VARCHAR(200) NOT NULL DEFAULT '',
    status VARCHAR(50) NOT NULL DEFAULT 'disconnected',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_wa_accounts_user_id ON t_p54486869_greeting_initiative_.wa_accounts(user_id);
