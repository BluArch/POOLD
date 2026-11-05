ALTER TABLE memberships
 ADD COLUMN paid_cents INT UNSIGNED NULL,
 ADD COLUMN paid_at DATETIME(3) NULL,
 ADD COLUMN payment_mode ENUM('stripe_test','demo') NULL,
 ADD COLUMN payment_ref VARCHAR(255) NULL;
