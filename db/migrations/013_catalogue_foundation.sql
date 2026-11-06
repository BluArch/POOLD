CREATE TABLE retailers (
 id VARCHAR(40) PRIMARY KEY, name VARCHAR(80) NOT NULL, country CHAR(2) NOT NULL DEFAULT 'CA', active BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;
INSERT INTO retailers(id,name) VALUES
 ('costco','Costco'),('wholesale-club','Real Canadian Wholesale Club'),('bulk-barn','Bulk Barn'),('walmart','Walmart');
CREATE TABLE store_locations (
 id CHAR(36) PRIMARY KEY, retailer_id VARCHAR(40) NOT NULL, source_id VARCHAR(120), name VARCHAR(120) NOT NULL,
 address VARCHAR(240) NOT NULL, city VARCHAR(80) NOT NULL, region VARCHAR(40) NOT NULL, postal_code VARCHAR(16),
 channel ENUM('warehouse','store','pickup','online','delivery') NOT NULL DEFAULT 'store', active BOOLEAN NOT NULL DEFAULT TRUE,
 verified_at DATETIME(3), FOREIGN KEY(retailer_id) REFERENCES retailers(id),
 UNIQUE KEY location_source(retailer_id,source_id), INDEX location_retailer(retailer_id,active,city)
) ENGINE=InnoDB;
CREATE TABLE catalogue_sources (
 id CHAR(36) PRIMARY KEY, retailer_id VARCHAR(40) NOT NULL, name VARCHAR(120) NOT NULL, channel VARCHAR(40) NOT NULL,
 access_method VARCHAR(80) NOT NULL, coverage_note TEXT NOT NULL, rights_note TEXT NOT NULL,
 authoritative_count BIGINT, last_full_sync_at DATETIME(3), last_delta_sync_at DATETIME(3),
 FOREIGN KEY(retailer_id) REFERENCES retailers(id), UNIQUE KEY source_name(retailer_id,name)
) ENGINE=InnoDB;
CREATE TABLE catalogue_products (
 id CHAR(36) PRIMARY KEY, source_id CHAR(36) NOT NULL, source_product_id VARCHAR(160) NOT NULL,
 gtin VARCHAR(32), brand VARCHAR(120), name VARCHAR(200) NOT NULL, source_category VARCHAR(160) NOT NULL,
 category VARCHAR(40), orderability_reason VARCHAR(160), image_url VARCHAR(1000),
 pack_label VARCHAR(120), unit VARCHAR(30), pack_units INT, unit_detail VARCHAR(120),
 source_data JSON, active BOOLEAN NOT NULL DEFAULT TRUE, updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(source_id) REFERENCES catalogue_sources(id), UNIQUE KEY source_product(source_id,source_product_id),
 INDEX product_category(source_id,category,active,id), INDEX product_gtin(gtin), FULLTEXT KEY product_search(name,brand,source_category,source_product_id)
) ENGINE=InnoDB;
CREATE TABLE store_offers (
 id CHAR(36) PRIMARY KEY, product_id CHAR(36) NOT NULL, location_id CHAR(36) NOT NULL,
 seller_key VARCHAR(120) NOT NULL DEFAULT 'first-party', source_offer_id VARCHAR(160) NOT NULL,
 price_basis ENUM('pack','each','100g','kg','100ml','litre') NOT NULL,
 price_cents INT, currency CHAR(3) NOT NULL DEFAULT 'CAD', tax_included BOOLEAN NOT NULL DEFAULT FALSE,
 deposit_cents INT NOT NULL DEFAULT 0, availability ENUM('unknown','available','unavailable') NOT NULL DEFAULT 'unknown',
 orderable BOOLEAN NOT NULL DEFAULT FALSE, orderability_reason VARCHAR(160), revision BIGINT NOT NULL DEFAULT 1,
 observed_at DATETIME(3), promotion_ends_at DATETIME(3), active BOOLEAN NOT NULL DEFAULT TRUE,
 FOREIGN KEY(product_id) REFERENCES catalogue_products(id), FOREIGN KEY(location_id) REFERENCES store_locations(id),
 UNIQUE KEY scoped_offer(location_id,seller_key,source_offer_id), INDEX offer_picker(location_id,orderable,active,product_id),
 CHECK(price_cents IS NULL OR price_cents BETWEEN 1 AND 100000000), CHECK(deposit_cents BETWEEN 0 AND 100000000)
) ENGINE=InnoDB;
CREATE TABLE price_observations (
 id CHAR(36) PRIMARY KEY, offer_id CHAR(36) NOT NULL, price_cents INT NOT NULL, currency CHAR(3) NOT NULL,
 price_basis VARCHAR(16) NOT NULL, tax_included BOOLEAN NOT NULL, deposit_cents INT NOT NULL,
 observed_at DATETIME(3) NOT NULL, source_at DATETIME(3), promotion_ends_at DATETIME(3), evidence VARCHAR(1000),
 FOREIGN KEY(offer_id) REFERENCES store_offers(id), INDEX observation_history(offer_id,observed_at),
 CHECK(price_cents BETWEEN 1 AND 100000000)
) ENGINE=InnoDB;
CREATE TABLE catalogue_sync_runs (
 id CHAR(36) PRIMARY KEY, source_id CHAR(36) NOT NULL, scope VARCHAR(240) NOT NULL,
 status ENUM('running','completed','failed') NOT NULL DEFAULT 'running', cursor_value VARCHAR(1000),
 received_count BIGINT NOT NULL DEFAULT 0, accepted_count BIGINT NOT NULL DEFAULT 0,
 quarantined_count BIGINT NOT NULL DEFAULT 0, expected_count BIGINT,
 started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), finished_at DATETIME(3), error_text TEXT,
 FOREIGN KEY(source_id) REFERENCES catalogue_sources(id), INDEX sync_status(source_id,status,started_at)
) ENGINE=InnoDB;
CREATE TABLE catalogue_import_errors (
 id CHAR(36) PRIMARY KEY, run_id CHAR(36) NOT NULL, source_product_id VARCHAR(160), reason VARCHAR(500) NOT NULL,
 source_data JSON, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(run_id) REFERENCES catalogue_sync_runs(id), INDEX import_errors(run_id)
) ENGINE=InnoDB;
ALTER TABLE orders ADD COLUMN retailer_id VARCHAR(40) NULL, ADD COLUMN location_id CHAR(36) NULL,
 ADD CONSTRAINT fk_order_retailer FOREIGN KEY(retailer_id) REFERENCES retailers(id),
 ADD CONSTRAINT fk_order_location FOREIGN KEY(location_id) REFERENCES store_locations(id);
ALTER TABLE order_items ADD COLUMN catalogue_product_id CHAR(36) NULL, ADD COLUMN offer_id CHAR(36) NULL,
 ADD COLUMN offer_revision BIGINT NULL, ADD COLUMN price_observation_id CHAR(36) NULL,
 ADD COLUMN price_basis VARCHAR(16) NULL,
 ADD CONSTRAINT fk_item_catalogue_product FOREIGN KEY(catalogue_product_id) REFERENCES catalogue_products(id),
 ADD CONSTRAINT fk_item_offer FOREIGN KEY(offer_id) REFERENCES store_offers(id),
 ADD CONSTRAINT fk_item_observation FOREIGN KEY(price_observation_id) REFERENCES price_observations(id);
