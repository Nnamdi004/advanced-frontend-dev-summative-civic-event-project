CREATE TABLE IF NOT EXISTS user_notification_reads (
    notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (notification_id, user_id)
);
