import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, ShoppingCart, User } from 'lucide-react';

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  const navLinks = [
    { name: 'About', href: '/#about' },
    { name: 'Schedule', href: '/schedule' },
    { name: 'Partners', href: '/partners' },
    { name: 'Sponsorship', href: '/sponsorship' },
    { name: 'Shop', href: '/store' },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2">
            <span className="text-2xl font-racing font-bold gradient-text">TUNJO</span>
            <span className="text-2xl font-racing font-bold text-white">RACING</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                to={link.href}
                className={`text-sm font-medium transition-colors ${
                  location.pathname === link.href
                    ? 'text-amber-400'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {link.name}
              </Link>
            ))}
          </div>

          {/* Right side buttons */}
          <div className="hidden md:flex items-center space-x-4">
            <Link
              to="/store/cart"
              className="p-2 text-slate-300 hover:text-white transition-colors"
            >
              <ShoppingCart className="h-5 w-5" />
            </Link>
            <Link
              to="/sponsor/login"
              className="flex items-center space-x-1 text-sm text-slate-300 hover:text-white transition-colors"
            >
              <User className="h-4 w-4" />
              <span>Sponsor Login</span>
            </Link>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden p-2 text-slate-300"
          >
            {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation */}
      {isOpen && (
        <div className="md:hidden bg-slate-900 border-t border-slate-800">
          <div className="px-4 py-4 space-y-3">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                to={link.href}
                onClick={() => setIsOpen(false)}
                className="block text-slate-300 hover:text-white py-2"
              >
                {link.name}
              </Link>
            ))}
            <hr className="border-slate-700" />
            <Link
              to="/store/cart"
              onClick={() => setIsOpen(false)}
              className="flex items-center space-x-2 text-slate-300 hover:text-white py-2"
            >
              <ShoppingCart className="h-5 w-5" />
              <span>Cart</span>
            </Link>
            <Link
              to="/sponsor/login"
              onClick={() => setIsOpen(false)}
              className="flex items-center space-x-2 text-slate-300 hover:text-white py-2"
            >
              <User className="h-5 w-5" />
              <span>Sponsor Login</span>
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
