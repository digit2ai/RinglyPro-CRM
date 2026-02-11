import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { ShoppingCart } from 'lucide-react';

export default function StorePage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/tunjoracing/api/v1/products?status=active${selectedCategory ? `&category=${selectedCategory}` : ''}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) setProducts(data.data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [selectedCategory]);

  useEffect(() => {
    fetch('/tunjoracing/api/v1/products/categories')
      .then(res => res.json())
      .then(data => {
        if (data.success) setCategories(data.data);
      })
      .catch(console.error);
  }, []);

  const getImageUrl = (product) => {
    if (product.images) {
      try {
        const images = typeof product.images === 'string' ? JSON.parse(product.images) : product.images;
        if (images && images.length > 0) return images[0];
      } catch (e) {}
    }
    return 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400';
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
      <Navbar />

      <main className="pt-24 pb-16">
        <div className="container mx-auto">
          {/* Header */}
          <div className="mb-12">
            <span className="pill mb-4">Official Store</span>
            <h1 className="text-4xl font-bold text-white mb-4">
              TunjoRacing <span style={{ color: '#e31837' }}>Merchandise</span>
            </h1>
            <p style={{ color: '#888' }} className="text-lg">
              Gear up with official TunjoRacing apparel and collectibles
            </p>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-8">
            <button
              onClick={() => setSelectedCategory('')}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                selectedCategory === ''
                  ? 'bg-[#e31837] text-white'
                  : 'bg-[#1a1a1a] text-[#888] border border-[#333] hover:border-[#e31837]'
              }`}
            >
              All Products
            </button>
            {categories.map((cat) => (
              <button
                key={cat.category}
                onClick={() => setSelectedCategory(cat.category)}
                className={`px-4 py-2 rounded-full text-sm font-medium capitalize transition-colors ${
                  selectedCategory === cat.category
                    ? 'bg-[#e31837] text-white'
                    : 'bg-[#1a1a1a] text-[#888] border border-[#333] hover:border-[#e31837]'
                }`}
              >
                {cat.category} ({cat.count})
              </button>
            ))}
          </div>

          {/* Products Grid */}
          {loading ? (
            <div className="text-center py-20">
              <div className="animate-spin w-8 h-8 border-2 border-[#e31837] border-t-transparent rounded-full mx-auto mb-4"></div>
              <p style={{ color: '#888' }}>Loading products...</p>
            </div>
          ) : products.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {products.map((product) => (
                <Link
                  key={product.id}
                  to={`/store/product/${product.slug}`}
                  className="product-card group"
                >
                  <div className="relative overflow-hidden">
                    <img
                      src={getImageUrl(product)}
                      alt={product.name}
                      className="w-full h-64 object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    {product.compare_at_price && (
                      <span className="absolute top-3 left-3 bg-[#e31837] text-white text-xs font-bold px-2 py-1 rounded">
                        SALE
                      </span>
                    )}
                  </div>
                  <div className="p-4">
                    <p style={{ color: '#888' }} className="text-xs uppercase tracking-wider mb-1">
                      {product.category}
                    </p>
                    <h3 className="text-white font-medium mb-2">{product.name}</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold" style={{ color: '#e31837' }}>
                        ${parseFloat(product.price).toFixed(2)}
                      </span>
                      {product.compare_at_price && (
                        <span style={{ color: '#666' }} className="text-sm line-through">
                          ${parseFloat(product.compare_at_price).toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="card text-center py-20">
              <ShoppingCart className="h-16 w-16 mx-auto mb-4" style={{ color: '#888' }} />
              <h3 className="text-xl font-bold mb-2">No products available</h3>
              <p style={{ color: '#888' }}>Check back soon for new merchandise!</p>
            </div>
          )}

          {/* Cart Banner */}
          <div className="cta-band mt-12">
            <div>
              <h3 className="font-bold mb-1">Ready to check out?</h3>
              <p style={{ color: '#888' }} className="text-sm">Free shipping on orders over $100</p>
            </div>
            <Link to="/store/cart" className="btn">
              <ShoppingCart className="h-4 w-4 mr-2" />
              View Cart
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
