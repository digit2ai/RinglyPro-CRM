// Product Detail Page JavaScript

const API_URL = window.location.origin + '/api/linas-treasures';

let productId = null;
let productData = null;
let currentQuantity = 1;

// Session ID for cart
let sessionId = localStorage.getItem('lt_session_id');
if (!sessionId) {
  sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  localStorage.setItem('lt_session_id', sessionId);
}

// Initialize
document.addEventListener('DOMContentLoaded', async function() {
  const urlParams = new URLSearchParams(window.location.search);
  productId = urlParams.get('id');

  if (!productId) {
    window.location.href = 'catalog.html';
    return;
  }

  await loadProduct();
  updateCartCount();
});

// Load product details
async function loadProduct() {
  try {
    const response = await fetch(`${API_URL}/products/${productId}`);

    if (!response.ok) {
      throw new Error('Product not found');
    }

    productData = await response.json();
    renderProduct();
  } catch (error) {
    console.error('Error loading product:', error);
    document.getElementById('product-container').innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 100px 20px;">
        <h2 style="color: var(--warm-gray); margin-bottom: 20px;">Product Not Found</h2>
        <p style="color: var(--warm-gray); margin-bottom: 30px;">The product you're looking for doesn't exist or has been removed.</p>
        <a href="catalog.html" class="btn btn-primary">Back to Catalog</a>
      </div>
    `;
  }
}

// Render product
function renderProduct() {
  // Update breadcrumb
  document.getElementById('product-category').textContent = productData.category_name || 'Products';
  document.getElementById('product-name-breadcrumb').textContent = productData.name;

  // Update page title
  document.title = `${productData.name} - Lina's Treasures Wholesale`;

  const images = productData.images && productData.images.length > 0
    ? productData.images
    : ['https://via.placeholder.com/600x700?text=No+Image'];

  const stock = productData.stock_quantity || 0;
  const isOutOfStock = stock <= 0;
  const isLowStock = stock > 0 && stock <= (productData.low_stock_threshold || 10);

  let stockBadge = '';
  if (isOutOfStock) {
    stockBadge = '<span class="stock-badge out-of-stock">Out of Stock</span>';
  } else if (isLowStock) {
    stockBadge = `<span class="stock-badge low-stock">Low Stock (${stock} left)</span>`;
  } else {
    stockBadge = `<span class="stock-badge in-stock">In Stock (${stock} available)</span>`;
  }

  const container = document.getElementById('product-container');
  container.innerHTML = `
    <!-- Product Gallery -->
    <div class="product-gallery">
      <img src="${images[0]}"
           alt="${productData.name}"
           class="main-image"
           id="main-image"
           onerror="this.src='https://via.placeholder.com/600x700?text=No+Image'">

      ${images.length > 1 ? `
        <div class="thumbnail-grid">
          ${images.map((img, index) => `
            <img src="${img}"
                 alt="${productData.name} - Image ${index + 1}"
                 class="thumbnail ${index === 0 ? 'active' : ''}"
                 onclick="changeImage('${img}', ${index})"
                 onerror="this.src='https://via.placeholder.com/100x100?text=No+Image'">
          `).join('')}
        </div>
      ` : ''}
    </div>

    <!-- Product Details -->
    <div class="product-details">
      <!-- Header -->
      <div class="product-header">
        <div class="eyebrow">${productData.category_name || 'Product'}</div>
        <h1>${productData.name}</h1>
        <div class="product-sku">SKU: ${productData.sku}</div>
        ${stockBadge}
      </div>

      <!-- Pricing -->
      <div class="pricing-section">
        <div class="pricing-row">
          <span class="pricing-label">Wholesale Price</span>
          <div>
            <span class="pricing-value">$${parseFloat(productData.wholesale_price).toFixed(2)}</span>
            <span class="pricing-retail" style="margin-left: 12px;">Retail: $${parseFloat(productData.retail_price).toFixed(2)}</span>
          </div>
        </div>
        <div class="pricing-row" style="margin-bottom: 0;">
          <span class="pricing-label">Your Margin</span>
          <span class="pricing-value" style="font-size: 20px; color: #28a745;">
            ${((1 - productData.wholesale_price / productData.retail_price) * 100).toFixed(0)}%
          </span>
        </div>

        <!-- Tier Pricing -->
        <div class="tier-pricing">
          <h4>Volume Pricing Tiers</h4>
          <div class="tier-row">
            <span>Bronze Partners (20% off)</span>
            <span style="font-weight: 600;">$${(productData.wholesale_price * 0.8).toFixed(2)}</span>
          </div>
          <div class="tier-row">
            <span>Silver Partners (30% off)</span>
            <span style="font-weight: 600;">$${(productData.wholesale_price * 0.7).toFixed(2)}</span>
          </div>
          <div class="tier-row">
            <span>Gold Partners (40% off)</span>
            <span style="font-weight: 600;">$${(productData.wholesale_price * 0.6).toFixed(2)}</span>
          </div>
        </div>
      </div>

      <!-- Quantity Selector -->
      <div class="quantity-selector">
        <span class="quantity-label">Quantity</span>
        <div class="quantity-controls">
          <button class="qty-btn" onclick="decrementQty()" ${isOutOfStock ? 'disabled' : ''}>−</button>
          <input type="number"
                 class="qty-input"
                 id="quantity-input"
                 value="1"
                 min="1"
                 max="${stock}"
                 onchange="updateQuantity(this.value)"
                 ${isOutOfStock ? 'disabled' : ''}>
          <button class="qty-btn" onclick="incrementQty()" ${isOutOfStock ? 'disabled' : ''}>+</button>
        </div>
        <span style="font-size: 13px; color: var(--warm-gray);">
          MOQ: ${productData.minimum_order_quantity || 1} units
        </span>
      </div>

      <!-- Add to Cart -->
      <div class="add-to-cart-section">
        <button class="add-to-cart-btn" onclick="addToCart()" ${isOutOfStock ? 'disabled' : ''}>
          ${isOutOfStock ? 'Out of Stock' : 'Add to Cart'}
        </button>
        <p style="text-align: center; font-size: 13px; color: var(--warm-gray); margin-top: 12px;">
          <a href="signup.html" style="color: var(--rose-gold);">Create wholesale account</a> for tiered pricing
        </p>
      </div>

      <!-- Product Info Tabs -->
      <div class="product-info-tabs">
        <div class="tab-buttons">
          <button class="tab-btn active" onclick="switchTab('description')">Description</button>
          <button class="tab-btn" onclick="switchTab('specifications')">Specifications</button>
          <button class="tab-btn" onclick="switchTab('shipping')">Shipping & Returns</button>
        </div>

        <!-- Description Tab -->
        <div class="tab-content active" id="tab-description">
          <p style="line-height: 1.8; color: var(--warm-gray);">
            ${productData.description || 'No description available.'}
          </p>
        </div>

        <!-- Specifications Tab -->
        <div class="tab-content" id="tab-specifications">
          <div class="info-grid">
            <div class="info-label">SKU</div>
            <div class="info-value">${productData.sku}</div>

            <div class="info-label">Category</div>
            <div class="info-value">${productData.category_name || 'N/A'}</div>

            <div class="info-label">Stock</div>
            <div class="info-value">${stock} units</div>

            <div class="info-label">Min Order Qty</div>
            <div class="info-value">${productData.minimum_order_quantity || 1} units</div>

            ${productData.specifications ? Object.entries(productData.specifications).map(([key, value]) => `
              <div class="info-label">${key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</div>
              <div class="info-value">${value}</div>
            `).join('') : ''}
          </div>
        </div>

        <!-- Shipping Tab -->
        <div class="tab-content" id="tab-shipping">
          <h4 style="margin-bottom: 16px;">Shipping Information</h4>
          <p style="line-height: 1.8; color: var(--warm-gray); margin-bottom: 20px;">
            Standard shipping typically takes 5-7 business days. Expedited shipping options available at checkout.
          </p>

          <h4 style="margin-bottom: 16px; margin-top: 32px;">Returns & Exchanges</h4>
          <p style="line-height: 1.8; color: var(--warm-gray);">
            We accept returns within 30 days of delivery for unused items in original packaging.
            Please contact our wholesale support team to initiate a return.
          </p>
        </div>
      </div>
    </div>
  `;
}

// Change main image
function changeImage(imageUrl, index) {
  document.getElementById('main-image').src = imageUrl;

  // Update active thumbnail
  document.querySelectorAll('.thumbnail').forEach((thumb, i) => {
    thumb.classList.toggle('active', i === index);
  });
}

// Quantity controls
function incrementQty() {
  const input = document.getElementById('quantity-input');
  const max = parseInt(input.max);
  const current = parseInt(input.value);

  if (current < max) {
    input.value = current + 1;
    currentQuantity = current + 1;
  }
}

function decrementQty() {
  const input = document.getElementById('quantity-input');
  const current = parseInt(input.value);

  if (current > 1) {
    input.value = current - 1;
    currentQuantity = current - 1;
  }
}

function updateQuantity(value) {
  currentQuantity = parseInt(value) || 1;
}

// Switch tabs
function switchTab(tabName) {
  // Update buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  event.target.classList.add('active');

  // Update content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  document.getElementById(`tab-${tabName}`).classList.add('active');
}

// Add to cart
async function addToCart() {
  try {
    const response = await fetch(`${API_URL}/cart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: sessionId,
        productId: productId,
        quantity: currentQuantity
      })
    });

    const data = await response.json();

    if (response.ok) {
      showNotification(`Added ${currentQuantity} item(s) to cart!`, 'success');
      updateCartCount();
    } else {
      showNotification(data.error || 'Failed to add to cart', 'error');
    }
  } catch (error) {
    console.error('Error adding to cart:', error);
    showNotification('Error adding to cart', 'error');
  }
}

// Update cart count
async function updateCartCount() {
  try {
    const response = await fetch(`${API_URL}/cart/${sessionId}`);
    const data = await response.json();

    const cartCount = document.getElementById('cart-count');
    if (cartCount) {
      cartCount.textContent = data.itemCount || 0;
    }
  } catch (error) {
    console.error('Error updating cart count:', error);
  }
}

// Show notification
function showNotification(message, type = 'success') {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'success' ? 'var(--rose-gold)' : '#dc3545'};
    color: white;
    padding: 16px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    animation: slideIn 0.3s ease;
    font-size: 14px;
    font-weight: 500;
  `;
  notification.textContent = message;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => document.body.removeChild(notification), 300);
  }, 3000);
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(400px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(400px); opacity: 0; }
  }
  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--blush);
    border-top-color: var(--rose-gold);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;
document.head.appendChild(style);
