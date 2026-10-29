CREATE TABLE order_invitations (
 order_id CHAR(36) NOT NULL, user_id CHAR(36) NOT NULL, PRIMARY KEY(order_id,user_id),
 FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE, FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB;
