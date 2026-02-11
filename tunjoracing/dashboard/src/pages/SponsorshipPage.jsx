import React, { useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Check, Star, Users, Globe, Trophy, Camera, ChevronRight } from 'lucide-react';

export default function SponsorshipPage() {
  const [formData, setFormData] = useState({
    company_name: '',
    contact_name: '',
    email: '',
    phone: '',
    interested_level: '',
    budget_range: '',
    message: ''
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const packages = [
    {
      tier: 'Title',
      highlight: true,
      price: 'Custom',
      benefits: [
        'Naming rights (TunjoRacing presented by [Brand])',
        'Primary logo on helmet, suit, and car',
        'Dedicated content campaigns (12+/year)',
        'Social media exposure (100+ posts/year)',
        'VIP experiences (10 passes)',
        'Hospitality at all races',
        'Exclusive brand activations',
        'Monthly performance reports',
        'First right of renewal'
      ],
      reach: '3M+ impressions/month',
      value: '$500K+ media value'
    },
    {
      tier: 'Primary',
      price: 'Custom',
      benefits: [
        'Prominent logo on suit and car',
        'Dedicated content campaigns (6+/year)',
        'Social media exposure (50+ posts/year)',
        'VIP experiences (5 passes)',
        'Hospitality at select races',
        'Quarterly performance reports'
      ],
      reach: '1M+ impressions/month',
      value: '$200K+ media value'
    },
    {
      tier: 'Supporting',
      price: 'From $5K',
      benefits: [
        'Logo on team apparel',
        'Social media mentions (12+/year)',
        'Website logo placement',
        'VIP experiences (2 passes)',
        'Annual summary report'
      ],
      reach: '500K+ impressions/year',
      value: '$50K+ media value'
    }
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/tunjoracing/api/v1/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.success) {
        setSubmitted(true);
      }
    } catch (error) {
      console.error('Submit error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900">
      <Navbar />

      <main className="pt-24 pb-16">
        {/* Hero */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-20">
          <div className="text-center">
            <h1 className="text-4xl md:text-5xl font-racing font-bold text-white mb-6">
              Partner With <span className="gradient-text">TunjoRacing</span>
            </h1>
            <p className="text-xl text-slate-300 max-w-3xl mx-auto">
              Reach millions of motorsport fans worldwide. Get measurable ROI with our comprehensive sponsorship packages.
            </p>
          </div>
        </section>

        {/* Stats */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-20">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <StatCard icon={Globe} value="8" label="Countries" />
            <StatCard icon={Users} value="50K+" label="Social Followers" />
            <StatCard icon={Trophy} value="15+" label="Podium Finishes" />
            <StatCard icon={Camera} value="3M+" label="Monthly Impressions" />
          </div>
        </section>

        {/* Packages */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-20">
          <h2 className="text-3xl font-racing font-bold text-white text-center mb-12">
            Sponsorship <span className="gradient-text">Packages</span>
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            {packages.map((pkg, i) => (
              <PackageCard key={i} package={pkg} />
            ))}
          </div>
        </section>

        {/* Inquiry Form */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-slate-800/50 rounded-2xl p-8 md:p-12 border border-slate-700">
            <h2 className="text-2xl font-racing font-bold text-white text-center mb-8">
              Get In <span className="gradient-text">Touch</span>
            </h2>

            {submitted ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="h-8 w-8 text-green-500" />
                </div>
                <h3 className="text-xl text-white mb-2">Thank you for your interest!</h3>
                <p className="text-slate-400">Our team will be in touch within 24 hours.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <Input
                    label="Company Name *"
                    value={formData.company_name}
                    onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                    required
                  />
                  <Input
                    label="Contact Name *"
                    value={formData.contact_name}
                    onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                    required
                  />
                </div>
                <div className="grid md:grid-cols-2 gap-6">
                  <Input
                    label="Email *"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                  <Input
                    label="Phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div className="grid md:grid-cols-2 gap-6">
                  <Select
                    label="Interested Level"
                    value={formData.interested_level}
                    onChange={(e) => setFormData({ ...formData, interested_level: e.target.value })}
                    options={[
                      { value: '', label: 'Select...' },
                      { value: 'title', label: 'Title Sponsor' },
                      { value: 'primary', label: 'Primary Sponsor' },
                      { value: 'supporting', label: 'Supporting Partner' },
                      { value: 'undecided', label: 'Not sure yet' },
                    ]}
                  />
                  <Select
                    label="Budget Range"
                    value={formData.budget_range}
                    onChange={(e) => setFormData({ ...formData, budget_range: e.target.value })}
                    options={[
                      { value: '', label: 'Select...' },
                      { value: '$5K-$10K', label: '$5,000 - $10,000' },
                      { value: '$10K-$25K', label: '$10,000 - $25,000' },
                      { value: '$25K-$50K', label: '$25,000 - $50,000' },
                      { value: '$50K+', label: '$50,000+' },
                    ]}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Message</label>
                  <textarea
                    rows={4}
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="Tell us about your marketing goals..."
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-amber-500 text-black font-semibold rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? 'Submitting...' : 'Submit Inquiry'}
                  <ChevronRight className="h-5 w-5" />
                </button>
              </form>
            )}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function StatCard({ icon: Icon, value, label }) {
  return (
    <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700 text-center">
      <Icon className="h-8 w-8 text-amber-400 mx-auto mb-3" />
      <div className="text-3xl font-racing font-bold text-white mb-1">{value}</div>
      <div className="text-slate-400 text-sm">{label}</div>
    </div>
  );
}

function PackageCard({ package: pkg }) {
  return (
    <div className={`bg-slate-800/50 rounded-lg p-6 border ${pkg.highlight ? 'border-amber-500' : 'border-slate-700'} relative`}>
      {pkg.highlight && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="bg-amber-500 text-black text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1">
            <Star className="h-3 w-3" /> Premium
          </span>
        </div>
      )}

      <h3 className="text-2xl font-racing font-bold text-white mb-2">{pkg.tier}</h3>
      <div className="text-amber-400 font-semibold mb-4">{pkg.price}</div>

      <div className="space-y-3 mb-6">
        {pkg.benefits.map((benefit, i) => (
          <div key={i} className="flex items-start gap-2 text-slate-300 text-sm">
            <Check className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
            <span>{benefit}</span>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-700 pt-4 space-y-2">
        <div className="text-slate-400 text-sm">
          <span className="text-white font-medium">Reach:</span> {pkg.reach}
        </div>
        <div className="text-slate-400 text-sm">
          <span className="text-white font-medium">Est. Value:</span> {pkg.value}
        </div>
      </div>
    </div>
  );
}

function Input({ label, ...props }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-2">{label}</label>
      <input
        {...props}
        className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
      />
    </div>
  );
}

function Select({ label, options, ...props }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-2">{label}</label>
      <select
        {...props}
        className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}
