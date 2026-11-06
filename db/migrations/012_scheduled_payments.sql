-- Append-only replacement for legacy demo holds and sandbox authorizations.
-- Old tables/objects are retained for explicit reconciliation, never converted to consent.
CREATE TABLE payment_profiles (
 user_id CHAR(36) PRIMARY KEY, provider ENUM('demo','stripe_test') NOT NULL,
 customer_id VARCHAR(100), method_id VARCHAR(100), setup_session_id VARCHAR(100),
 method_version INT NOT NULL DEFAULT 1, ready BOOLEAN NOT NULL DEFAULT FALSE,
 brand VARCHAR(20), last4 CHAR(4), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE payment_approvals (
 id CHAR(36) PRIMARY KEY, order_id CHAR(36) NOT NULL, member_id CHAR(36) NOT NULL,
 fingerprint CHAR(64) NOT NULL, snapshot JSON NOT NULL,
 status ENUM('approved','revoked','used') NOT NULL DEFAULT 'approved',
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
 FOREIGN KEY(member_id) REFERENCES users(id), INDEX approval_member(order_id,member_id,status)
) ENGINE=InnoDB;
CREATE TABLE funding_batches (
 order_id CHAR(36) PRIMARY KEY, revision INT NOT NULL DEFAULT 1, provider ENUM('demo','stripe_test') NOT NULL,
 status ENUM('approval_needed','charging','payment_recovery','takeover_open','funding','funded','refund_pending','cancelled','needs_attention') NOT NULL,
 snapshot JSON NOT NULL, grocery_cents INT NOT NULL DEFAULT 0, reward_cents INT NOT NULL DEFAULT 0,
 retry_until DATETIME(3) NOT NULL, takeover_until DATETIME(3) NOT NULL,
 organizer_confirmed BOOLEAN NOT NULL DEFAULT TRUE, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE funding_revisions (
 order_id CHAR(36) NOT NULL, revision INT NOT NULL, snapshot JSON NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY(order_id,revision),
 FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE funding_instructions (
 id CHAR(36) PRIMARY KEY, order_id CHAR(36) NOT NULL, member_id CHAR(36) NOT NULL,
 approval_id CHAR(36), purpose ENUM('initial','takeover') NOT NULL, basket_lines JSON NOT NULL, method JSON NOT NULL,
 grocery_cents INT NOT NULL, markup_cents INT NOT NULL, fee_cents INT NOT NULL, tax_cents INT NOT NULL,
 total_cents INT NOT NULL, status ENUM('queued','processing','requires_action','failed','unknown','paid','superseding','superseded','refund_pending','refunded') NOT NULL DEFAULT 'queued',
 provider_id VARCHAR(100), charge_id VARCHAR(100), attempts INT NOT NULL DEFAULT 0,
 refunded_cents INT NOT NULL DEFAULT 0, failure VARCHAR(160), created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE, FOREIGN KEY(member_id) REFERENCES users(id),
 INDEX instruction_order(order_id,status), UNIQUE(approval_id), CHECK(total_cents=grocery_cents+markup_cents+fee_cents+tax_cents)
) ENGINE=InnoDB;
CREATE TABLE funding_shares (
 id CHAR(36) PRIMARY KEY, order_id CHAR(36) NOT NULL, instruction_id CHAR(36) NOT NULL,
 item_id CHAR(36) NOT NULL, original_member_id CHAR(36) NOT NULL,
 quantity INT NOT NULL, remaining INT NOT NULL, components JSON NOT NULL,
 FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
 INDEX offer_order(order_id), UNIQUE(instruction_id,item_id), CHECK(remaining>=0 AND remaining<=quantity)
) ENGINE=InnoDB;
CREATE TABLE funding_takeovers (
 id CHAR(36) PRIMARY KEY, order_id CHAR(36) NOT NULL, share_id CHAR(36) NOT NULL,
 member_id CHAR(36) NOT NULL, quantity INT NOT NULL, instruction_id CHAR(36),
 components JSON NOT NULL, organizer_owned BOOLEAN NOT NULL DEFAULT FALSE,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE funding_operations (
 operation_key VARCHAR(180) PRIMARY KEY, order_id CHAR(36), owner_id CHAR(36) NOT NULL,
 provider ENUM('demo','stripe_test') NOT NULL,
 kind ENUM('charge','cancel','refund','transfer','payout','reversal') NOT NULL,
 request JSON NOT NULL, result JSON, provider_id VARCHAR(100),
 status ENUM('pending','running','unknown','succeeded','failed','needs_attention') NOT NULL DEFAULT 'pending',
 attempts INT NOT NULL DEFAULT 0, lease_until DATETIME(3), next_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE, INDEX operation_queue(status,next_at)
) ENGINE=InnoDB;
CREATE TABLE funding_payouts (
 order_id CHAR(36) NOT NULL, purpose ENUM('grocery','completion_reward') NOT NULL,
 amount_cents INT NOT NULL, cost_cents INT NOT NULL, status ENUM('pending','transferring','in_transit','paid','needs_attention') NOT NULL DEFAULT 'pending',
 provider_id VARCHAR(100), confirmed_at DATETIME(3), PRIMARY KEY(order_id,purpose),
 FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE payment_action_links (
 token_hash CHAR(64) PRIMARY KEY, instruction_id CHAR(36) NOT NULL, member_id CHAR(36) NOT NULL,
 expires_at DATETIME(3) NOT NULL, FOREIGN KEY(instruction_id) REFERENCES funding_instructions(id) ON DELETE CASCADE
) ENGINE=InnoDB;
ALTER TABLE connected_accounts ADD COLUMN instant_destination VARCHAR(100) NULL;
