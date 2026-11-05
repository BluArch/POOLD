CREATE TABLE wishlists (
 id CHAR(36) PRIMARY KEY,
 creator_id CHAR(36) NOT NULL,
 title VARCHAR(80) NOT NULL,
 store VARCHAR(80) NOT NULL,
 pickup_location VARCHAR(160) NOT NULL,
 note VARCHAR(280) NOT NULL DEFAULT '',
 status ENUM('open','claimed','closed') NOT NULL DEFAULT 'open',
 order_id CHAR(36) NULL,
 organizer_id CHAR(36) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(creator_id) REFERENCES users(id),
 FOREIGN KEY(organizer_id) REFERENCES users(id),
 FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE SET NULL,
 INDEX(status, created_at)
) ENGINE=InnoDB;
CREATE TABLE wishlist_members (
 wishlist_id CHAR(36) NOT NULL,
 user_id CHAR(36) NOT NULL,
 joined_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(wishlist_id, user_id),
 FOREIGN KEY(wishlist_id) REFERENCES wishlists(id) ON DELETE CASCADE,
 FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE wishlist_items (
 id CHAR(36) PRIMARY KEY,
 wishlist_id CHAR(36) NOT NULL,
 name VARCHAR(120) NOT NULL,
 catalog_key VARCHAR(40) NULL,
 added_by CHAR(36) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(wishlist_id) REFERENCES wishlists(id) ON DELETE CASCADE,
 FOREIGN KEY(added_by) REFERENCES users(id),
 UNIQUE(wishlist_id, name)
) ENGINE=InnoDB;
CREATE TABLE wishlist_wants (
 item_id CHAR(36) NOT NULL,
 user_id CHAR(36) NOT NULL,
 PRIMARY KEY(item_id, user_id),
 FOREIGN KEY(item_id) REFERENCES wishlist_items(id) ON DELETE CASCADE,
 FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB;
