USE inventory_db;

INSERT INTO products (sku, name, description, price, quantity)
VALUES
('SKU-1001', 'USB Flash Drive 32GB', '32GB USB 3.0 Flash Drive', 6.50, 120),
('SKU-1002', 'Wireless Mouse', 'Ergonomic wireless mouse', 12.99, 80),
('SKU-1003', 'Mechanical Keyboard', 'RGB mechanical keyboard', 59.99, 25),
('SKU-1004', '27" Monitor', 'Full HD 27 inch monitor', 129.99, 15);

INSERT INTO customers (name, email, phone) VALUES
('Alice Johnson', 'alice@example.com', '555-1010'),
('Bob Kumar', 'bob@example.com', '555-2020');