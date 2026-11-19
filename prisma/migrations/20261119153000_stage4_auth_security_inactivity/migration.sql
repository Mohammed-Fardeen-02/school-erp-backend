-- AlterTable auth.users
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP(3);
UPDATE auth.users SET password_changed_at = created_at WHERE password_changed_at IS NULL;

-- AlterTable auth.sessions
ALTER TABLE auth.sessions ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE auth.sessions ADD COLUMN IF NOT EXISTS absolute_expires_at TIMESTAMP(3);
UPDATE auth.sessions SET absolute_expires_at = created_at + INTERVAL '7 days' WHERE absolute_expires_at IS NULL;
