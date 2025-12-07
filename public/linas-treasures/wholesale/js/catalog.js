// Catalog Page JavaScript
// Handles product browsing, filtering, and cart management

const API_URL = window.location.origin + '/api/linas-treasures';
const PRODUCTS_PER_PAGE = 12;

let currentPage = 1;
let currentCategory = '';
let currentSearch = '';
let currentSort = 'newest';
let currentStockFilter = '';
let totalProducts = 0;
let allProducts = [];

// Session ID for cart
let sessionId = localStorage.getItem('lt_session_id');
if (!sessionId) {
  sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  localStorage.setItem('lt_session_id', sessionId);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async function() {
  // Check for URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('category')) {
    currentCategory = urlParams.get('category');
  }

  await loadCategories();
  await loadProducts();
  setupEventListeners();
  updateCartCount();
});

// Load categories for filter
async function loadCategories() {
  try {
    const response = await fetch(`${API_URL}/categories`);
    const categories = await response.json();

    const select = document.getElementById('category-filter');
    categories.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat.slug;
      option.textContent = cat.name;
      if (cat.slug === currentCategory) {
        option.selected = true;
      }
      select.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading categories:', error);
  }
}

// Load products from API
async function loadProducts() {
  const container = document.getElementById('products-container');
  const resultsCount = document.getElementById('results-count');
  const pagination = document.getElementById('pagination');

  // Show loading
  container.innerHTML = `
    <div class="loading-state" style="grid-column: 1 / -1;">
      <div class="spinner"></div>
      <p>Loading our beautiful collection...</p>
    </div>
  `;

  try {
    const offset = (currentPage - 1) * PRODUCTS_PER_PAGE;
    let url = `${API_URL}/products?limit=${PRODUCTS_PER_PAGE}&offset=${offset}`;

    if (currentCategory) url += `&category=${currentCategory}`;
    if (currentSearch) url += `&search=${encodeURIComponent(currentSearch)}`;
    if (currentStockFilter === 'in-stock') url += `&inStock=true`;

    const response = await fetch(url);
    const data = await response.json();

    allProducts = data.products || [];
    totalProducts = data.total || 0;

    // Sort products
    sortProducts();

    // Clear container
    container.innerHTML = '';

    if (allProducts.length > 0) {
      // Render products
      allProducts.forEach(product => {
        container.appendChild(createProductCard(product));
      });

      // Update results count
      const start = offset + 1;
      const end = Math.min(offset + allProducts.length, totalProducts);
      resultsCount.textContent = `Showing ${start}-${end} of ${totalProducts} products`;

      // Show pagination
      pagination.style.display = 'flex';
      updatePagination();
    } else {
      // Empty state
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <h3>No products found</h3>
          <p>Try adjusting your filters or search terms</p>
          <button class="btn btn-primary" onclick="clearFilters()">Clear All Filters</button>
        </div>
      `;
      resultsCount.textContent = 'No products found';
      pagination.style.display = 'none';
    }
  } catch (error) {
    console.error('Error loading products:', error);
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <h3>Error loading products</h3>
        <p>Please try again later or contact support</p>
      </div>
    `;
  }
}

// Sort products based on current sort option
function sortProducts() {
  switch(currentSort) {
    case 'price-low':
      allProducts.sort((a, b) => parseFloat(a.retail_price) - parseFloat(b.retail_price));
      break;
    case 'price-high':
      allProducts.sort((a, b) => parseFloat(b.retail_price) - parseFloat(a.retail_price));
      break;
    case 'name':
      allProducts.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'featured':
      allProducts.sort((a, b) => (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0));
      break;
    case 'newest':
    default:
      // Already sorted by created_at DESC from API
      break;
  }
}

// Create product card HTML
function createProductCard(product) {
  const card = document.createElement('div');
  card.className = 'product-card';
  card.style.position = 'relative';
  card.style.cursor = 'pointer';

  const imageUrl = product.images && product.images.length > 0
    ? product.images[0]
    : 'https://via.placeholder.com/400x500?text=No+Image';

  const stock = product.stock_quantity || 0;
  const isOutOfStock = stock <= 0;
  const isLowStock = stock > 0 && stock <= (product.low_stock_threshold || 10);

  let badge = '';
  if (product.is_featured) {
    badge = '<div class="product-badge">Featured</div>';
  } else if (isLowStock) {
    badge = '<div class="product-badge" style="background: #ffc107;">Low Stock</div>';
  } else if (isOutOfStock) {
    badge = '<div class="product-badge" style="background: #dc3545;">Out of Stock</div>';
  }

  card.innerHTML = `
    <div class="product-image-wrapper">
      ${badge}
      <img src="${imageUrl}"
           alt="${product.name}"
           class="product-image"
           onerror="this.src='https://via.placeholder.com/400x500?text=No+Image'">
      <div class="quick-add">
        <button class="quick-add-btn" onclick="addToCart(event, ${product.id})" ${isOutOfStock ? 'disabled' : ''}>
          ${isOutOfStock ? 'Out of Stock' : 'Quick Add'}
        </button>
      </div>
    </div>
    <div class="product-info">
      <div class="product-category">${product.category_name || 'Uncategorized'}</div>
      <h3 class="product-name">${product.name}</h3>
      <div class="product-pricing">
        <span class="product-wholesale">$${parseFloat(product.wholesale_price).toFixed(2)}</span>
        <span class="product-retail">$${parseFloat(product.retail_price).toFixed(2)}</span>
      </div>
      <div class="product-moq">MOQ: ${product.minimum_order_quantity || 1} units</div>
    </div>
  `;

  // Click to view details (except on buttons)
  card.addEventListener('click', (e) => {
    if (!e.target.classList.contains('quick-add-btn')) {
      window.location.href = `product-detail.html?id=${product.id}`;
    }
  });

  return card;
}

// Add to cart
async function addToCart(event, productId) {
  event.stopPropagation(); // Prevent card click

  try {
    const response = await fetch(`${API_URL}/cart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: sessionId,
        productId: productId,
        quantity: 1
      })
    });

    const data = await response.json();

    if (response.ok) {
      showNotification('Added to cart!', 'success');
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

// Update pagination
function updatePagination() {
  const totalPages = Math.ceil(totalProducts / PRODUCTS_PER_PAGE);

  document.getElementById('prev-btn').disabled = currentPage === 1;
  document.getElementById('next-btn').disabled = currentPage >= totalPages;
  document.getElementById('page-info').textContent = `Page ${currentPage} of ${totalPages}`;
}

// Setup event listeners
function setupEventListeners() {
  // Search input (debounced)
  let searchTimeout;
  document.getElementById('search-input').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      currentSearch = e.target.value;
      currentPage = 1;
      loadProducts();
    }, 500);
  });

  // Category filter
  document.getElementById('category-filter').addEventListener('change', (e) => {
    currentCategory = e.target.value;
    currentPage = 1;
    loadProducts();
  });

  // Sort filter
  document.getElementById('sort-filter').addEventListener('change', (e) => {
    currentSort = e.target.value;
    loadProducts();
  });

  // Stock filter
  document.getElementById('stock-filter').addEventListener('change', (e) => {
    currentStockFilter = e.target.value;
    currentPage = 1;
    loadProducts();
  });

  // Pagination
  document.getElementById('prev-btn').addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      loadProducts();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  document.getElementById('next-btn').addEventListener('click', () => {
    const totalPages = Math.ceil(totalProducts / PRODUCTS_PER_PAGE);
    if (currentPage < totalPages) {
      currentPage++;
      loadProducts();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  // View toggle
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // Note: List view implementation would go here
    });
  });
}

// Clear all filters
function clearFilters() {
  currentCategory = '';
  currentSearch = '';
  currentSort = 'newest';
  currentStockFilter = '';
  currentPage = 1;

  document.getElementById('search-input').value = '';
  document.getElementById('category-filter').value = '';
  document.getElementById('sort-filter').value = 'newest';
  document.getElementById('stock-filter').value = '';

  loadProducts();
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
`;
document.head.appendChild(style);
