import type { SimState } from '../engine/types';
import { useI18n } from '../i18n';

export default function LiveDiagram({ state }: { state: SimState }) {
  const { t } = useI18n();
  const steamOpacity = Math.max(0.2, Math.min(1, state.steam / 95));
  const waterOpacity = Math.max(0.2, Math.min(1, state.feedwaterFlow / 90));
  const turbineSpeed = Math.max(0.25, Math.min(2.2, state.turbineFlow / 45));
  const fault = state.faults.length > 0;
  return (
    <div className="diagram-card">
      <div className="diagram-title-row"><div><span className="eyebrow">{t('flowConcept')}</span><h2>{t('tabDiagram')}</h2></div><span className={`live-pill ${fault ? 'fault-pill' : ''}`}><i />{fault ? t('activeFaults') : t('running')}</span></div>
      <svg className="process-diagram" viewBox="0 0 940 510" role="img" aria-label="Live conceptual BWR process diagram">
        <defs>
          <linearGradient id="reactorFill" x1="0" x2="1"><stop offset="0" stopColor="#16394c"/><stop offset="1" stopColor="#0b1a27"/></linearGradient>
          <linearGradient id="steamLine" x1="0" x2="1"><stop offset="0" stopColor="#55d8e8"/><stop offset="1" stopColor="#b9edff"/></linearGradient>
          <linearGradient id="waterLine" x1="0" x2="1"><stop offset="0" stopColor="#4d97ff"/><stop offset="1" stopColor="#6de0b0"/></linearGradient>
        </defs>
        <g className="diagram-grid">
          {Array.from({ length: 19 }, (_, i) => <line key={`v${i}`} x1={i * 52} x2={i * 52} y1="0" y2="510" />)}
          {Array.from({ length: 11 }, (_, i) => <line key={`h${i}`} x1="0" x2="940" y1={i * 51} y2={i * 51} />)}
        </g>
        <path d="M275 128 H420 Q445 128 445 153 V185 H570" fill="none" stroke="url(#steamLine)" strokeWidth={5 + steamOpacity * 4} opacity={steamOpacity} className="flow-line steam-flow" />
        <path d="M675 235 V344 H500 Q475 344 475 320 V285 H275" fill="none" stroke="url(#waterLine)" strokeWidth={4 + waterOpacity * 3} opacity={waterOpacity} className="flow-line water-flow" />
        <path d="M275 128 H420 Q445 128 445 153 V185 H570" fill="none" stroke="#d8fbff" strokeWidth="1.2" strokeDasharray="8 14" className="flow-dashes" />
        <path d="M675 235 V344 H500 Q475 344 475 320 V285 H275" fill="none" stroke="#a5d2ff" strokeWidth="1.2" strokeDasharray="7 14" className="flow-dashes reverse" />

        <g transform="translate(90 108)">
          <rect width="185" height="206" rx="24" fill="url(#reactorFill)" stroke={state.power > 112 ? '#ff727b' : '#4b91a6'} strokeWidth="2.5" />
          <rect x="13" y="16" width="159" height="174" rx="17" fill="#0b1b28" stroke="#31576b" />
          <path d={`M25 ${166 - Math.min(95, state.water * 1.05)} H160 V173 H25 Z`} fill="#1c83a4" opacity=".58" />
          {Array.from({ length: 7 }, (_, i) => <g key={i}><rect x={38 + i * 18} y="58" width="7" height={72 + (i % 3) * 12} rx="3" fill="#aebfc9" opacity=".8"/><circle cx={41 + i * 18} cy={30 + (i % 2) * 10} r="4" fill="#d4faff" opacity={.3 + state.power / 180} /></g>)}
          <text x="92" y="-18" textAnchor="middle" className="diagram-title">{t('reactorVessel')}</text>
          <text x="92" y="226" textAnchor="middle" className="diagram-subtitle">{t('power')} {state.power.toFixed(0)} · {t('water')} {state.water.toFixed(0)}</text>
        </g>
        <g transform="translate(570 130)">
          <rect width="200" height="105" rx="14" fill="#102333" stroke="#428ca0" strokeWidth="2" />
          <path d="M24 52 H176 M36 32 V72 M58 32 V72 M80 32 V72 M102 32 V72 M124 32 V72" stroke="#4f95a8" strokeWidth="3" />
          <text x="100" y="-17" textAnchor="middle" className="diagram-title">{t('turbineGenerator')}</text>
          <text x="100" y="126" textAnchor="middle" className="diagram-subtitle">{t('grid')} {state.grid.toFixed(0)}</text>
          <g transform="translate(148 52)" style={{ transformOrigin: '148px 52px', animationDuration: `${Math.max(.45, 2.5 / turbineSpeed)}s` }} className="turbine-wheel"><circle r="20" fill="#18394b" stroke="#77b6c6" strokeWidth="2"/>{Array.from({length:6},(_,i)=><path key={i} d="M0 0 L0 -18" stroke="#a9e8f0" strokeWidth="3" transform={`rotate(${i*60})`}/>)}</g>
        </g>
        <g transform="translate(570 342)">
          <rect width="200" height="82" rx="13" fill="#102333" stroke="#367a9d" strokeWidth="2" />
          <path d="M18 25 H182 M18 40 H182 M18 55 H182" stroke="#4f9ec3" strokeWidth="2" />
          <text x="100" y="-15" textAnchor="middle" className="diagram-title">{t('condenserLabel')}</text>
          <text x="100" y="101" textAnchor="middle" className="diagram-subtitle">{t('pressure')} {state.pressure.toFixed(0)}</text>
        </g>
        <g transform="translate(345 302)">
          <circle cx="56" cy="42" r="31" fill="#102a3a" stroke="#65c6d8" strokeWidth="2" />
          <path d="M40 27 L72 42 L40 57 Z" fill="#6dd7e2" />
          <text x="56" y="92" textAnchor="middle" className="diagram-title">{t('feedwaterPump')}</text>
          <text x="56" y="109" textAnchor="middle" className="diagram-subtitle">{state.feedwaterFlow.toFixed(1)} idx</text>
        </g>
        <g transform="translate(42 390)">
          <rect width="240" height="72" rx="10" fill="#0b1b27" stroke="#29495b" />
          <text x="15" y="25" className="diagram-title">{t('liveBalance')}</text>
          <text x="15" y="48" className="diagram-subtitle">Steam {state.steam.toFixed(1)} · Feedwater {state.feedwaterFlow.toFixed(1)}</text>
          <text x="15" y="64" className="diagram-subtitle">Level ind. {state.waterIndicated.toFixed(1)} / inventory {state.water.toFixed(1)}</text>
        </g>
        <g transform="translate(790 265)">
          <rect width="125" height="150" rx="12" fill="#0b1b27" stroke="#31576b"/>
          <text x="62" y="20" textAnchor="middle" className="diagram-title">AUXILIARY</text>
          <circle cx="28" cy="49" r="7" fill={state.systems.pumpAAvailable ? '#6de0b0' : '#ff727b'} />
          <text x="44" y="53" className="diagram-subtitle">RECIRC A</text>
          <circle cx="28" cy="76" r="7" fill={state.systems.pumpBAvailable ? '#6de0b0' : '#ff727b'} />
          <text x="44" y="80" className="diagram-subtitle">RECIRC B</text>
          <circle cx="28" cy="103" r="7" fill={state.systems.msivOpen ? '#6de0b0' : '#ff727b'} />
          <text x="44" y="107" className="diagram-subtitle">MSIV</text>
          <text x="62" y="133" textAnchor="middle" className="diagram-subtitle">Pool {state.systems.suppressionPoolHeat.toFixed(0)}</text>
        </g>
        <text x="465" y="108" textAnchor="middle" className="diagram-flow-label">{t('steamLabel')}</text>
        <text x="463" y="378" textAnchor="middle" className="diagram-flow-label">CONDENSATE / FEEDWATER</text>
        <text x="470" y="488" textAnchor="middle" className="diagram-footnote">{t('diagramHint')}</text>
      </svg>
    </div>
  );
}
