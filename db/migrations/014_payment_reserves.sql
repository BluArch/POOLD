-- Demo capital is simulated, Stripe capital must be explicitly funded and reconciled before allocation.
CREATE TABLE payment_reserves (
 provider ENUM('demo','stripe_test') PRIMARY KEY, available_cents BIGINT NOT NULL DEFAULT 0,
 CHECK(available_cents>=0)
) ENGINE=InnoDB;
INSERT INTO payment_reserves(provider,available_cents) VALUES('demo',1000000),('stripe_test',0);
CREATE TABLE funding_reserve_allocations (
 order_id CHAR(36) NOT NULL, purpose VARCHAR(64) NOT NULL, amount_cents INT NOT NULL,
 PRIMARY KEY(order_id,purpose), FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB;
