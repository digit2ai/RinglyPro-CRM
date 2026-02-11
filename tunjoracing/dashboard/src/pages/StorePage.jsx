import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { ShoppingCart, Filter } from 'lucide-react';

export default function StorePage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch products
    fetch(`/tunjoracing/api/v1/products?status=active${selectedCategory ? `&category=${selectedCategory}` : ''}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setProducts(data.data);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [selectedCategory]);

  useEffect(() => {
    // Fetch categories
    fetch('/tunjoracing/api/v1/products/categories')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setCategories(data.data);
        }
      })
      .catch(console.error);
  }, []);

  // Demo products if API doesn't return any
  const demoProducts = [
    { id: 1, name: 'TunjoRacing Team Hoodie', slug: 'team-hoodie', price: 79.99, images: [], category: 'apparel', featured: true },
    { id: 2, name: 'Racing Cap - Black', slug: 'racing-cap-black', price: 34.99, images: [], category: 'apparel', featured: true },
    { id: 3, name: 'Pit Crew T-Shirt', slug: 'pit-crew-tshirt', price: 44.99, images: [], category: 'apparel', featured: false },
    { id: 4, name: 'Signed Mini Helmet', slug: 'signed-mini-helmet', price: 149.99, images: [], category: 'collectibles', featured: true },
    { id: 5, name: 'Lanyard & Badge', slug: 'lanyard-badge', price: 14.99, images: [], category: 'accessories', featured: false },
    { id: 6, name: 'Racing Gloves', slug: 'racing-gloves', price: 89.99, images: [], category: 'accessories', featured: false },
  ];

  const displayProducts = products.length > 0 ? products : demoProducts;

  return (
    <div className="min-h-screen bg-slate-900">
      <Navbar />

      <main className="pt-24 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-12">
            <h1 className="text-4xl font-racing font-bold text-white mb-4">
              Official <span className="gradient-text">Merchandise</span>
            </h1>
            <p className="text-slate-400 text-lg">
              Gear up with official TunjoRacing merchandise
            </p>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-4 mb-8 overflow-x-auto pb-2">
            <button
              onClick={() => setSelectedCategory('')}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                selectedCategory === ''
                  ? 'bg-amber-500 text-black'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              All Products
            </button>
            {(categories.length > 0 ? categories : [
              { category: 'apparel', count: 3 },
              { category: 'collectibles', count: 1 },
              { category: 'accessories', count: 2 },
            ]).map((cat) => (
              <button
                key={cat.category}
                onClick={() => setSelectedCategory(cat.category)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors capitalize ${
                  selectedCategory === cat.category
                    ? 'bg-amber-500 text-black'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {cat.category} ({cat.count})
              </button>
            ))}
          </div>

          {/* Products Grid */}
          {loading ? (
            <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="bg-slate-800 rounded-lg p-4 animate-pulse">
                  <div className="aspect-square bg-slate-700 rounded-lg mb-4"></div>
                  <div className="h-4 bg-slate-700 rounded mb-2"></div>
                  <div className="h-4 bg-slate-700 rounded w-1/2"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-6">
              {displayProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}

function ProductCard({ product }) {
  return (
    <Link
      to={`/store/product/${product.slug}`}
      className="group bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700 card-hover"
    >
      <div className="aspect-square bg-slate-700 relative overflow-hidden">
        {product.images && product.images[0] ? (
          <img
            src={product.images[0]}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ShoppingCart className="h-12 w-12 text-slate-600" />
          </div>
        )}
        {product.featured && (
          <span className="absolute top-2 right-2 bg-amber-500 text-black text-xs font-semibold px-2 py-1 rounded">
            Featured
          </span>
        )}
        {product.compare_at_price && product.compare_at_price > product.price && (
          <span className="absolute top-2 left-2 bg-red-600 text-white text-xs font-semibold px-2 py-1 rounded">
            Sale
          </span>
        )}
      </div>
      <div className="p-4">
        <h3 className="text-white font-medium mb-2 group-hover:text-amber-400 transition-colors">
          {product.name}
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-white">${product.price}</span>
          {product.compare_at_price && product.compare_at_price > product.price && (
            <span className="text-sm text-slate-500 line-through">${product.compare_at_price}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
