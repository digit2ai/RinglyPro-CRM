// Home page functionality
// Loads and displays featured products

document.addEventListener('DOMContentLoaded', async function() {
  await loadFeaturedProducts();
});

async function loadFeaturedProducts() {
  const grid = document.getElementById('featured-products-grid');

  try {
    // Fetch featured products from API
    const response = await fetch('/api/linas-treasures/products?featured=true&limit=6');
    const data = await response.json();

    // Clear loading message
    grid.innerHTML = '';

    if (data.products && data.products.length > 0) {
      data.products.forEach(product => {
        grid.appendChild(createProductCard(product));
      });
    } else {
      grid.innerHTML = '<p class="loading">No featured products available yet. Check back soon!</p>';
    }
  } catch (error) {
    console.error('Error loading featured products:', error);
    grid.innerHTML = '<p class="loading">Unable to load products at this time.</p>';
  }
}

function createProductCard(product) {
  const card = document.createElement('div');
  card.className = 'product-card';

  // Get first image or use placeholder
  const imageUrl = product.images && product.images.length > 0
    ? product.images[0]
    : 'https://via.placeholder.com/300x300?text=Product+Image';

  // Check stock
  const isOutOfStock = product.stock_quantity <= 0;

  card.innerHTML = `
    <img src="${imageUrl}" alt="${product.name}" class="product-image" onerror="this.src='https://via.placeholder.com/300x300?text=Image+Not+Available'">
    <div class="product-info">
      ${isOutOfStock ? '<span class="out-of-stock-badge">Out of Stock</span>' : ''}
      <h3 class="product-name">${product.name}</h3>
      <p class="product-price">$${parseFloat(product.retail_price).toFixed(2)}</p>
      <p class="product-description">${truncateText(product.description || '', 80)}</p>
      <button
        class="add-to-cart-btn"
        onclick="addToCart(${product.id}, '${product.name}')"
        ${isOutOfStock ? 'disabled' : ''}
      >
        ${isOutOfStock ? 'Out of Stock' : 'Add to Cart'}
      </button>
    </div>
  `;

  // Click on card to view details (except button)
  card.addEventListener('click', (e) => {
    if (!e.target.classList.contains('add-to-cart-btn')) {
      window.location.href = `product-detail.html?id=${product.id}`;
    }
  });

  return card;
}

async function addToCart(productId, productName) {
  try {
    await cart.addItem(productId, 1);
  } catch (error) {
    console.error('Failed to add to cart:', error);
  }
}

function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substr(0, maxLength) + '...';
}
