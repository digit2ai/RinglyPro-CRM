import React from 'react';
import { Link } from 'react-router-dom';
import { Instagram, Twitter, Youtube, Mail } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 py-8">
          {/* Brand */}
          <div>
            <Link to="/" className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#e31837] to-[#8b0000] border border-[#e31837]" />
              <span className="font-bold text-white tracking-wider">TUNJO RACING</span>
            </Link>
            <p style={{ color: '#888' }} className="text-sm">
              Professional international motorsport racing. Pushing limits, chasing dreams.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-semibold text-white mb-4">Quick Links</h4>
            <ul className="space-y-2">
              <li><Link to="/schedule" style={{ color: '#888' }} className="text-sm hover:text-[#e31837]">Race Calendar</Link></li>
              <li><Link to="/partners" style={{ color: '#888' }} className="text-sm hover:text-[#e31837]">Our Partners</Link></li>
              <li><Link to="/sponsorship" style={{ color: '#888' }} className="text-sm hover:text-[#e31837]">Become a Sponsor</Link></li>
              <li><Link to="/store" style={{ color: '#888' }} className="text-sm hover:text-[#e31837]">Shop Merchandise</Link></li>
            </ul>
          </div>

          {/* For Partners */}
          <div>
            <h4 className="font-semibold text-white mb-4">For Partners</h4>
            <ul className="space-y-2">
              <li><Link to="/sponsor/login" style={{ color: '#888' }} className="text-sm hover:text-[#e31837]">Sponsor Portal</Link></li>
              <li><Link to="/sponsorship" style={{ color: '#888' }} className="text-sm hover:text-[#e31837]">Sponsorship Packages</Link></li>
              <li><a href="mailto:sponsors@tunjoracing.com" style={{ color: '#888' }} className="text-sm hover:text-[#e31837]">Contact Sales</a></li>
            </ul>
          </div>

          {/* Social & Contact */}
          <div>
            <h4 className="font-semibold text-white mb-4">Connect</h4>
            <div className="flex gap-4 mb-4">
              <a href="https://instagram.com/tunjoracing" target="_blank" rel="noopener noreferrer" style={{ color: '#888' }} className="hover:text-[#e31837] transition-colors">
                <Instagram className="h-5 w-5" />
              </a>
              <a href="https://twitter.com/tunjoracing" target="_blank" rel="noopener noreferrer" style={{ color: '#888' }} className="hover:text-[#e31837] transition-colors">
                <Twitter className="h-5 w-5" />
              </a>
              <a href="https://youtube.com/@tunjoracing" target="_blank" rel="noopener noreferrer" style={{ color: '#888' }} className="hover:text-[#e31837] transition-colors">
                <Youtube className="h-5 w-5" />
              </a>
              <a href="mailto:info@tunjoracing.com" style={{ color: '#888' }} className="hover:text-[#e31837] transition-colors">
                <Mail className="h-5 w-5" />
              </a>
            </div>
            <p style={{ color: '#666' }} className="text-xs">info@tunjoracing.com</p>
          </div>
        </div>

        <div className="py-4 border-t border-[#333] flex flex-col md:flex-row justify-between items-center">
          <p style={{ color: '#666' }} className="text-sm">
            &copy; {new Date().getFullYear()} TunjoRacing. All rights reserved.
          </p>
          <div className="flex gap-6 mt-4 md:mt-0">
            <a href="#" style={{ color: '#666' }} className="text-xs hover:text-[#e31837]">Privacy Policy</a>
            <a href="#" style={{ color: '#666' }} className="text-xs hover:text-[#e31837]">Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
