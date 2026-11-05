CREATE TABLE payouts (
 id CHAR(36) PRIMARY KEY,
 order_id CHAR(36) NOT NULL,
 kind ENUM('shopping','fees') NOT NULL,
 amount_cents INT UNSIGNED NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
 UNIQUE(order_id, kind)
) ENGINE=InnoDB;
CREATE TABLE shopping_proofs (
 order_id CHAR(36) PRIMARY KEY,
 receipt_photo MEDIUMTEXT NOT NULL,
 items_photo MEDIUMTEXT NOT NULL,
 receipt_total_cents INT UNSIGNED NOT NULL,
 uploaded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB;
ALTER TABLE memberships ADD COLUMN no_show_at DATETIME(3) NULL;
CREATE TABLE no_shows (
 id CHAR(36) PRIMARY KEY,
 user_id CHAR(36) NOT NULL,
 order_id CHAR(36) NULL,
 role ENUM('buyer','organizer') NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(user_id) REFERENCES users(id),
 FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE SET NULL,
 UNIQUE(user_id, order_id), INDEX(user_id, created_at)
) ENGINE=InnoDB;
CREATE TABLE ratings (
 order_id CHAR(36) NOT NULL,
 buyer_id CHAR(36) NOT NULL,
 organizer_id CHAR(36) NOT NULL,
 stars TINYINT UNSIGNED NOT NULL,
 comment VARCHAR(280) NOT NULL DEFAULT '',
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(order_id, buyer_id),
 FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
 FOREIGN KEY(buyer_id) REFERENCES users(id),
 FOREIGN KEY(organizer_id) REFERENCES users(id),
 INDEX(organizer_id), CHECK(stars BETWEEN 1 AND 5)
) ENGINE=InnoDB;
