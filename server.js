const express = require('express');
const cors = require('cors');
const pool = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.use(express.static('public'));

app.get('/', (req, res) => {
  res.send('API is running. Try /products');
});

// --- PRODUCTS CRUD ---

// list products (with optional search)
app.get('/api/products', async (req, res) => {
  try {
    const q = req.query.q;
    if (q) {
      const [rows] = await pool.query(
        'SELECT * FROM products WHERE name LIKE ? OR sku LIKE ? ORDER BY id DESC',
        [`%${q}%`, `%${q}%`]
      );
      return res.json(rows);
    }

    const [rows] = await pool.query('SELECT * FROM products ORDER BY id DESC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// get single product
app.get('/api/products/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Product not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// create product
app.post('/api/products', async (req, res) => {
  try {
    const { sku, name, description = '', price = 0, quantity = 0 } = req.body;

    if (!sku || !name) {
      return res.status(400).json({ error: 'SKU and name are required' });
    }

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
    res.status(500).json({ error: 'Database error' });
  }
});

// update product
app.put('/api/products/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { sku, name, description = '', price = 0, quantity = 0 } = req.body;

    await pool.query(
      'UPDATE products SET sku=?, name=?, description=?, price=?, quantity=? WHERE id=?',
      [sku, name, description, price, quantity, id]
    );

    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Product not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// delete product
app.delete('/api/products/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await pool.query('DELETE FROM products WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// --- ORDERS ---

app.post('/api/orders', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const { customer_id = null, items } = req.body; // items: [{product_id, quantity}]
    if (!Array.isArray(items) || items.length === 0) {
      await conn.rollback();
      return res.status(400).json({ error: 'No items in order' });
    }

    let total = 0;

    // check stock and calculate total
    for (const it of items) {
      const [prodRows] = await conn.query(
        'SELECT id, price, quantity FROM products WHERE id = ?',
        [it.product_id]
      );

      if (!prodRows.length) {
        await conn.rollback();
        return res.status(400).json({ error: `Product ${it.product_id} not found` });
      }

      const p = prodRows[0];

      if (p.quantity < it.quantity) {
        await conn.rollback();
        return res
          .status(400)
          .json({ error: `Insufficient stock for product id ${it.product_id}` });
      }

      total += Number(p.price) * Number(it.quantity);
    }

    // create order
    const [orderRes] = await conn.query(
      'INSERT INTO orders (customer_id, total, created_at) VALUES (?, ?, NOW())',
      [customer_id, total]
    );
    const orderId = orderRes.insertId;

    // insert order items and update product quantities
    for (const it of items) {
      const [prodRows] = await conn.query('SELECT price FROM products WHERE id = ?', [
        it.product_id,
      ]);
      const price = prodRows[0].price;

      await conn.query(
        'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
        [orderId, it.product_id, it.quantity, price]
      );

      await conn.query('UPDATE products SET quantity = quantity - ? WHERE id = ?', [
        it.quantity,
        it.product_id,
      ]);
    }

    await conn.commit();
    res.status(201).json({ success: true, order_id: orderId, total });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Database error during order creation' });
  } finally {
    conn.release();
  }
});

// list orders
app.get('/api/orders', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM orders ORDER BY id DESC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// get specific order with items
app.get('/api/orders/:id', async (req, res) => {
  try {
    const [orders] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!orders.length) return res.status(404).json({ error: 'Order not found' });

    const [items] = await pool.query(
      'SELECT oi.*, p.name FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE order_id = ?',
      [req.params.id]
    );

    res.json({ ...orders[0], items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
