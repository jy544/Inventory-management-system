// app.js - simple SPA frontend logic

const api = '/api';

// --- DOM elements ---
const productsTableBody = document.querySelector('#productsTable tbody');
const searchInput = document.getElementById('search');
const refreshBtn = document.getElementById('refresh');
const openAddBtn = document.getElementById('openAdd');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modalTitle');
const saveProductBtn = document.getElementById('saveProduct');
const cancelModalBtn = document.getElementById('cancelModal');

const orderProductsContainer = document.getElementById('orderProducts');
const createOrderBtn = document.getElementById('createOrder');
const orderCustomerInput = document.getElementById('orderCustomer');
const orderResultDiv = document.getElementById('orderResult');

let editingId = null;
const loadProducts = async () => {
  try {
    const res = await fetch('/api/products');
    const products = await res.json();

    productsTableBody.innerHTML = ''; // Clear previous rows

    products.forEach(p => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${p.sku}</td>
        <td>${p.name}</td>
        <td>${p.price}</td>
        <td>${p.quantity}</td>
        <td>
          <button onclick="editProduct(${p.id})">Edit</button>
          <button onclick="deleteProduct(${p.id})">Delete</button>
        </td>
      `;
      productsTableBody.appendChild(row);
    });
  } catch (err) {
    console.error('Error loading products:', err);
  }
  loadProducts();
};
let currentProducts = [];

// --- Product form fields ---
const fields = {
  sku: document.getElementById('p_sku'),
  name: document.getElementById('p_name'),
  description: document.getElementById('p_description'),
  price: document.getElementById('p_price'),
  quantity: document.getElementById('p_quantity'),
};

// --- API Calls ---

async function fetchProducts(q = '') {
  try {
    const url = q ? `${api}/products?q=${encodeURIComponent(q)}` : `${api}/products`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch products');
    return await res.json();
  } catch (err) {
    console.error(err);
    alert('Error fetching products');
    return [];
  }
}

async function removeProduct(id) {
  if (!confirm('Delete this product?')) return;
  try {
    const res = await fetch(`${api}/products/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || 'Delete failed');
    } else {
      await loadAndRender();
    }
  } catch (err) {
    console.error(err);
    alert('Network error while deleting product');
  }
}

// --- Rendering Functions ---

function renderProducts(products) {
  productsTableBody.innerHTML = '';
  products.forEach((p) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${p.sku}</td>
      <td>${p.name}</td>
      <td>${Number(p.price).toFixed(2)}</td>
      <td>${p.quantity}</td>
      <td class="actions">
        <button class="edit">Edit</button>
        <button class="delete">Delete</button>
      </td>
    `;
    tr.querySelector('.edit').addEventListener('click', () => openEdit(p));
    tr.querySelector('.delete').addEventListener('click', () => removeProduct(p.id));
    productsTableBody.appendChild(tr);
  });
  renderOrderProducts(products);
}

function renderOrderProducts(products) {
  currentProducts = products;
  orderProductsContainer.innerHTML = '';

  products.forEach((p) => {
    const row = document.createElement('div');
    row.className = 'order-row';
    row.innerHTML = `
      <div style="flex:1">
        <strong>${p.name}</strong> <small>(${p.sku})</small><br/>
        <small>Price: ${Number(p.price).toFixed(2)} | In stock: ${p.quantity}</small>
      </div>
      <div>
        <input type="number" min="0" value="0" data-product-id="${p.id}" />
      </div>
    `;
    orderProductsContainer.appendChild(row);
  });
}

// --- Modal + CRUD Logic ---

function openAddModal() {
  editingId = null;
  modalTitle.textContent = 'Add Product';
  Object.values(fields).forEach((f) => (f.value = ''));
  modal.classList.remove('hidden');
}

function openEdit(product) {
  editingId = product.id;
  modalTitle.textContent = 'Edit Product';
  fields.sku.value = product.sku;
  fields.name.value = product.name;
  fields.description.value = product.description || '';
  fields.price.value = product.price;
  fields.quantity.value = product.quantity;
  modal.classList.remove('hidden');
}

function closeModal() {
  modal.classList.add('hidden');
}

async function saveProduct() {
  const payload = {
    sku: fields.sku.value.trim(),
    name: fields.name.value.trim(),
    description: fields.description.value.trim(),
    price: parseFloat(fields.price.value) || 0,
    quantity: parseInt(fields.quantity.value) || 0,
  };

  if (!payload.sku || !payload.name) {
    alert('SKU and Name are required');
    return;
  }

  try {
    let res;
    if (editingId) {
      res = await fetch(`${api}/products/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      res = await fetch(`${api}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Operation failed');
      return;
    }

    closeModal();
    await loadAndRender();
  } catch (err) {
    console.error(err);
    alert('Network error saving product');
  }
}

// --- Orders Logic ---

async function createOrder() {
  const qtyInputs = orderProductsContainer.querySelectorAll('input[type="number"]');
  const items = [];

  qtyInputs.forEach((inp) => {
    const q = parseInt(inp.value) || 0;
    if (q > 0) items.push({ product_id: parseInt(inp.dataset.productId), quantity: q });
  });

  if (items.length === 0) {
    alert('Please select at least one product quantity');
    return;
  }

  const customer_id = orderCustomerInput.value ? parseInt(orderCustomerInput.value) : null;

try {
  const res = await fetch(`${api}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customer_id, items }),
  });

  // Check if response is OK before parsing
  if (!res.ok) {
    let errMsg = 'Order creation failed';
    try {
      const errData = await res.json();
      errMsg = errData.error || errMsg;
    } catch (_) {}
    alert(errMsg);
    return;
  }

  const data = await res.json();
  orderResultDiv.textContent = `✅ Order placed (ID: ${data.order_id}) — Total: ${Number(data.total).toFixed(2)}.`;
} catch (err) {
  console.error(err);
  alert('Network error while creating order');
}
}

  
