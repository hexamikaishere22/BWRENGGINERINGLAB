import type { HistoryPoint, SimState } from '../engine/types';
import { useI18n } from '../i18n';

const primarySeries = [
  { key: 'power' as const, color: '#55d8e8', label: 'P', max: 160 },
  { key: 'pressure' as const, color: '#ffbf69', label: 'PR', max: 160 },
  { key: 'water' as const, color: '#6de0b0', label: 'W', max: 160 },
  { key: 'thermal' as const, color: '#ff727b', label: 'TH', max: 160 },
  { key: 'grid' as const, color: '#b9a0ff', label: 'G', max: 160 },
];
const slowSeries = [
  { key: 'xenon' as const, color: '#c6a0ff', label: 'Xe-135', max: 1.5 },
  { key: 'boilingMargin' as const, color: '#6de0b0', label: 'M*', max: 100 },
  { key: 'integrity' as const, color: '#ff727b', label: 'FI*', max: 100 },
  { key: 'flowRatio' as const, color: '#55d8e8', label: 'F/P', max: 2 },
];
function polyline(data: HistoryPoint[], key: keyof HistoryPoint, max: number, min = 0) {
  if (data.length < 2) return '';
  return data.map((point, index) => {
    const x = 42 + (index / (data.length - 1)) * 690;
    const value = Math.max(min, Math.min(max, Number(point[key])));
    const y = 190 - ((value - min) / (max - min)) * 160;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}
function Chart({ data, series, label }: { data: HistoryPoint[]; series: typeof primarySeries | typeof slowSeries; label: string }) {
  return <svg className="trend-chart" viewBox="0 0 760 230" role="img" aria-label={label}>
    {Array.from({ length: 5 }, (_, i) => <g key={i}><line x1="42" x2="732" y1={30 + i * 40} y2={30 + i * 40} stroke="#233f50" strokeDasharray="3 5"/><text x="8" y={34 + i * 40} fill="#68899b" fontSize="10">{4 - i}</text></g>)}
    {series.map((entry) => <polyline key={entry.key} points={polyline(data, entry.key, entry.max)} fill="none" stroke={entry.color} strokeWidth="2.1" strokeLinejoin="round" strokeLinecap="round" />)}
    <text x="42" y="216" fill="#68899b" fontSize="10">0</text><text x="732" y="216" textAnchor="end" fill="#68899b" fontSize="10">{data[data.length - 1]?.time.toFixed(0) ?? 0} s</text>
  </svg>;
}

export default function TrendPanel({ state }: { state: SimState }) {
  const { t, language } = useI18n();
  const data = state.history;
  return <div className="trend-panel-stack">
    <div className="trend-card">
      <div className="panel-heading"><div><span className="eyebrow">{language === 'id' ? 'HISTORIAN / BUFFER 180 TITIK' : 'HISTORIAN / 180 POINT RING BUFFER'}</span><h2>{t('tabTrends')} · {language === 'id' ? 'proses utama' : 'main process'}</h2></div><span className="point-count">{data.length} pts</span></div>
      <Chart data={data} series={primarySeries} label="Live process trend chart"/>
      <div className="trend-legend">{primarySeries.map((entry) => <span key={entry.key}><i style={{ background: entry.color }} />{entry.label}: {Number(state[entry.key]).toFixed(1)}</span>)}</div>
    </div>
    <div className="trend-card">
      <div className="panel-heading"><div><span className="eyebrow">{language === 'id' ? 'DINAMIKA LAMBAT / PROXY' : 'SLOW DYNAMICS / PROXIES'}</span><h2>{language === 'id' ? 'Xenon · margin · integritas · aliran' : 'Xenon · margin · integrity · flow'}</h2></div></div>
      <Chart data={data} series={slowSeries} label="Live slow transient indicators"/>
      <div className="trend-legend">{slowSeries.map((entry) => { const values = { xenon: state.xenon135, boilingMargin: state.boilingMargin, integrity: state.fuelIntegrity, flowRatio: state.flowRatio }; return <span key={entry.key}><i style={{ background: entry.color }} />{entry.label}: {Number(values[entry.key]).toFixed(2)}</span>; })}</div>
      <p className="muted-note">{language === 'id' ? '*M* dan FI* adalah indeks game, bukan MCPR atau kondisi bahan bakar aktual. Histori menyimpan maksimal 180 titik.' : '*M* and FI* are game indices, not MCPR or actual fuel condition. History stores at most 180 points.'}</p>
    </div>
    <p className="muted-note">{t('trendsHint')}</p>
  </div>;
}
