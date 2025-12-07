// Shopping Cart Page JavaScript

const API_URL = window.location.origin + '/api/linas-treasures';

let cartData = null;

// Session ID
let sessionId = localStorage.getItem('lt_session_id');
if (!sessionId) {
  sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  localStorage.setItem('lt_session_id', sessionId);
}

// Initialize
document.addEventListener('DOMContentLoaded', async function() {
  await loadCart();
});

// Load cart
async function loadCart() {
  try {
    const response = await fetch(`${API_URL}/cart/${sessionId}`);
    cartData = await response.json();

    renderCart();
    updateCartCount();
  } catch (error) {
    console.error('Error loading cart:', error);
    document.getElementById('cart-container').innerHTML = `
      <div class="empty-cart">
        <h2>Error Loading Cart</h2>
        <p>Please try again or contact support if the problem persists.</p>
      </div>
    `;
  }
}

// Render cart
function renderCart() {
  const container = document.getElementById('cart-container');
  const countText = document.getElementById('cart-count-text');

  if (!cartData || !cartData.items || cartData.items.length === 0) {
    countText.textContent = 'Your cart is empty';
    container.innerHTML = `
      <div class="empty-cart">
        <h2>Your cart is empty</h2>
        <p>Start adding beautiful products to build your wholesale order</p>
        <a href="catalog.html" class="btn btn-primary">Browse Products</a>
      </div>
    `;
    return;
  }

  countText.textContent = `${cartData.items.length} item${cartData.items.length !== 1 ? 's' : ''} in your cart`;

  const subtotal = parseFloat(cartData.subtotal);
  const taxRate = 0.08; // 8% tax
  const taxAmount = subtotal * taxRate;
  const shippingAmount = subtotal > 100 ? 0 : 9.99; // Free shipping over $100
  const total = subtotal + taxAmount + shippingAmount;

  container.innerHTML = `
    <div class="cart-layout">
      <!-- Cart Items -->
      <div class="cart-items">
        ${cartData.items.map(item => createCartItemHTML(item)).join('')}
      </div>

      <!-- Cart Summary -->
      <div class="cart-summary">
        <h2 class="summary-title">Order Summary</h2>

        <div class="summary-row">
          <span class="summary-label">Subtotal</span>
          <span class="summary-value">$${subtotal.toFixed(2)}</span>
        </div>

        <div class="summary-row">
          <span class="summary-label">Tax (${(taxRate * 100).toFixed(0)}%)</span>
          <span class="summary-value">$${taxAmount.toFixed(2)}</span>
        </div>

        <div class="summary-row">
          <span class="summary-label">Shipping</span>
          <span class="summary-value">${shippingAmount === 0 ? 'FREE' : '$' + shippingAmount.toFixed(2)}</span>
        </div>

        ${shippingAmount > 0 && subtotal < 100 ? `
          <p style="font-size: 12px; color: var(--warm-gray); margin-top: 8px;">
            Add $${(100 - subtotal).toFixed(2)} more for free shipping!
          </p>
        ` : ''}

        <div class="summary-row summary-total">
          <span class="summary-label">Total</span>
          <span class="summary-value">$${total.toFixed(2)}</span>
        </div>

        <button class="checkout-btn" onclick="proceedToCheckout()">
          Proceed to Checkout
        </button>

        <div class="continue-shopping">
          <a href="catalog.html">← Continue Shopping</a>
        </div>

        <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--border-color);">
          <p style="font-size: 13px; color: var(--warm-gray); line-height: 1.6;">
            <strong>Wholesale Pricing Available</strong><br>
            <a href="signup.html" style="color: var(--rose-gold);">Create a wholesale account</a>
            to unlock tiered pricing and save up to 40%
          </p>
        </div>
      </div>
    </div>
  `;
}

// Create cart item HTML
function createCartItemHTML(item) {
  const imageUrl = item.images && item.images.length > 0
    ? item.images[0]
    : 'https://via.placeholder.com/120x120?text=No+Image';

  const lineTotal = parseFloat(item.line_total);

  return `
    <div class="cart-item">
      <img src="${imageUrl}"
           alt="${item.name}"
           class="item-image"
           onerror="this.src='https://via.placeholder.com/120x120?text=No+Image'">

      <div class="item-details">
        <div class="item-header">
          <h3 class="item-name">${item.name}</h3>
          <div class="item-sku">SKU: ${item.product_id}</div>
        </div>

        <div class="item-price">$${parseFloat(item.retail_price).toFixed(2)} each</div>

        <div class="item-actions">
          <div class="qty-controls">
            <button class="qty-btn" onclick="updateQuantity(${item.id}, ${item.quantity - 1})">
              −
            </button>
            <span class="qty-display">${item.quantity}</span>
            <button class="qty-btn"
                    onclick="updateQuantity(${item.id}, ${item.quantity + 1})"
                    ${item.quantity >= item.stock_quantity ? 'disabled' : ''}>
              +
            </button>
          </div>

          <div style="text-align: right;">
            <div style="font-size: 20px; font-weight: 700; color: var(--charcoal); margin-bottom: 8px;">
              $${lineTotal.toFixed(2)}
            </div>
            <button class="remove-btn" onclick="removeItem(${item.id})">
              Remove
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Update quantity
async function updateQuantity(cartItemId, newQuantity) {
  if (newQuantity < 1) {
    return removeItem(cartItemId);
  }

  try {
    const response = await fetch(`${API_URL}/cart/${cartItemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: newQuantity })
    });

    if (response.ok) {
      await loadCart();
    } else {
      const data = await response.json();
      showNotification(data.error || 'Failed to update quantity', 'error');
    }
  } catch (error) {
    console.error('Error updating quantity:', error);
    showNotification('Error updating cart', 'error');
  }
}

// Remove item
async function removeItem(cartItemId) {
  if (!confirm('Remove this item from your cart?')) {
    return;
  }

  try {
    const response = await fetch(`${API_URL}/cart/${cartItemId}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      showNotification('Item removed from cart', 'success');
      await loadCart();
    } else {
      showNotification('Failed to remove item', 'error');
    }
  } catch (error) {
    console.error('Error removing item:', error);
    showNotification('Error removing item', 'error');
  }
}

// Proceed to checkout
function proceedToCheckout() {
  window.location.href = 'checkout.html';
}

// Update cart count in nav
async function updateCartCount() {
  const cartCount = document.getElementById('cart-count');
  if (cartCount && cartData) {
    cartCount.textContent = cartData.itemCount || 0;
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
