ALTER TABLE order_items ADD COLUMN price_source ENUM('legacy','manual','demo','retailer') NOT NULL DEFAULT 'legacy';
