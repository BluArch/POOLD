ALTER TABLE order_items
 ADD COLUMN unit VARCHAR(30) NULL,
 ADD COLUMN pack_units INT NULL,
 ADD COLUMN share_units INT NULL,
 ADD COLUMN catalog_key VARCHAR(60) NULL;
ALTER TABLE product_requests
 ADD COLUMN order_id CHAR(36) NULL,
 ADD COLUMN status ENUM('open','added','declined') NOT NULL DEFAULT 'open',
 ADD COLUMN scope_key VARCHAR(36) AS (COALESCE(order_id,'community')) VIRTUAL,
 ADD CONSTRAINT fk_request_order FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE;
ALTER TABLE product_requests ADD UNIQUE KEY request_scope_name (community_id,scope_key,normalized_name);
ALTER TABLE product_requests DROP INDEX community_id
