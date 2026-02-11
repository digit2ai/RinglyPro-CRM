import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { ShoppingCart, Minus, Plus, Check, ChevronLeft } from 'lucide-react';

// Generate or get cart session ID
const getCartSession = () => {
  let sessionId = localStorage.getItem('tunjo_cart_session');
  if (!sessionId) {
    sessionId = 'cart_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    localStorage.setItem('tunjo_cart_session', sessionId);
  }
  return sessionId;
};

export default function ProductPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [addingToCart, setAddingToCart] = useState(false);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    fetch(`/tunjoracing/api/v1/products/${slug}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setProduct(data.data);
          if (data.data.variants && data.data.variants.length > 0) {
            setSelectedVariant(data.data.variants[0]);
          }
        }
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [slug]);

  const handleAddToCart = async () => {
    setAddingToCart(true);

    try {
      const res = await fetch('/tunjoracing/api/v1/cart/items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Cart-Session': getCartSession()
        },
        body: JSON.stringify({
          product_id: product.id,
          variant_id: selectedVariant?.id || null,
          quantity
        })
      });

      const data = await res.json();
      if (data.success) {
        setAdded(true);
        setTimeout(() => setAdded(false), 2000);
      }
    } catch (error) {
      console.error('Add to cart error:', error);
    } finally {
      setAddingToCart(false);
    }
  };

  const currentPrice = selectedVariant?.price || product?.price;
  const currentStock = selectedVariant?.inventory_quantity ?? product?.inventory_quantity ?? 99;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900">
        <Navbar />
        <div className="pt-24 pb-16 max-w-7xl mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 animate-pulse">
            <div className="aspect-square bg-slate-800 rounded-lg"></div>
            <div className="space-y-4">
              <div className="h-8 bg-slate-800 rounded w-3/4"></div>
              <div className="h-6 bg-slate-800 rounded w-1/4"></div>
              <div className="h-24 bg-slate-800 rounded"></div>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-slate-900">
        <Navbar />
        <div className="pt-24 pb-16 max-w-7xl mx-auto px-4 text-center">
          <h1 className="text-2xl text-white mb-4">Product not found</h1>
          <button onClick={() => navigate('/store')} className="text-amber-400">
            Return to Store
          </button>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <Navbar />

      <main className="pt-24 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Back button */}
          <button
            onClick={() => navigate('/store')}
            className="flex items-center text-slate-400 hover:text-white mb-8 transition-colors"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Store
          </button>

          <div className="grid md:grid-cols-2 gap-12">
            {/* Image Gallery */}
            <div>
              <div className="aspect-square bg-slate-800 rounded-lg overflow-hidden">
                {product.images && product.images[0] ? (
                  <img
                    src={product.images[0]}
                    alt={product.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ShoppingCart className="h-24 w-24 text-slate-600" />
                  </div>
                )}
              </div>
              {/* Thumbnail gallery */}
              {product.images && product.images.length > 1 && (
                <div className="grid grid-cols-4 gap-4 mt-4">
                  {product.images.slice(0, 4).map((img, i) => (
                    <button key={i} className="aspect-square bg-slate-800 rounded-lg overflow-hidden border-2 border-transparent hover:border-amber-500">
                      <img src={img} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Product Info */}
            <div>
              <h1 className="text-3xl font-bold text-white mb-4">{product.name}</h1>

              <div className="flex items-center gap-4 mb-6">
                <span className="text-3xl font-bold text-white">${currentPrice}</span>
                {product.compare_at_price && product.compare_at_price > currentPrice && (
                  <span className="text-xl text-slate-500 line-through">${product.compare_at_price}</span>
                )}
              </div>

              <p className="text-slate-300 mb-8 leading-relaxed">
                {product.description || product.short_description || 'Official TunjoRacing merchandise. Premium quality, designed for racing enthusiasts.'}
              </p>

              {/* Variant selector */}
              {product.variants && product.variants.length > 0 && (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    {product.variant_options?.[0] || 'Option'}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {product.variants.map((variant) => (
                      <button
                        key={variant.id}
                        onClick={() => setSelectedVariant(variant)}
                        className={`px-4 py-2 rounded-lg border transition-colors ${
                          selectedVariant?.id === variant.id
                            ? 'border-amber-500 bg-amber-500/10 text-white'
                            : 'border-slate-600 text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        {variant.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quantity */}
              <div className="mb-8">
                <label className="block text-sm font-medium text-slate-300 mb-2">Quantity</label>
                <div className="flex items-center gap-4">
                  <div className="flex items-center border border-slate-600 rounded-lg">
                    <button
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="p-3 text-slate-400 hover:text-white transition-colors"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="px-4 text-white font-medium">{quantity}</span>
                    <button
                      onClick={() => setQuantity(Math.min(currentStock, quantity + 1))}
                      className="p-3 text-slate-400 hover:text-white transition-colors"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <span className="text-slate-400 text-sm">
                    {currentStock > 0 ? `${currentStock} in stock` : 'Out of stock'}
                  </span>
                </div>
              </div>

              {/* Add to Cart */}
              <button
                onClick={handleAddToCart}
                disabled={addingToCart || currentStock === 0}
                className={`w-full py-4 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all ${
                  added
                    ? 'bg-green-600 text-white'
                    : currentStock === 0
                    ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                    : 'bg-amber-500 hover:bg-amber-600 text-black'
                }`}
              >
                {added ? (
                  <>
                    <Check className="h-5 w-5" />
                    Added to Cart!
                  </>
                ) : addingToCart ? (
                  'Adding...'
                ) : currentStock === 0 ? (
                  'Out of Stock'
                ) : (
                  <>
                    <ShoppingCart className="h-5 w-5" />
                    Add to Cart
                  </>
                )}
              </button>

              <button
                onClick={() => navigate('/store/cart')}
                className="w-full mt-4 py-4 rounded-lg font-semibold border border-slate-600 text-white hover:bg-slate-800 transition-colors"
              >
                View Cart
              </button>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
