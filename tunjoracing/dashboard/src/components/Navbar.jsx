import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, User } from 'lucide-react';

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
    <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-[#0a0a0a]/95 border-b border-[#333]">
      <div className="container mx-auto">
        <div className="flex items-center justify-between py-3">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#e31837] to-[#8b0000] border border-[#e31837]" />
            <div>
              <strong className="text-white text-sm tracking-widest">TUNJO RACING</strong>
              <span className="block text-xs text-[#888]">Professional Motorsport</span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                to={link.href}
                className={`text-sm transition-colors ${
                  location.pathname === link.href
                    ? 'text-[#e31837]'
                    : 'text-[#888] hover:text-[#e31837]'
                }`}
              >
                {link.name}
              </Link>
            ))}
          </nav>

          {/* Right side buttons */}
          <div className="hidden md:flex items-center gap-3">
            <a
              href="https://tunjoracing.com/press"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-amber-500 text-black px-4 py-2 rounded-lg font-bold text-sm hover:bg-amber-400 transition-colors"
            >
              Press Release
            </a>
            <Link
              to="/sponsor/login"
              className="bg-[#e31837] text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-[#c41530] transition-colors"
            >
              Sponsor Login
            </Link>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden p-2 text-white border border-[#333] rounded-xl"
          >
            {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Mobile Navigation Panel */}
      <div className={`fixed top-0 right-0 h-full w-72 bg-[#0a0a0a]/98 border-l border-[#333] z-50 transform transition-transform duration-300 ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>
        <div className="p-6 pt-20">
          {navLinks.map((link) => (
            <Link
              key={link.name}
              to={link.href}
              onClick={() => setIsOpen(false)}
              className="block text-white py-3 border-b border-[#222] hover:text-[#e31837] transition-colors"
            >
              {link.name}
            </Link>
          ))}
          <hr className="border-[#333] my-4" />
          <a
            href="https://tunjoracing.com/press"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 text-amber-500 py-3 hover:text-amber-400"
          >
            <span>Press Release</span>
          </a>
          <Link
            to="/sponsor/login"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 text-white py-3 hover:text-[#e31837]"
          >
            <User className="h-5 w-5" />
            <span>Sponsor Login</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
