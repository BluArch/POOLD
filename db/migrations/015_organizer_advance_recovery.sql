CREATE TABLE funding_advance_recoveries (
 order_id CHAR(36) PRIMARY KEY, organizer_id CHAR(36) NOT NULL, amount_cents INT NOT NULL,
 recovered_cents INT NOT NULL DEFAULT 0, status ENUM('due','recovered') NOT NULL DEFAULT 'due',
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
 FOREIGN KEY(organizer_id) REFERENCES users(id), CHECK(recovered_cents>=0 AND recovered_cents<=amount_cents)
) ENGINE=InnoDB;
