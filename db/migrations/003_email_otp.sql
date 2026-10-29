CREATE TABLE email_verifications (
 user_id CHAR(36) PRIMARY KEY,
 nonce CHAR(64) NOT NULL,
 code_hash CHAR(64) NOT NULL,
 attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
 expires_at DATETIME(3) NOT NULL,
 resend_at DATETIME(3) NOT NULL,
 delivery ENUM('pending','smtp','outbox','failed') NOT NULL DEFAULT 'pending',
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
 CHECK(attempts <= 5), INDEX(expires_at)
) ENGINE=InnoDB;
DELETE FROM verification_tokens;
