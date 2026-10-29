CREATE TABLE users (
 id CHAR(36) PRIMARY KEY, email VARCHAR(254) NOT NULL UNIQUE, name VARCHAR(60) NOT NULL,
 password_hash VARCHAR(256) NOT NULL, verified BOOLEAN NOT NULL DEFAULT FALSE,
 photo MEDIUMTEXT, demo BOOLEAN NOT NULL DEFAULT FALSE, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
CREATE TABLE verification_tokens (
 token_hash CHAR(64) PRIMARY KEY, user_id CHAR(36) NOT NULL, expires_at DATETIME(3) NOT NULL,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE sessions (
 token_hash CHAR(64) PRIMARY KEY, user_id CHAR(36) NOT NULL, expires_at DATETIME(3) NOT NULL,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, INDEX(expires_at)
) ENGINE=InnoDB;
CREATE TABLE communities (id CHAR(36) PRIMARY KEY, name VARCHAR(80) NOT NULL, interest_target INT NOT NULL DEFAULT 3, CHECK(interest_target BETWEEN 1 AND 100)) ENGINE=InnoDB;
INSERT INTO communities VALUES('uvic','UVic community',3);
CREATE TABLE orders (
 id CHAR(36) PRIMARY KEY, community_id CHAR(36) NOT NULL DEFAULT 'uvic', organizer_id CHAR(36) NOT NULL,
 name VARCHAR(80) NOT NULL, store VARCHAR(80) NOT NULL, kind ENUM('community','quick') NOT NULL DEFAULT 'community',
 visibility ENUM('public','private') NOT NULL DEFAULT 'public', status ENUM('draft','open','locked','shopping','ready','completed','cancelled') NOT NULL DEFAULT 'draft',
 deadline DATETIME(3) NOT NULL, purchase_at DATETIME(3) NOT NULL, pickup_at DATETIME(3) NOT NULL, pickup_end DATETIME(3) NOT NULL,
 pickup_location VARCHAR(160) NOT NULL, pickup_lat DECIMAL(10,7), pickup_lng DECIMAL(10,7), public_pickup BOOLEAN NOT NULL,
 max_members INT NOT NULL DEFAULT 6, cadence ENUM('once','weekly','monthly') NOT NULL DEFAULT 'once',
 invite_hash CHAR(64) NOT NULL, invite_token VARCHAR(64) NOT NULL, revision INT NOT NULL DEFAULT 1,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(community_id) REFERENCES communities(id), FOREIGN KEY(organizer_id) REFERENCES users(id),
 CHECK(max_members BETWEEN 2 AND 10), CHECK(deadline <= purchase_at AND purchase_at <= pickup_at AND pickup_at < pickup_end), INDEX(status, deadline)
) ENGINE=InnoDB;
CREATE TABLE order_items (
 id CHAR(36) PRIMARY KEY, order_id CHAR(36) NOT NULL, name VARCHAR(100) NOT NULL, category VARCHAR(40) NOT NULL,
 pack_label VARCHAR(60) NOT NULL, share_label VARCHAR(60) NOT NULL, shares_per_pack INT NOT NULL, pack_count INT NOT NULL,
 price_cents INT NOT NULL, original_price_cents INT NOT NULL, reference_share_cents INT,
 storage VARCHAR(180) NOT NULL DEFAULT '', portioning VARCHAR(240) NOT NULL DEFAULT '', available BOOLEAN NOT NULL DEFAULT TRUE,
 bought BOOLEAN NOT NULL DEFAULT FALSE, shortfall_decision ENUM('pending','proceed','skip') NOT NULL DEFAULT 'pending',
 FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
 CHECK(shares_per_pack BETWEEN 1 AND 1000), CHECK(pack_count BETWEEN 1 AND 100), CHECK(price_cents BETWEEN 1 AND 1000000)
) ENGINE=InnoDB;
CREATE TABLE memberships (
 order_id CHAR(36) NOT NULL, user_id CHAR(36) NOT NULL, attending BOOLEAN NOT NULL DEFAULT TRUE, arrived BOOLEAN NOT NULL DEFAULT FALSE,
 packed BOOLEAN NOT NULL DEFAULT FALSE, collected_at DATETIME(3), joined_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(order_id,user_id), FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE, FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE share_claims (
 item_id CHAR(36) NOT NULL, user_id CHAR(36) NOT NULL, quantity INT NOT NULL,
 PRIMARY KEY(item_id,user_id), FOREIGN KEY(item_id) REFERENCES order_items(id) ON DELETE CASCADE, FOREIGN KEY(user_id) REFERENCES users(id), CHECK(quantity > 0)
) ENGINE=InnoDB;
CREATE TABLE collection_tokens (
 order_id CHAR(36) NOT NULL, user_id CHAR(36) NOT NULL, token_hash CHAR(64) NOT NULL UNIQUE,
 code VARCHAR(32) NOT NULL, used_at DATETIME(3), PRIMARY KEY(order_id,user_id),
 FOREIGN KEY(order_id,user_id) REFERENCES memberships(order_id,user_id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE product_requests (
 id CHAR(36) PRIMARY KEY, community_id CHAR(36) NOT NULL DEFAULT 'uvic', creator_id CHAR(36) NOT NULL,
 name VARCHAR(100) NOT NULL, normalized_name VARCHAR(100) NOT NULL, note VARCHAR(300) NOT NULL DEFAULT '',
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), UNIQUE(community_id,normalized_name),
 FOREIGN KEY(community_id) REFERENCES communities(id), FOREIGN KEY(creator_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE request_votes (
 request_id CHAR(36) NOT NULL, user_id CHAR(36) NOT NULL, PRIMARY KEY(request_id,user_id),
 FOREIGN KEY(request_id) REFERENCES product_requests(id) ON DELETE CASCADE, FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE notifications (
 id CHAR(36) PRIMARY KEY, user_id CHAR(36) NOT NULL, order_id CHAR(36), message VARCHAR(400) NOT NULL,
 event_key VARCHAR(180) NOT NULL, seen BOOLEAN NOT NULL DEFAULT FALSE, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE(user_id,event_key), FOREIGN KEY(user_id) REFERENCES users(id), FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE device_tokens (
 token VARCHAR(512) PRIMARY KEY, user_id CHAR(36) NOT NULL, platform ENUM('android','ios') NOT NULL,
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE push_deliveries (
 notification_id CHAR(36) PRIMARY KEY, status ENUM('pending','sending','sent') NOT NULL DEFAULT 'pending', attempts INT NOT NULL DEFAULT 0,
 locked_at DATETIME(3), FOREIGN KEY(notification_id) REFERENCES notifications(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE job_executions (job_key VARCHAR(180) PRIMARY KEY, ran_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB;
