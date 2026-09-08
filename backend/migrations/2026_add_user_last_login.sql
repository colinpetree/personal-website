-- Tracks when a public User last completed a real sign-in (Google OAuth or
-- clicking a magic link) — see the column comment on User.last_login_at in
-- models.py. Doubles as an email-verification signal, since a magic-link
-- user row can exist (created the moment someone requests a link) without
-- ever actually verifying they control that inbox.

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;
