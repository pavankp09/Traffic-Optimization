import { Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import Dashboard from './pages/Dashboard'
import CompareSession from './pages/CompareSession'
import PilotReport from './pages/PilotReport'
import SimulationManager from './pages/SimulationManager'
import Analyzer from './pages/Analyzer'
import DecisionReplay from './pages/DecisionReplay'

export default function App() {
  return (
    <div className="min-h-screen bg-transparent">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/studio" element={<Dashboard />} />
        <Route path="/simulations" element={<SimulationManager />} />
        <Route path="/analyzer" element={<Analyzer />} />
        <Route path="/compare" element={<CompareSession />} />
        <Route path="/report" element={<PilotReport />} />
        <Route path="/decisions/:sessionId" element={<DecisionReplay />} />
      </Routes>
    </div>
  )
}
