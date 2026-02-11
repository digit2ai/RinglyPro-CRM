import React from 'react';
import { Link } from 'react-router-dom';
import { Instagram, Twitter, Youtube, Mail } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-slate-950 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-1">
            <Link to="/" className="flex items-center space-x-2 mb-4">
              <span className="text-xl font-racing font-bold gradient-text">TUNJO</span>
              <span className="text-xl font-racing font-bold text-white">RACING</span>
            </Link>
            <p className="text-slate-400 text-sm">
              Professional international motorsport racing. Pushing limits, chasing dreams.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-semibold text-white mb-4">Quick Links</h4>
            <ul className="space-y-2">
              <li><Link to="/schedule" className="text-slate-400 hover:text-white text-sm">Race Calendar</Link></li>
              <li><Link to="/partners" className="text-slate-400 hover:text-white text-sm">Our Partners</Link></li>
              <li><Link to="/sponsorship" className="text-slate-400 hover:text-white text-sm">Become a Sponsor</Link></li>
              <li><Link to="/store" className="text-slate-400 hover:text-white text-sm">Shop Merchandise</Link></li>
            </ul>
          </div>

          {/* For Partners */}
          <div>
            <h4 className="font-semibold text-white mb-4">For Partners</h4>
            <ul className="space-y-2">
              <li><Link to="/sponsor/login" className="text-slate-400 hover:text-white text-sm">Sponsor Portal</Link></li>
              <li><Link to="/sponsorship" className="text-slate-400 hover:text-white text-sm">Sponsorship Packages</Link></li>
              <li><a href="mailto:sponsors@tunjoracing.com" className="text-slate-400 hover:text-white text-sm">Contact Sales</a></li>
            </ul>
          </div>

          {/* Social & Contact */}
          <div>
            <h4 className="font-semibold text-white mb-4">Connect</h4>
            <div className="flex space-x-4 mb-4">
              <a href="https://instagram.com/tunjoracing" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-pink-500 transition-colors">
                <Instagram className="h-5 w-5" />
              </a>
              <a href="https://twitter.com/tunjoracing" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-blue-400 transition-colors">
                <Twitter className="h-5 w-5" />
              </a>
              <a href="https://youtube.com/@tunjoracing" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-red-500 transition-colors">
                <Youtube className="h-5 w-5" />
              </a>
              <a href="mailto:info@tunjoracing.com" className="text-slate-400 hover:text-amber-400 transition-colors">
                <Mail className="h-5 w-5" />
              </a>
            </div>
            <p className="text-slate-500 text-xs">
              info@tunjoracing.com
            </p>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center">
          <p className="text-slate-500 text-sm">
            &copy; {new Date().getFullYear()} TunjoRacing. All rights reserved.
          </p>
          <div className="flex space-x-6 mt-4 md:mt-0">
            <a href="#" className="text-slate-500 hover:text-white text-xs">Privacy Policy</a>
            <a href="#" className="text-slate-500 hover:text-white text-xs">Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
