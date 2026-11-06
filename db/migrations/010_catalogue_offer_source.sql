ALTER TABLE store_offers ADD COLUMN source_id CHAR(36) NULL;
UPDATE store_offers o JOIN catalogue_products p ON p.id=o.product_id SET o.source_id=p.source_id;
ALTER TABLE store_offers MODIFY COLUMN source_id CHAR(36) NOT NULL,
 ADD CONSTRAINT fk_offer_source FOREIGN KEY(source_id) REFERENCES catalogue_sources(id),
 DROP INDEX scoped_offer,
 ADD UNIQUE KEY scoped_offer(source_id,location_id,seller_key,source_offer_id);
