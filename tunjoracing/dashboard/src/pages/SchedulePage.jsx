import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Calendar, MapPin, Flag, Trophy } from 'lucide-react';

export default function SchedulePage() {
  const [races, setRaces] = useState([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/tunjoracing/api/v1/races?year=${year}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setRaces(data.data);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [year]);

  // Demo races if API doesn't return any
  const demoRaces = [
    { id: 1, name: 'Imola F4 Round 1', track_name: 'Autodromo Enzo e Dino Ferrari', city: 'Imola', country: 'Italy', start_date: '2024-03-15', end_date: '2024-03-17', status: 'completed', race1_position: 3, points_earned: 18 },
    { id: 2, name: 'Spa F4 Championship', track_name: 'Circuit de Spa-Francorchamps', city: 'Stavelot', country: 'Belgium', start_date: '2024-04-05', end_date: '2024-04-07', status: 'completed', race1_position: 5, points_earned: 12 },
    { id: 3, name: 'Monaco Historic', track_name: 'Circuit de Monaco', city: 'Monte Carlo', country: 'Monaco', start_date: '2024-05-10', end_date: '2024-05-12', status: 'upcoming' },
    { id: 4, name: 'Monza F4 Round', track_name: 'Autodromo Nazionale Monza', city: 'Monza', country: 'Italy', start_date: '2024-06-14', end_date: '2024-06-16', status: 'upcoming' },
    { id: 5, name: 'Hockenheim Challenge', track_name: 'Hockenheimring', city: 'Hockenheim', country: 'Germany', start_date: '2024-07-19', end_date: '2024-07-21', status: 'upcoming' },
  ];

  const displayRaces = races.length > 0 ? races : demoRaces;

  return (
    <div className="min-h-screen bg-slate-900">
      <Navbar />

      <main className="pt-24 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-12">
            <h1 className="text-4xl font-racing font-bold text-white mb-4">
              Race <span className="gradient-text">Calendar</span>
            </h1>
            <p className="text-slate-400 text-lg">Follow our racing season around the world</p>
          </div>

          {/* Year selector */}
          <div className="flex gap-2 mb-8">
            {[2023, 2024, 2025].map((y) => (
              <button
                key={y}
                onClick={() => setYear(y)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  year === y
                    ? 'bg-amber-500 text-black'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {y}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-slate-800 rounded-lg p-6 animate-pulse">
                  <div className="h-6 bg-slate-700 rounded w-1/3 mb-4"></div>
                  <div className="h-4 bg-slate-700 rounded w-1/2"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {displayRaces.map((race, i) => (
                <RaceCard key={race.id} race={race} index={i} />
              ))}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}

function RaceCard({ race, index }) {
  const startDate = new Date(race.start_date);
  const endDate = new Date(race.end_date);
  const isPast = race.status === 'completed';
  const isUpcoming = race.status === 'upcoming';

  return (
    <div className={`bg-slate-800/50 rounded-lg p-6 border ${isPast ? 'border-slate-700' : 'border-amber-500/30'} card-hover`}>
      <div className="flex flex-col md:flex-row md:items-center gap-4">
        {/* Date */}
        <div className="flex-shrink-0 text-center md:w-24">
          <div className="text-amber-400 text-sm font-medium">
            {startDate.toLocaleDateString('en-US', { month: 'short' })}
          </div>
          <div className="text-3xl font-racing font-bold text-white">
            {startDate.getDate()}
          </div>
          {startDate.getDate() !== endDate.getDate() && (
            <div className="text-slate-500 text-xs">
              - {endDate.getDate()}
            </div>
          )}
        </div>

        {/* Race info */}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-xl font-semibold text-white">{race.name}</h3>
            {isPast && race.race1_position && race.race1_position <= 3 && (
              <Trophy className="h-5 w-5 text-amber-400" />
            )}
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span className="flex items-center gap-1">
              <Flag className="h-4 w-4" />
              {race.track_name}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {race.city}, {race.country}
            </span>
          </div>
        </div>

        {/* Status/Results */}
        <div className="flex-shrink-0 text-right">
          {isPast ? (
            <div>
              {race.race1_position && (
                <div className="text-2xl font-racing font-bold text-white">
                  P{race.race1_position}
                </div>
              )}
              <div className="text-amber-400 text-sm">
                {race.points_earned ? `${race.points_earned} pts` : 'Completed'}
              </div>
            </div>
          ) : isUpcoming ? (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30">
              Upcoming
            </span>
          ) : (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-500/20 text-green-400 border border-green-500/30">
              Live
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
