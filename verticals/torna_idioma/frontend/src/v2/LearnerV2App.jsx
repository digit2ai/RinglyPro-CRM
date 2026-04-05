import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import LearnerHome from './pages/LearnerHome';
import CognateExplorer from './pages/CognateExplorer';
import SRSReview from './pages/SRSReview';
import Badges from './pages/Badges';
import Leaderboard from './pages/Leaderboard';
import IsabelChat from './pages/IsabelChat';
import ConversationRoom from './pages/ConversationRoom';

/**
 * Torna Idioma — Learner Platform v2 Router
 *
 * Mounted at /Torna_Idioma/learn/* from the parent App.jsx.
 * This component owns all nested v2 routes.
 *
 * Step 2: LearnerHome (profile)
 * Future steps will add:
 *   /learn/lesson/:id   — LessonPlayer         (Step 9)
 *   /learn/review       — SRSReview            (Step 4)
 *   /learn/isabel       — IsabelChat           (Step 6)
 *   /learn/voice        — ConversationRoom     (Step 7)
 *   /learn/cognates     — CognateExplorer      (Step 3)
 *   /learn/progress     — Progress             (Step 5)
 *   /learn/leaderboard  — Leaderboard          (Step 5)
 *   /learn/tutors       — TutorMarketplace     (Step 10)
 */
export default function LearnerV2App() {
  return (
    <Routes>
      <Route index element={<LearnerHome />} />
      <Route path="home" element={<LearnerHome />} />
      <Route path="cognates" element={<CognateExplorer />} />
      <Route path="review" element={<SRSReview />} />
      <Route path="badges" element={<Badges />} />
      <Route path="leaderboard" element={<Leaderboard />} />
      <Route path="isabel" element={<IsabelChat />} />
      <Route path="voice" element={<ConversationRoom />} />
      <Route path="*" element={<Navigate to="/Torna_Idioma/learn" replace />} />
    </Routes>
  );
}
