CREATE TABLE fee_policies (
 version VARCHAR(80) PRIMARY KEY, currency CHAR(3) NOT NULL, rules JSON NOT NULL,
 live_approved BOOLEAN NOT NULL DEFAULT FALSE, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
CREATE TABLE connected_accounts (
 organizer_id CHAR(36) PRIMARY KEY, stripe_account_id VARCHAR(100) NOT NULL UNIQUE,
 charges_enabled BOOLEAN NOT NULL DEFAULT FALSE, payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
 instant_eligible BOOLEAN NOT NULL DEFAULT FALSE, synchronized_at DATETIME(3),
 FOREIGN KEY(organizer_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE authorization_quotes (
 id CHAR(36) PRIMARY KEY, order_id CHAR(36) NOT NULL, member_id CHAR(36) NOT NULL,
 order_revision INT NOT NULL, policy_version VARCHAR(80) NOT NULL, currency CHAR(3) NOT NULL DEFAULT 'CAD',
 basket JSON NOT NULL, grocery_cents INT NOT NULL, estimated_fee_cents INT NOT NULL,
 estimated_tax_cents INT NOT NULL, maximum_fee_cents INT NOT NULL, maximum_total_cents INT NOT NULL,
 status ENUM('open','checkout','authorized','replaced','released','expired') NOT NULL DEFAULT 'open',
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(order_id) REFERENCES orders(id), FOREIGN KEY(member_id) REFERENCES users(id),
 FOREIGN KEY(policy_version) REFERENCES fee_policies(version),
 INDEX quote_member(order_id,member_id,status),
 CHECK(grocery_cents > 0), CHECK(maximum_total_cents >= grocery_cents),
 CHECK(maximum_fee_cents >= estimated_fee_cents)
) ENGINE=InnoDB;
CREATE TABLE payment_authorizations (
 id CHAR(36) PRIMARY KEY, quote_id CHAR(36) NOT NULL UNIQUE,
 checkout_session_id VARCHAR(100) UNIQUE, payment_intent_id VARCHAR(100) UNIQUE,
 status ENUM('checkout','authorized','renewal_required','cancel_pending','released','captured','expired','needs_attention') NOT NULL DEFAULT 'checkout',
 currency CHAR(3) NOT NULL DEFAULT 'CAD', authorized_cents INT NOT NULL,
 capturable_cents INT NOT NULL DEFAULT 0, capture_before DATETIME(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 FOREIGN KEY(quote_id) REFERENCES authorization_quotes(id),
 CHECK(authorized_cents > 0), CHECK(capturable_cents >= 0)
) ENGINE=InnoDB;
CREATE TABLE close_batches (
 id CHAR(36) PRIMARY KEY, order_id CHAR(36) NOT NULL UNIQUE, order_revision INT NOT NULL,
 policy_version VARCHAR(80) NOT NULL, currency CHAR(3) NOT NULL DEFAULT 'CAD',
 snapshot JSON NOT NULL, grocery_cents INT NOT NULL, organizer_cents INT NOT NULL,
 payout_cents INT NOT NULL, status ENUM('preflight','capturing','capture_recovery','captured','transferring','payout_pending','funded','refund_pending','cancelled','needs_attention') NOT NULL DEFAULT 'preflight',
 recovery_deadline DATETIME(3) NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(order_id) REFERENCES orders(id), FOREIGN KEY(policy_version) REFERENCES fee_policies(version),
 CHECK(grocery_cents > 0), CHECK(organizer_cents >= 0), CHECK(payout_cents = grocery_cents + organizer_cents)
) ENGINE=InnoDB;
CREATE TABLE capture_instructions (
 id CHAR(36) PRIMARY KEY, batch_id CHAR(36) NOT NULL, member_id CHAR(36) NOT NULL,
 authorization_id CHAR(36) NOT NULL UNIQUE, grocery_cents INT NOT NULL,
 service_fee_cents INT NOT NULL, fee_tax_cents INT NOT NULL, total_cents INT NOT NULL,
 status ENUM('pending','requested','succeeded','failed','unknown','refund_pending','refunded') NOT NULL DEFAULT 'pending',
 stripe_charge_id VARCHAR(100) UNIQUE, captured_cents INT NOT NULL DEFAULT 0,
 FOREIGN KEY(batch_id) REFERENCES close_batches(id), FOREIGN KEY(member_id) REFERENCES users(id),
 FOREIGN KEY(authorization_id) REFERENCES payment_authorizations(id), UNIQUE(batch_id,member_id),
 CHECK(total_cents = grocery_cents + service_fee_cents + fee_tax_cents), CHECK(captured_cents >= 0)
) ENGINE=InnoDB;
CREATE TABLE payment_operations (
 operation_key VARCHAR(180) PRIMARY KEY, kind ENUM('checkout','cancel','capture','transfer','payout','refund','transfer_reversal') NOT NULL,
 owner_id CHAR(36) NOT NULL, status ENUM('pending','running','succeeded','unknown','failed') NOT NULL DEFAULT 'pending',
 request_data JSON NOT NULL, provider_id VARCHAR(100), attempts INT NOT NULL DEFAULT 0,
 last_error VARCHAR(500), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 INDEX operation_status(status,kind,updated_at)
) ENGINE=InnoDB;
CREATE TABLE stripe_events (
 stripe_event_id VARCHAR(100) PRIMARY KEY, event_type VARCHAR(120) NOT NULL,
 object_id VARCHAR(100) NOT NULL, livemode BOOLEAN NOT NULL, api_version VARCHAR(40),
 status ENUM('pending','processed','needs_attention') NOT NULL DEFAULT 'pending',
 received_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), processed_at DATETIME(3),
 INDEX event_queue(status,received_at)
) ENGINE=InnoDB;
CREATE TABLE group_transfers (
 id CHAR(36) PRIMARY KEY, batch_id CHAR(36) NOT NULL, instruction_id CHAR(36) NOT NULL UNIQUE,
 stripe_transfer_id VARCHAR(100) UNIQUE, grocery_cents INT NOT NULL, organizer_cents INT NOT NULL,
 status ENUM('pending','requested','succeeded','unknown','failed','reversed') NOT NULL DEFAULT 'pending',
 FOREIGN KEY(batch_id) REFERENCES close_batches(id), FOREIGN KEY(instruction_id) REFERENCES capture_instructions(id),
 CHECK(grocery_cents >= 0), CHECK(organizer_cents >= 0)
) ENGINE=InnoDB;
CREATE TABLE group_payouts (
 id CHAR(36) PRIMARY KEY, batch_id CHAR(36) NOT NULL UNIQUE, stripe_payout_id VARCHAR(100) UNIQUE,
 amount_cents INT NOT NULL, status ENUM('pending','requested','in_transit','paid','unknown','failed') NOT NULL DEFAULT 'pending',
 requested_at DATETIME(3), paid_at DATETIME(3),
 FOREIGN KEY(batch_id) REFERENCES close_batches(id), CHECK(amount_cents > 0)
) ENGINE=InnoDB;
CREATE TABLE payment_refunds (
 id CHAR(36) PRIMARY KEY, instruction_id CHAR(36) NOT NULL, operation_key VARCHAR(180) NOT NULL UNIQUE,
 stripe_refund_id VARCHAR(100) UNIQUE, grocery_cents INT NOT NULL, service_fee_cents INT NOT NULL,
 fee_tax_cents INT NOT NULL, amount_cents INT NOT NULL,
 status ENUM('pending','requested','succeeded','unknown','failed') NOT NULL DEFAULT 'pending',
 FOREIGN KEY(instruction_id) REFERENCES capture_instructions(id),
 CHECK(amount_cents = grocery_cents + service_fee_cents + fee_tax_cents)
) ENGINE=InnoDB;
CREATE TABLE organizer_advance_recoveries (
 id CHAR(36) PRIMARY KEY, batch_id CHAR(36) NOT NULL, grocery_cents INT NOT NULL,
 compensation_cents INT NOT NULL, recovered_cents INT NOT NULL DEFAULT 0,
 status ENUM('due','partial','recovered','needs_attention') NOT NULL DEFAULT 'due',
 FOREIGN KEY(batch_id) REFERENCES close_batches(id),
 CHECK(grocery_cents >= 0), CHECK(compensation_cents >= 0), CHECK(recovered_cents >= 0)
) ENGINE=InnoDB;
CREATE TABLE journal_entries (
 id CHAR(36) PRIMARY KEY, event_key VARCHAR(180) NOT NULL UNIQUE,
 description VARCHAR(240) NOT NULL, currency CHAR(3) NOT NULL DEFAULT 'CAD',
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
CREATE TABLE journal_lines (
 entry_id CHAR(36) NOT NULL, line_no INT NOT NULL, account VARCHAR(80) NOT NULL,
 debit_cents INT NOT NULL DEFAULT 0, credit_cents INT NOT NULL DEFAULT 0,
 PRIMARY KEY(entry_id,line_no), FOREIGN KEY(entry_id) REFERENCES journal_entries(id),
 CHECK(debit_cents >= 0), CHECK(credit_cents >= 0),
 CHECK((debit_cents = 0 AND credit_cents > 0) OR (credit_cents = 0 AND debit_cents > 0))
) ENGINE=InnoDB;
