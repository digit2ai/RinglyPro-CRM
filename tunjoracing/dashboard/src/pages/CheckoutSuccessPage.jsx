import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { CheckCircle, Package, Mail } from 'lucide-react';

export default function CheckoutSuccessPage() {
  const [searchParams] = useSearchParams();
  const [session, setSession] = useState(null);
  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    if (sessionId) {
      fetch(`/tunjoracing/api/v1/checkout/session/${sessionId}`)
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setSession(data.session);
          }
        })
        .catch(console.error);

      // Clear cart session
      localStorage.removeItem('tunjo_cart_session');
    }
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-slate-900">
      <Navbar />

      <main className="pt-24 pb-16">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="bg-slate-800/50 rounded-2xl p-8 md:p-12 border border-slate-700">
            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="h-12 w-12 text-green-500" />
            </div>

            <h1 className="text-3xl font-racing font-bold text-white mb-4">
              Order <span className="gradient-text">Confirmed!</span>
            </h1>

            <p className="text-slate-300 text-lg mb-8">
              Thank you for your purchase! Your order has been received and is being processed.
            </p>

            {session && (
              <div className="bg-slate-900/50 rounded-lg p-6 mb-8 text-left">
                <h3 className="text-white font-semibold mb-4">Order Details</h3>
                <div className="space-y-2 text-slate-300">
                  <p><span className="text-slate-500">Email:</span> {session.customer_email}</p>
                  <p><span className="text-slate-500">Total:</span> ${session.amount_total?.toFixed(2)} {session.currency?.toUpperCase()}</p>
                  <p><span className="text-slate-500">Status:</span> <span className="text-green-400">Paid</span></p>
                </div>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-4 mb-8">
              <div className="bg-slate-900/50 rounded-lg p-4 flex items-center gap-3">
                <Mail className="h-6 w-6 text-amber-400" />
                <div className="text-left">
                  <p className="text-white font-medium">Confirmation Email</p>
                  <p className="text-slate-400 text-sm">Check your inbox</p>
                </div>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-4 flex items-center gap-3">
                <Package className="h-6 w-6 text-amber-400" />
                <div className="text-left">
                  <p className="text-white font-medium">Shipping Updates</p>
                  <p className="text-slate-400 text-sm">We'll email you tracking info</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/store"
                className="px-6 py-3 bg-amber-500 text-black font-semibold rounded-lg hover:bg-amber-600 transition-colors"
              >
                Continue Shopping
              </Link>
              <Link
                to="/"
                className="px-6 py-3 border border-slate-600 text-white font-semibold rounded-lg hover:bg-slate-800 transition-colors"
              >
                Back to Home
              </Link>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
