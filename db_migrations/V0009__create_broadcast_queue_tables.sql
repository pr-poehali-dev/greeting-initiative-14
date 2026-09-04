-- Задания рассылки
CREATE TABLE t_p54486869_greeting_initiative_.broadcast_jobs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES t_p54486869_greeting_initiative_.users(id),
    platform VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
    text TEXT,
    image_url TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'queued',
    total_count INTEGER NOT NULL DEFAULT 0,
    sent_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    ambiguous_count INTEGER NOT NULL DEFAULT 0,
    interval_seconds NUMERIC NOT NULL DEFAULT 2.5,
    cancel_requested BOOLEAN NOT NULL DEFAULT false,
    error TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_broadcast_jobs_user ON t_p54486869_greeting_initiative_.broadcast_jobs(user_id);
CREATE INDEX idx_broadcast_jobs_status ON t_p54486869_greeting_initiative_.broadcast_jobs(status);

-- Отдельная строка на каждую группу-получателя внутри задания
CREATE TABLE t_p54486869_greeting_initiative_.broadcast_job_items (
    id SERIAL PRIMARY KEY,
    job_id INTEGER NOT NULL REFERENCES t_p54486869_greeting_initiative_.broadcast_jobs(id),
    group_id VARCHAR(500) NOT NULL,
    group_name VARCHAR(500) NOT NULL DEFAULT '',
    instance_id VARCHAR(100) NOT NULL DEFAULT '',
    order_index INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    next_attempt_at TIMESTAMP,
    last_error TEXT,
    last_error_type VARCHAR(20),
    locked_at TIMESTAMP,
    worker_run_id VARCHAR(64),
    sent_at TIMESTAMP,
    finished_at TIMESTAMP,
    UNIQUE (job_id, group_id)
);

CREATE INDEX idx_broadcast_items_job ON t_p54486869_greeting_initiative_.broadcast_job_items(job_id);
CREATE INDEX idx_broadcast_items_claim ON t_p54486869_greeting_initiative_.broadcast_job_items(status, next_attempt_at, order_index);

-- Журнал каждой отдельной попытки отправки
CREATE TABLE t_p54486869_greeting_initiative_.broadcast_job_attempts (
    id SERIAL PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES t_p54486869_greeting_initiative_.broadcast_job_items(id),
    attempt_no INTEGER NOT NULL,
    requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
    http_status INTEGER,
    error_type VARCHAR(20),
    error_text TEXT
);

CREATE INDEX idx_broadcast_attempts_item ON t_p54486869_greeting_initiative_.broadcast_job_attempts(item_id);

-- Лок инстанса: чтобы один Green API instance не обрабатывался двумя заданиями параллельно
CREATE TABLE t_p54486869_greeting_initiative_.instance_locks (
    platform VARCHAR(20) NOT NULL,
    instance_id VARCHAR(100) NOT NULL,
    job_id INTEGER REFERENCES t_p54486869_greeting_initiative_.broadcast_jobs(id),
    locked_at TIMESTAMP,
    heartbeat_at TIMESTAMP,
    PRIMARY KEY (platform, instance_id)
);
