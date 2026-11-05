CREATE TABLE password_resets (
 user_id CHAR(36) PRIMARY KEY,
 nonce CHAR(64) NOT NULL,
 code_hash CHAR(64) NOT NULL,
 attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
 expires_at DATETIME(3) NOT NULL,
 resend_at DATETIME(3) NOT NULL,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
 CHECK(attempts <= 5), INDEX(expires_at)
) ENGINE=InnoDB;
