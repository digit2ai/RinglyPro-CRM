import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Trash2, Minus, Plus, ShoppingCart, ChevronLeft } from 'lucide-react';

const getCartSession = () => {
  return localStorage.getItem('tunjo_cart_session') || '';
};

export default function CartPage() {
  const navigate = useNavigate();
  const [cart, setCart] = useState({ items: [], subtotal: 0, item_count: 0 });
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);

  const fetchCart = async () => {
    const sessionId = getCartSession();
    if (!sessionId) {
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/tunjoracing/api/v1/cart?session_id=${sessionId}`, {
        headers: { 'X-Cart-Session': sessionId }
      });
      const data = await res.json();
      if (data.success) {
        setCart(data.data);
      }
    } catch (error) {
      console.error('Fetch cart error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCart();
  }, []);

  const updateQuantity = async (itemId, newQty) => {
    const sessionId = getCartSession();
    try {
      const res = await fetch(`/tunjoracing/api/v1/cart/items/${itemId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Cart-Session': sessionId
        },
        body: JSON.stringify({ quantity: newQty })
      });
      if (res.ok) {
        fetchCart();
      }
    } catch (error) {
      console.error('Update error:', error);
    }
  };

  const removeItem = async (itemId) => {
    const sessionId = getCartSession();
    try {
      const res = await fetch(`/tunjoracing/api/v1/cart/items/${itemId}`, {
        method: 'DELETE',
        headers: { 'X-Cart-Session': sessionId }
      });
      if (res.ok) {
        fetchCart();
      }
    } catch (error) {
      console.error('Remove error:', error);
    }
  };

  const handleCheckout = async () => {
    setCheckingOut(true);
    const sessionId = getCartSession();

    try {
      const res = await fetch('/tunjoracing/api/v1/checkout/create-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Cart-Session': sessionId
        },
        body: JSON.stringify({})
      });
      const data = await res.json();

      if (data.success && data.checkout_url) {
        window.location.href = data.checkout_url;
      } else {
        alert('Unable to start checkout. Please try again.');
        setCheckingOut(false);
      }
    } catch (error) {
      console.error('Checkout error:', error);
      alert('Checkout error. Please try again.');
      setCheckingOut(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900">
        <Navbar />
        <div className="pt-24 pb-16 max-w-4xl mx-auto px-4">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-slate-800 rounded w-1/3"></div>
            <div className="h-24 bg-slate-800 rounded"></div>
            <div className="h-24 bg-slate-800 rounded"></div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <Navbar />

      <main className="pt-24 pb-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <button
            onClick={() => navigate('/store')}
            className="flex items-center text-slate-400 hover:text-white mb-8 transition-colors"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Continue Shopping
          </button>

          <h1 className="text-3xl font-racing font-bold text-white mb-8">
            Shopping <span className="gradient-text">Cart</span>
          </h1>

          {cart.items.length === 0 ? (
            <div className="text-center py-16">
              <ShoppingCart className="h-16 w-16 text-slate-600 mx-auto mb-4" />
              <h2 className="text-xl text-white mb-2">Your cart is empty</h2>
              <p className="text-slate-400 mb-8">Add some TunjoRacing gear to your cart!</p>
              <Link
                to="/store"
                className="inline-flex items-center px-6 py-3 bg-amber-500 text-black font-semibold rounded-lg hover:bg-amber-600 transition-colors"
              >
                Browse Products
              </Link>
            </div>
          ) : (
            <div className="grid lg:grid-cols-3 gap-8">
              {/* Cart Items */}
              <div className="lg:col-span-2 space-y-4">
                {cart.items.map((item) => (
                  <div key={item.id} className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 flex gap-4">
                    <div className="w-24 h-24 bg-slate-700 rounded-lg flex-shrink-0 overflow-hidden">
                      {item.product?.images?.[0] || item.variant?.image_url ? (
                        <img
                          src={item.variant?.image_url || item.product.images[0]}
                          alt={item.product.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ShoppingCart className="h-8 w-8 text-slate-600" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-medium mb-1">{item.product?.name}</h3>
                      {item.variant && (
                        <p className="text-slate-400 text-sm">{item.variant.title}</p>
                      )}
                      <p className="text-amber-400 font-semibold mt-2">${item.price}</p>
                    </div>

                    <div className="flex flex-col items-end justify-between">
                      <button
                        onClick={() => removeItem(item.id)}
                        className="text-slate-400 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>

                      <div className="flex items-center border border-slate-600 rounded">
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          className="p-2 text-slate-400 hover:text-white"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="px-3 text-white text-sm">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          className="p-2 text-slate-400 hover:text-white"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Order Summary */}
              <div className="lg:col-span-1">
                <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700 sticky top-24">
                  <h2 className="text-xl font-semibold text-white mb-4">Order Summary</h2>

                  <div className="space-y-3 mb-6">
                    <div className="flex justify-between text-slate-300">
                      <span>Subtotal ({cart.item_count} items)</span>
                      <span>${cart.subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>Shipping</span>
                      <span className="text-slate-400">Calculated at checkout</span>
                    </div>
                  </div>

                  <div className="border-t border-slate-700 pt-4 mb-6">
                    <div className="flex justify-between text-white font-semibold text-lg">
                      <span>Total</span>
                      <span>${cart.subtotal.toFixed(2)}</span>
                    </div>
                  </div>

                  <button
                    onClick={handleCheckout}
                    disabled={checkingOut}
                    className="w-full py-4 bg-amber-500 text-black font-semibold rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50"
                  >
                    {checkingOut ? 'Redirecting to Checkout...' : 'Proceed to Checkout'}
                  </button>

                  <p className="text-slate-500 text-xs text-center mt-4">
                    Secure checkout powered by Stripe
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
