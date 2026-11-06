CREATE TABLE payment_methods (
 user_id CHAR(36) PRIMARY KEY,
 brand VARCHAR(20) NOT NULL,
 last4 CHAR(4) NOT NULL,
 outcome ENUM('ok','declined','funds') NOT NULL DEFAULT 'ok',
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE holds (
 order_id CHAR(36) NOT NULL,
 user_id CHAR(36) NOT NULL,
 amount_cents INT UNSIGNED NOT NULL,
 status ENUM('authorized','failed','captured','released') NOT NULL,
 card_brand VARCHAR(20) NULL,
 card_last4 CHAR(4) NULL,
 reason VARCHAR(160) NULL,
 retry_until DATETIME(3) NULL,
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 PRIMARY KEY(order_id, user_id),
 FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
 FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB;
ALTER TABLE orders ADD COLUMN published_at DATETIME(3) NULL;
UPDATE orders SET published_at=created_at WHERE status<>'draft';
