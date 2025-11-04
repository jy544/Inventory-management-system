[2:31 am, 3/11/2025] Jagan Yadav: const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const pool = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// --- PRODUCTS CRUD ---

// list products (with optional search)
app.get('/api/products', async (req, res) => {
  try {
    const q = req.query.q;
    if (q) {
      const [rows] = await pool.query(
        'SELECT * FROM products WHERE name LIKE ? OR sku LIKE ? ORDER BY id DESC',
        [%${q}%, %${q}%]
      );
      return res.json(rows);
    }
    const [rows] = await pool.query('SELECT * FROM products ORDER BY id DESC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const { sku, name, description = '', price = 0, quantity = 0 } = req.body;
    const [result] = await pool.query(
      'INSERT INTO products (sku, name, description, price, quantity) VALUES (?, ?, ?, ?, ?)',
      [sku, name, description, price, quantity]
    );
    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'SKU must be unique' });
    }
    res.status(500).json({ error: 'DB error' });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { sku, name, description = '', price = 0, quantity = 0 } = req.body;
    await pool.query(
      'UPDATE products SET sku=?, name=?, description=?, price=?, quantity=? WHERE id=?',
      [sku, name, description, price, quantity, id]
    );
    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await pool.query('DELETE FROM products WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// --- ORDERS (simple sales) ---
// Create an order and decrement product quantities
app.post('/api/orders', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { customer_id = null, items } = req.body; // items: [{product_id, quantity}]
    if (!Array.isArray(items) || items.length === 0) {
      await conn.rollback();
      return res.status(400).json({ error: 'No items' });
    }

    // compute total and check stock
    let total = 0;
    for (const it of items) {
      const [prodRows] = await conn.query('SELECT id, price, quantity FROM products WHERE id = ?', [it.product_id]);
      if (!prodRows.length) {
        await conn.rollback();
        return res.status(400).json({ error: Product ${it.product_id} not found });
      }
      const p = prodRows[0];
      if (p.quantity < it.quantity) {
        await conn.rollback();
        return res.status(400).json({ error: Insufficient stock for product id ${it.product_id} });
      }
      total += Number(p.price) * Number(it.quantity);
    }

    const [orderRes] = await conn.query('INSERT INTO orders (customer_id, total) VALUES (?, ?)', [customer_id, total]);
    const orderId = orderRes.insertId;

    // insert items and decrement product quantities
    for (const it of items) {
      const [prodRows] = await conn.query('SELECT price, quantity FROM products WHERE id = ?', [it.product_id]);
      const price = prodRows[0].price;
      await conn.query(
        'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
        [orderId, it.product_id, it.quantity, price]
      );
      await conn.query('UPDATE products SET quantity = quantity - ? WHERE id = ?', [it.quantity, it.product_id]);
    }

    await conn.commit();
    res.status(201).json({ order_id: orderId, total });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  } finally {
    conn.release();
  }
});

// list orders (simple)
app.get('/api/orders', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT o.*, c.name as customer FROM orders o LEFT JOIN customers c ON o.customer_id = c.id ORDER BY o.id DESC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.get('/api/orders/:id/items', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT oi.*, p.name as product_name, p.sku
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = ?`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// serve frontend index.html at root
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.listen(PORT, () => {
  console.log(Server running on port ${PORT});
});
[2:34 am, 3/11/2025] Jagan Yadav: // db.js
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'inventory_db',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  connectionLimit: 10
});

module.exports = pool;
[2:36 am, 3/11/2025] Jagan Yadav: -- create database and tables
CREATE DATABASE IF NOT EXISTS inventory_db;
USE inventory_db;

-- products table
CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  quantity INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- customers table (optional for sales)
CREATE TABLE IF NOT EXISTS customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- orders table
CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT,
  total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
);

-- order_items table
CREATE TABLE IF NOT EXISTS order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);