import { Link } from 'react-router-dom'

const navLinks = [
  { id: 'problem', label: 'Problem' },
  { id: 'solution', label: 'Solution' },
  { id: 'modes', label: 'Modes' },
  { id: 'results', label: 'Results' },
  { id: 'monetisation', label: 'Model' },
  { id: 'tech', label: 'Tech' },
]

const problemCards = [
  { value: '4-8 min', text: 'Average time to cross a single intersection in peak city traffic.' },
  { value: '2.1 Bn', text: 'Vehicle-hours wasted annually due to poor signal efficiency.' },
  { value: '12-18%', text: 'Urban productivity loss linked to congestion-driven delays.' },
  { value: '31%', text: 'Higher emissions caused by idle queues and stop-go movement.' },
]

const resultsCards = [
  { value: '35-55%', text: 'Reduction in average crossing time (peak windows)' },
  { value: '2.4 min', text: 'Average time saved per vehicle per crossing' },
  { value: '8,000+', text: 'Vehicle-hours saved per intersection per year' },
  { value: '18%', text: 'Estimated CO2 reduction from smoother flow' },
  { value: '20-40%', text: 'Faster emergency response with signal priority' },
  { value: '0.3 L', text: 'Fuel saved per vehicle per crossing' },
]

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#07090d] text-gray-100">
      <nav className="sticky top-0 z-40 border-b border-white/10 bg-[#07090d]/90 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/" className="font-semibold tracking-tight text-white">Low Traffic<span className="text-cyan-400">.ai</span></a>
          <div className="hidden md:flex items-center gap-6 text-sm text-gray-300">
            {navLinks.map((item) => (
              <a key={item.id} href={`#${item.id}`} className="hover:text-white transition-colors">{item.label}</a>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <a href="/studio" target="_blank" rel="noopener noreferrer" className="text-xs px-3 py-2 rounded-lg border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10">Open Platform</a>
            <a href="#cta" className="text-xs px-3 py-2 rounded-lg bg-white text-black font-semibold">Request Pilot</a>
          </div>
        </div>
      </nav>

      <section id="hero" className="max-w-7xl mx-auto px-6 pt-20 pb-16">
        <p className="text-xs uppercase tracking-[0.22em] text-cyan-400/80">lowtraffic.ai · Hyderabad</p>
        <h1 className="mt-4 text-5xl md:text-7xl font-semibold leading-[0.95] text-white">
          AI That Makes
          <br />
          Every Vehicle
          <br />
          <span className="text-gray-400">Pass Faster</span>
        </h1>
        <p className="mt-6 max-w-2xl text-gray-300 leading-relaxed">
          We plug into existing CCTV networks, analyze real intersection behavior, and deliver either actionable redesign recommendations or adaptive AI signal control.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href="#cta" className="px-5 py-2.5 rounded-lg bg-white text-black font-semibold">Request a Pilot</a>
          <a href="#solution" className="px-5 py-2.5 rounded-lg border border-white/25 text-gray-200 hover:bg-white/5">See How It Works</a>
        </div>
        <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat value="35-55%" label="Lower average crossing time" />
          <Stat value="8,000+" label="Vehicle-hours saved/intersection/year" />
          <Stat value="₹0" label="Upfront government cost" />
          <Stat value="30 days" label="Pilot to measurable outcomes" />
        </div>
      </section>

      <Section id="problem" title="Cities Are Choking" label="The Problem">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {problemCards.map((card) => (
            <div key={card.value} className="bg-[#0f131a] border border-white/10 rounded-2xl p-5">
              <p className="text-3xl font-semibold text-white">{card.value}</p>
              <p className="text-sm text-gray-400 mt-2">{card.text}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="solution" title="24-Hour Feed Ingestion and Continuous Analysis" label="Our Solution">
        <p className="text-gray-400 max-w-2xl">No new hardware, no disruption. Connect RTSP or CCTV feed and start analyzing immediately.</p>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <Step n="01" title="Capture" text="Connect existing CCTV/IP feed to ingest traffic streams." />
          <Step n="02" title="Analyse" text="Detect, classify, and track vehicles, lanes, and queue depth." />
          <Step n="03" title="Calculate" text="Compute crossing-time, bottleneck pressure, and phase waste." />
          <Step n="04" title="Optimise" text="Generate recommendations or deploy adaptive RL signal plans." />
        </div>
      </Section>

      <Section id="modes" title="Choose Your Level of Intervention" label="Phase 2 · Two Modes">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-[#0f131a] border border-white/10 rounded-2xl p-6">
            <p className="text-xs tracking-wide uppercase text-gray-500">Mode 01</p>
            <h3 className="mt-2 text-2xl font-semibold">Intelligent Recommendations</h3>
            <p className="text-gray-400 mt-2">Actionable redesign recommendations from real data, delivered via report + dashboard.</p>
          </div>
          <div className="bg-[#0f131a] border border-cyan-500/30 rounded-2xl p-6">
            <p className="text-xs tracking-wide uppercase text-cyan-300">Mode 02</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">Optimized Signal Engine</h3>
            <p className="text-gray-300 mt-2">Adaptive RL signal control that updates every cycle from live queue behavior.</p>
          </div>
        </div>
      </Section>

      <Section id="results" title="35-55% Reduction in Crossing Time" label="Projected Results">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {resultsCards.map((card) => (
            <div key={card.value + card.text} className="bg-[#0f131a] border border-white/10 rounded-2xl p-5">
              <p className="text-3xl font-semibold text-white">{card.value}</p>
              <p className="text-sm text-gray-400 mt-2">{card.text}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="monetisation" title="We Get Paid Only When You Save Time" label="Monetisation Strategy">
        <div className="bg-[#0f131a] border border-white/10 rounded-2xl p-6">
          <p className="text-gray-300">Performance contract model: no upfront government cost, auditable time-saved revenue sharing.</p>
          <p className="mt-3 text-sm text-gray-400">Example: 50,000 vehicles/month × 2 min saved × ₹0.50/min = ₹50,000/month.</p>
        </div>
      </Section>

      <Section id="tech" title="Built on Proven Infrastructure" label="Technology and Roadmap">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 text-sm text-gray-300">
          <Tech title="Computer Vision" value="YOLOv8 · OpenCV · ByteTrack" />
          <Tech title="Backend" value="Python · Flask · PostgreSQL" />
          <Tech title="RL Engine" value="Stable-Baselines3 · PPO · Gym" />
          <Tech title="Simulation" value="SUMO · TraCI · OSMnx" />
          <Tech title="Infra" value="AWS/GCP · Docker · RTSP" />
          <Tech title="Dashboard" value="React · Tailwind · Recharts" />
        </div>
      </Section>

      <section id="cta" className="max-w-7xl mx-auto px-6 py-16">
        <div className="bg-white text-black rounded-3xl p-10 text-center">
          <p className="text-xs tracking-wide uppercase text-gray-600">Call to Action</p>
          <h2 className="mt-3 text-4xl font-semibold">Ready to Pilot in Hyderabad</h2>
          <p className="mt-3 text-gray-700">30-day pilot, zero upfront cost, measurable outcomes.</p>
          <div className="mt-6 flex justify-center gap-3 flex-wrap">
            <a href="mailto:pilot@lowtraffic.ai" className="px-5 py-2.5 rounded-lg bg-black text-white">Request Your Pilot</a>
            <a href="mailto:pilot@lowtraffic.ai" className="px-5 py-2.5 rounded-lg border border-gray-300">pilot@lowtraffic.ai</a>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-6 text-xs text-gray-500 flex justify-between flex-wrap gap-2">
          <span>© 2026 Low Traffic · lowtraffic.ai</span>
          <span>AI Traffic Management · Hyderabad, India</span>
        </div>
      </footer>
    </div>
  )
}

function Section({ id, title, label, children }: { id: string; title: string; label: string; children: React.ReactNode }) {
  return (
    <section id={id} className="max-w-7xl mx-auto px-6 py-14 border-t border-white/10">
      <p className="text-xs uppercase tracking-[0.2em] text-cyan-400/80">{label}</p>
      <h2 className="mt-3 text-3xl md:text-5xl font-semibold text-white">{title}</h2>
      <div className="mt-6">{children}</div>
    </section>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-[#0f131a] border border-white/10 rounded-xl px-4 py-4">
      <p className="text-2xl font-semibold text-white">{value}</p>
      <p className="text-xs text-gray-400 mt-1">{label}</p>
    </div>
  )
}

function Step({ n, title, text }: { n: string; title: string; text: string }) {
  return (
    <div className="bg-[#0f131a] border border-white/10 rounded-xl p-5">
      <p className="text-xs text-cyan-300">{n}</p>
      <h3 className="text-xl font-semibold mt-2">{title}</h3>
      <p className="text-sm text-gray-400 mt-2">{text}</p>
    </div>
  )
}

function Tech({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-[#0f131a] border border-white/10 rounded-xl p-4">
      <p className="text-xs uppercase tracking-wide text-gray-500">{title}</p>
      <p className="mt-2">{value}</p>
    </div>
  )
}

