// Shopping Cart Management
// This handles all cart operations across the site

class ShoppingCart {
  constructor() {
    this.sessionId = this.getOrCreateSessionId();
    this.cartCount = 0;
    this.init();
  }

  // Get or create a session ID for the cart
  getOrCreateSessionId() {
    let sessionId = localStorage.getItem('lt_session_id');
    if (!sessionId) {
      sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('lt_session_id', sessionId);
    }
    return sessionId;
  }

  // Initialize cart
  async init() {
    await this.updateCartCount();
  }

  // Get API base URL
  getApiUrl() {
    // Use current domain's API endpoint
    return window.location.origin + '/api/linas-treasures';
  }

  // Update cart count in navbar
  async updateCartCount() {
    try {
      const response = await fetch(`${this.getApiUrl()}/cart/${this.sessionId}`);
      const data = await response.json();

      this.cartCount = data.itemCount || 0;
      const cartCountElement = document.getElementById('cart-count');
      if (cartCountElement) {
        cartCountElement.textContent = this.cartCount;
      }
    } catch (error) {
      console.error('Error updating cart count:', error);
    }
  }

  // Add item to cart
  async addItem(productId, quantity = 1) {
    try {
      const response = await fetch(`${this.getApiUrl()}/cart`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: this.sessionId,
          productId: productId,
          quantity: quantity
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add item to cart');
      }

      await this.updateCartCount();
      this.showNotification('Item added to cart!');
      return data;
    } catch (error) {
      console.error('Error adding to cart:', error);
      this.showNotification('Error adding item to cart', 'error');
      throw error;
    }
  }

  // Update cart item quantity
  async updateItem(cartItemId, quantity) {
    try {
      const response = await fetch(`${this.getApiUrl()}/cart/${cartItemId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ quantity })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update cart');
      }

      await this.updateCartCount();
      return data;
    } catch (error) {
      console.error('Error updating cart:', error);
      throw error;
    }
  }

  // Remove item from cart
  async removeItem(cartItemId) {
    try {
      const response = await fetch(`${this.getApiUrl()}/cart/${cartItemId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to remove item');
      }

      await this.updateCartCount();
      this.showNotification('Item removed from cart');
    } catch (error) {
      console.error('Error removing from cart:', error);
      throw error;
    }
  }

  // Get cart contents
  async getCart() {
    try {
      const response = await fetch(`${this.getApiUrl()}/cart/${this.sessionId}`);
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching cart:', error);
      return { items: [], subtotal: 0, itemCount: 0 };
    }
  }

  // Show notification
  showNotification(message, type = 'success') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${type === 'success' ? '#d4af37' : '#ff4444'};
      color: white;
      padding: 15px 25px;
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      z-index: 10000;
      animation: slideIn 0.3s ease;
    `;

    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 300);
    }, 3000);
  }
}

// Add CSS animation
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(400px);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);

// Initialize cart globally
const cart = new ShoppingCart();
