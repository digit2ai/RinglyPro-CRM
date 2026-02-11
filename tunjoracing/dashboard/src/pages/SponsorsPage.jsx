import React from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { ExternalLink, ChevronRight } from 'lucide-react';

export default function SponsorsPage() {
  const titleSponsors = [
    { name: 'Title Sponsor Available', tier: 'title', logo: null, website: '#' },
  ];

  const primarySponsors = [
    { name: 'Primary Sponsor Available', tier: 'primary', logo: null, website: '#' },
  ];

  const supportingSponsors = [
    { name: 'Supporting Partner Available', tier: 'supporting', logo: null, website: '#' },
    { name: 'Media Partner Available', tier: 'supporting', logo: null, website: '#' },
  ];

  return (
    <div className="min-h-screen bg-slate-900">
      <Navbar />

      <main className="pt-24 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h1 className="text-4xl font-racing font-bold text-white mb-4">
              Our <span className="gradient-text">Partners</span>
            </h1>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">
              TunjoRacing is powered by world-class partners who share our passion for motorsport excellence.
            </p>
          </div>

          {/* Title Sponsors */}
          <section className="mb-16">
            <h2 className="text-2xl font-racing font-bold text-amber-400 mb-8 text-center">Title Sponsors</h2>
            <div className="grid md:grid-cols-1 gap-8 max-w-2xl mx-auto">
              {titleSponsors.map((sponsor, i) => (
                <SponsorCard key={i} sponsor={sponsor} size="large" />
              ))}
            </div>
          </section>

          {/* Primary Sponsors */}
          <section className="mb-16">
            <h2 className="text-2xl font-racing font-bold text-white mb-8 text-center">Primary Sponsors</h2>
            <div className="grid md:grid-cols-2 gap-8">
              {primarySponsors.map((sponsor, i) => (
                <SponsorCard key={i} sponsor={sponsor} size="medium" />
              ))}
            </div>
          </section>

          {/* Supporting Partners */}
          <section className="mb-16">
            <h2 className="text-xl font-racing font-bold text-slate-300 mb-8 text-center">Supporting Partners</h2>
            <div className="grid md:grid-cols-3 gap-6">
              {supportingSponsors.map((sponsor, i) => (
                <SponsorCard key={i} sponsor={sponsor} size="small" />
              ))}
            </div>
          </section>

          {/* CTA */}
          <section className="text-center">
            <div className="bg-gradient-to-r from-slate-800 to-slate-800/50 rounded-2xl p-8 md:p-12 border border-slate-700 inline-block">
              <h3 className="text-2xl font-racing font-bold text-white mb-4">
                Join Our Partner Network
              </h3>
              <p className="text-slate-300 mb-6 max-w-md">
                Interested in partnering with TunjoRacing? We offer flexible sponsorship packages for businesses of all sizes.
              </p>
              <Link
                to="/sponsorship"
                className="btn-gold inline-flex items-center"
              >
                Explore Sponsorship Options
                <ChevronRight className="ml-2 h-5 w-5" />
              </Link>
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}

function SponsorCard({ sponsor, size }) {
  const sizeClasses = {
    large: 'p-12 aspect-[3/1]',
    medium: 'p-8 aspect-[2/1]',
    small: 'p-6 aspect-[3/2]'
  };

  return (
    <a
      href={sponsor.website}
      target="_blank"
      rel="noopener noreferrer"
      className={`bg-slate-800/50 rounded-lg border border-slate-700 flex items-center justify-center card-hover group relative ${sizeClasses[size]}`}
    >
      {sponsor.logo ? (
        <img src={sponsor.logo} alt={sponsor.name} className="max-h-full max-w-full object-contain" />
      ) : (
        <div className="text-center">
          <div className="text-slate-500 font-medium mb-2">{sponsor.name}</div>
          <span className="text-amber-400 text-sm group-hover:underline flex items-center justify-center gap-1">
            Learn More <ExternalLink className="h-3 w-3" />
          </span>
        </div>
      )}
    </a>
  );
}
