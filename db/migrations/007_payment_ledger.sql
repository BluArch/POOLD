CREATE TABLE payments (
 id CHAR(36) PRIMARY KEY,
 order_id CHAR(36) NOT NULL,
 user_id CHAR(36) NOT NULL,
 kind ENUM('payment','refund') NOT NULL,
 amount_cents INT UNSIGNED NOT NULL,
 mode ENUM('stripe_test','demo') NOT NULL,
 ref VARCHAR(255) NULL,
 card_brand VARCHAR(20) NULL,
 card_last4 CHAR(4) NULL,
 note VARCHAR(160) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
 FOREIGN KEY(user_id) REFERENCES users(id),
 UNIQUE(ref), INDEX(order_id,user_id), CHECK(amount_cents > 0)
) ENGINE=InnoDB;
INSERT INTO payments(id,order_id,user_id,kind,amount_cents,mode,ref,created_at)
 SELECT UUID(),order_id,user_id,'payment',paid_cents,COALESCE(payment_mode,'demo'),payment_ref,COALESCE(paid_at,UTC_TIMESTAMP(3))
 FROM memberships WHERE paid_cents IS NOT NULL AND paid_cents > 0;
