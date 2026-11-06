ALTER TABLE funding_takeovers ADD COLUMN status ENUM('reserved','paid','released') NOT NULL DEFAULT 'reserved';
ALTER TABLE funding_instructions ADD COLUMN provider_fee_cents INT NULL;
ALTER TABLE funding_instructions MODIFY COLUMN purpose ENUM('initial','takeover','supplement') NOT NULL;
ALTER TABLE funding_payouts MODIFY COLUMN purpose VARCHAR(64) NOT NULL;
CREATE TABLE funding_supplements (
 id CHAR(36) PRIMARY KEY, order_id CHAR(36) NOT NULL, item_id CHAR(36) NOT NULL,
 original_price_cents INT NOT NULL, new_price_cents INT NOT NULL, snapshot JSON NOT NULL,
 status ENUM('approval_needed','collecting','funding','funded','cancelled') NOT NULL DEFAULT 'approval_needed',
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE, INDEX supplement_order(order_id,status)
) ENGINE=InnoDB;
ALTER TABLE funding_instructions ADD COLUMN supplement_id CHAR(36) NULL, ADD UNIQUE KEY supplement_member(supplement_id,member_id);
