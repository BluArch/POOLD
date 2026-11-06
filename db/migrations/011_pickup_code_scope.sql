-- Pickup codes are 6 digits, so they only need to be unique within a group.
ALTER TABLE collection_tokens DROP INDEX token_hash, ADD UNIQUE KEY order_token (order_id, token_hash);
