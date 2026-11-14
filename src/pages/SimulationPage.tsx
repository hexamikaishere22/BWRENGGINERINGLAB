import { useEffect, useMemo, useRef, useState } from 'react';
import LiveDiagram from '../components/LiveDiagram';
import TrendPanel from '../components/TrendPanel';
import { addChallenge } from '../engine/challenge';
import {
  acknowledgeAlarm, acknowledgeAllAlarms, applyControl, applyRodGroupControl,
  createColdShutdownState, createInitialState, exportCsv, formatTime, getAlarmEntries,
  getAlarmKeys, getReadings, queueSystemAction, resetScramForTraining, setStartupCheck, severityLabel,
  tickModel, triggerScram,
} from '../engine/model';
import { createSessionPdf } from '../engine/reportPdf';
import type { ChallengeMode, Difficulty, RodGroup, SimState, SystemActionKey } from '../engine/types';
import { useI18n } from '../i18n';

type Tab = 'overview' | 'diagram' | 'trends' | 'challenges' | 'systems' | 'instructor';
type ControlKey = keyof SimState['controls'];
const initial = createInitialState(310031, 'standard', 'operator');
const faultKinds = ['feedwater', 'circulation', 'condenser', 'load', 'sensor', 'heater', 'stuck-rod', 'pump-a', 'pump-b', 'offsite-power', 'msiv', 'instrument-freeze', 'instrument-bias', 'slow-leak', 'suppression-load'] as const;
const rodGroups: RodGroup[] = ['A', 'B', 'C', 'D'];

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function safeName(value: string) { return value.replace(/[^a-z0-9_-]/gi, '-').replace(/-+/g, '-').slice(0, 48); }

function Metric({ label, value, unit = 'idx', tone = 'cyan' }: { label: string; value: number; unit?: string; tone?: string }) {
  return <article className={`metric-card tone-${tone}`}><span>{label}</span><strong>{value.toFixed(1)}<small>{unit}</small></strong><div className="metric-track"><i style={{ width: `${Math.max(0, Math.min(100, value / 160 * 100))}%` }} /></div></article>;
}
function Slider({ label, value, disabled, onChange, hint }: { label: string; value: number; disabled?: boolean; onChange: (value: number) => void; hint?: string }) {
  return <label className="control-row"><span className="control-label">{label}<output>{Math.round(value)}%</output></span><input type="range" min="0" max="100" step="1" value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} /><small>{hint}</small></label>;
}

export default function SimulationPage() {
  const { language, t } = useI18n();
  const stateRef = useRef<SimState>(initial);
  const [state, setState] = useState<SimState>(initial);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [mode, setMode] = useState<ChallengeMode>('standard');
  const [difficulty, setDifficulty] = useState<Difficulty>('operator');
  const [seedInput, setSeedInput] = useState('310031');
  const [tab, setTab] = useState<Tab>('overview');
  const [notice, setNotice] = useState('');
  const lastPaintRef = useRef(0);
  const isId = language === 'id';

  useEffect(() => {
    const lowPower = ((navigator.hardwareConcurrency || 8) <= 4) || Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory || 8) <= 4;
    const tickMs = lowPower ? 180 : 120;
    const stepCount = lowPower ? 2 : 3;
    const timer = window.setInterval(() => {
      if (pausedRef.current || stateRef.current.status !== 'running') return;
      let next = stateRef.current;
      for (let index = 0; index < stepCount; index += 1) next = tickModel(next, 0.1);
      stateRef.current = next;
      const now = performance.now();
      if (now - lastPaintRef.current >= 280 || next.status !== 'running') {
        lastPaintRef.current = now;
        setState(next);
      }
    }, tickMs);
    return () => window.clearInterval(timer);
  }, []);

  const readings = useMemo(() => getReadings(state), [state]);
  const alarms = useMemo(() => getAlarmKeys(state), [state]);
  const alarmEntries = useMemo(() => getAlarmEntries(state), [state]);
  const isCritical = alarmEntries.some((entry) => entry.priority === 'critical');
  const statusLabel = state.status === 'failed' ? t('failed') : paused ? t('paused') : isCritical ? t('critical') : alarms.length ? t('warning') : t('normal');
  const currentPending = state.pendingActions.map((item) => item.key);

  const setPause = (value: boolean) => { pausedRef.current = value; setPaused(value); };
  const commit = (next: SimState) => { stateRef.current = next; setState(next); };
  const startSession = (nextMode = mode, nextSeed = seedInput, nextDifficulty = difficulty, coldStart = false) => {
    const parsed = Number.parseInt(nextSeed, 10);
    const seed = Number.isFinite(parsed) ? (parsed >>> 0) : Math.floor(Math.random() * 0xffffffff);
    const next = coldStart
      ? createColdShutdownState(seed, nextMode, nextDifficulty)
      : createInitialState(seed, nextMode, nextDifficulty);
    commit(next);
    setSeedInput(String(seed)); setMode(nextMode); setDifficulty(nextDifficulty);
    setPause(false); setNotice('');
  };
  const updateControl = (key: ControlKey, value: number) => commit(applyControl(stateRef.current, key, value));
  const updateRodGroup = (group: RodGroup, value: number) => commit(applyRodGroupControl(stateRef.current, group, value));
  const updateSystem = (key: SystemActionKey) => {
    const current = stateRef.current.systems[key];
    if (typeof current !== 'boolean') return;
    const next = queueSystemAction(stateRef.current, key, !current);
    commit(next);
    if (next.events[next.events.length - 1]?.key.startsWith('action-blocked')) {
      setNotice(isId ? 'Aksi diblokir oleh interlock abstrak pada model.' : 'Action blocked by the model’s abstract interlock.');
    }
  };
  const togglePause = () => setPause(!paused);
  const doScram = () => commit(triggerScram(stateRef.current));
  const forceChallenge = () => {
    const challenged = addChallenge(stateRef.current);
    commit({ ...challenged, nextChallengeAt: Math.max(challenged.nextChallengeAt, challenged.elapsed + 20) });
  };
  const ackAlarm = (key: string) => commit(acknowledgeAlarm(stateRef.current, key));
  const ackAll = () => commit(acknowledgeAllAlarms(stateRef.current));
  const updateStartupCheck = (index: number, checked: boolean) => commit(setStartupCheck(stateRef.current, index, checked));

  const eventText = (key: string) => {
    if (key.startsWith('challenge-')) return `${t('challengeInfo')}: ${t(`fault-${key.slice(10)}`)}`;
    if (key.startsWith('recovered-')) return `${t('recovered')}: ${t(`fault-${key.slice(10)}`)}`;
    if (key.startsWith('action-')) return isId ? `Perubahan sistem: ${key.replace(/-/g, ' ')}` : `System transition: ${key.replace(/-/g, ' ')}`;
    if (key.startsWith('startup-stage-')) return isId ? `Tahap start-up: ${key.slice(14)}` : `Start-up stage: ${key.slice(14)}`;
    return t(key);
  };
  const exportPdf = () => {
    downloadBlob(createSessionPdf(stateRef.current, language), `bwr-session-${safeName(formatTime(stateRef.current.elapsed))}.pdf`);
    setNotice(t('pdfReady'));
  };
  const exportHistory = () => downloadBlob(new Blob([exportCsv(stateRef.current)], { type: 'text/csv;charset=utf-8' }), 'bwr-session-history.csv');
  const exportSession = () => downloadBlob(new Blob([JSON.stringify(stateRef.current, null, 2)], { type: 'application/json;charset=utf-8' }), 'bwr-session-data.json');

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'overview', label: t('tabOverview'), icon: '◫' }, { id: 'diagram', label: t('tabDiagram'), icon: '⌘' },
    { id: 'trends', label: t('tabTrends'), icon: '⌁' }, { id: 'challenges', label: t('tabChallenges'), icon: '✣' },
    { id: 'systems', label: isId ? 'Sistem & instrumen' : 'Systems & I&C', icon: '⚙' },
    { id: 'instructor', label: t('tabInstructor'), icon: '▤' },
  ];

  const systemLabels: Record<SystemActionKey, string> = isId ? {
    offsitePower: 'Daya eksternal', dieselAvailable: 'Generator diesel', feedwaterAuto: 'Feedwater otomatis',
    feedwaterHeater: 'Pemanas feedwater', msivOpen: 'MSIV terbuka', pumpAAvailable: 'Pompa resirkulasi A',
    pumpBAvailable: 'Pompa resirkulasi B', hpi: 'Injeksi tekanan tinggi (model)', lpi: 'Injeksi tekanan rendah (model)',
    rhr: 'Residual heat removal (model)', ads: 'Depresurisasi otomatis (model)', boron: 'Injeksi boron (model)',
  } : {
    offsitePower: 'Offsite power', dieselAvailable: 'Diesel generator', feedwaterAuto: 'Feedwater auto',
    feedwaterHeater: 'Feedwater heater', msivOpen: 'MSIV open', pumpAAvailable: 'Recirculation pump A',
    pumpBAvailable: 'Recirculation pump B', hpi: 'High-pressure injection (model)', lpi: 'Low-pressure injection (model)',
    rhr: 'Residual heat removal (model)', ads: 'Automatic depressurization (model)', boron: 'Boron injection (model)',
  };

  const systemButton = (key: SystemActionKey, hint: string) => {
    const value = state.systems[key];
    const pending = currentPending.includes(key);
    return <button key={key} className={`system-toggle ${value ? 'is-on' : 'is-off'} ${pending ? 'is-pending' : ''}`} onClick={() => updateSystem(key)} disabled={state.status !== 'running' || pending}>
      <span className="system-switch-indicator"/><span className="system-toggle-copy"><b>{systemLabels[key]}</b><small>{pending ? (isId ? 'Perubahan tertunda…' : 'Transition pending…') : hint}</small></span><strong>{pending ? '…' : value ? (isId ? 'AKTIF' : 'ON') : (isId ? 'MATI' : 'OFF')}</strong>
    </button>;
  };

  const startupLabels = isId
    ? ['Tinjau indikasi instrumen dan konsistensinya', 'Tinjau ketersediaan sistem dan sumber listrik', 'Amati tren termal dan respons lambat model', 'Evaluasi kestabilan sebelum berpindah tahap']
    : ['Review instrument indications and consistency', 'Review system availability and electrical sources', 'Observe thermal trends and slow model response', 'Evaluate stability before moving to the next stage'];
  const startupStageLabel: Record<string, string> = isId
    ? { 'cold-shutdown': 'Cold shutdown', 'system-review': 'Tinjauan sistem', 'thermal-conditioning': 'Kondisioning termal', 'low-power-review': 'Tinjauan daya rendah', 'generation-review': 'Tinjauan pembangkitan', generation: 'Pembangkitan' }
    : { 'cold-shutdown': 'Cold shutdown', 'system-review': 'System review', 'thermal-conditioning': 'Thermal conditioning', 'low-power-review': 'Low-power review', 'generation-review': 'Generation review', generation: 'Generation' };

  return (
    <section className="simulation-page">
      <div className="page-heading simulation-heading">
        <div><div className="eyebrow"><span className="live-dot" /> {t('simulationEyebrow')}</div><h1>{t('simulationTitle')}</h1><p>{t('simulationIntro')}</p></div>
        <div className={`engine-status ${state.status === 'failed' ? 'engine-failed' : ''}`}><span>{t('status')}</span><strong>v3.2</strong><small>{statusLabel} · {formatTime(state.elapsed)} · {state.plantHours.toFixed(1)} {isId ? 'jam simulasi' : 'sim h'}</small></div>
      </div>

      <div className="sim-toolbar sim-toolbar-wrap">
        <label className="mode-select"><span>{t('mode')}</span><select value={mode} onChange={(event) => startSession(event.target.value as ChallengeMode)}><option value="standard">{isId ? 'Dinamis lambat' : 'Slow dynamic'}</option><option value="compound">{t('modeCompound')}</option><option value="deception">{t('modeDeception')}</option><option value="slow-drift">{isId ? 'Drift bertahap' : 'Gradual drift'}</option><option value="master">{isId ? 'Master / gangguan majemuk' : 'Master / compound'}</option></select></label>
        <label className="mode-select"><span>{isId ? 'Kesulitan' : 'Difficulty'}</span><select value={difficulty} onChange={(event) => startSession(mode, seedInput, event.target.value as Difficulty)}><option value="cadet">{isId ? '1 · Kadet' : '1 · Cadet'}</option><option value="operator">{isId ? '2 · Operator' : '2 · Operator'}</option><option value="senior">{isId ? '3 · Senior' : '3 · Senior'}</option><option value="expert">{isId ? '4 · Ahli' : '4 · Expert'}</option><option value="master">{isId ? '5 · Master' : '5 · Master'}</option></select></label>
        <div className="toolbar-actions">
          <button className="quiet-button" onClick={togglePause} disabled={state.status !== 'running'}>{paused ? '▶' : 'Ⅱ'} {paused ? t('resume') : t('pause')}</button>
          <button className="quiet-button" onClick={() => startSession(mode, String(state.seed))}>↻ {t('reset')}</button>
          <button className="quiet-button" onClick={() => startSession(mode, String(state.seed), difficulty, true)}>{isId ? 'Mulai cold shutdown' : 'Start cold shutdown'}</button>
          <button className="danger-button" onClick={doScram} disabled={state.scram || state.status !== 'running'}>■ {t('scram')}</button>
          <button className="quiet-button" onClick={() => commit(resetScramForTraining(stateRef.current))} disabled={!state.scram || state.power > 4 || state.status !== 'running'}>{isId ? 'Reset latch latihan' : 'Training latch reset'}</button>
          <button className="primary-button" onClick={() => startSession()}>{t('startNew')}</button>
        </div>
      </div>

      <div className="sim-tabbar" role="tablist" aria-label="Simulation modules">
        {tabs.map((item) => <button key={item.id} role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'selected' : ''} onClick={() => setTab(item.id)}><span>{item.icon}</span>{item.label}</button>)}
      </div>

      {state.status === 'failed' && <div className="failure-banner"><div><strong>{t('failureTitle')}</strong><p>{t(state.failureKey ?? 'failure-power')}</p><small>{t('failureContinue')}</small></div><button className="primary-button" onClick={() => startSession()}>{t('startNew')}</button></div>}
      {notice && <div className="notice-banner" role="status"><span>{notice}</span><button onClick={() => setNotice('')}>×</button></div>}

      {tab === 'overview' && <>
        <div className="metrics-grid">
          <Metric label={t('power')} value={readings.power} tone="cyan"/><Metric label={t('pressure')} value={readings.pressure} tone="amber"/><Metric label={isId ? 'Level indikasi' : 'Indicated level'} value={readings.water} tone="green"/><Metric label={t('thermal')} value={readings.thermal} tone="red"/><Metric label={t('grid')} value={readings.grid} tone="purple"/>
        </div>
        <div className="advanced-metrics-grid">
          <Metric label="Xe-135" value={state.xenon135} unit="idx" tone="purple"/><Metric label={isId ? 'Periode model' : 'Model period'} value={Math.min(999, Math.abs(state.periodSeconds))} unit="s*" tone="amber"/><Metric label={isId ? 'Rasio aliran/daya' : 'Flow/power ratio'} value={state.flowRatio} tone="cyan"/><Metric label={isId ? 'Margin didih proxy' : 'Boiling margin proxy'} value={state.boilingMargin} tone="green"/><Metric label={isId ? 'Integritas bahan bakar' : 'Fuel integrity'} value={state.fuelIntegrity} unit="%*" tone="red"/>
        </div>
        <div className="sim-content-grid">
          <div className="sim-panel controls-panel">
            <div className="panel-heading"><div><span className="eyebrow">{t('inputControl')}</span><h2>{t('controls')}</h2></div><span className="time-chip">{formatTime(state.elapsed)}</span></div>
            <Slider label={t('rods')} value={state.controls.rods} disabled={state.scram || state.status !== 'running'} onChange={(value) => updateControl('rods', value)} hint={t('rodsHint')}/>
            <Slider label={isId ? 'Resirkulasi A' : 'Recirculation A'} value={state.controls.recircA} disabled={state.status !== 'running'} onChange={(value) => updateControl('recircA', value)} hint={isId ? 'Pompa A dikendalikan terpisah pada tab Sistem.' : 'Pump A is independently controlled on the Systems tab.'}/>
            <Slider label={isId ? 'Resirkulasi B' : 'Recirculation B'} value={state.controls.recircB} disabled={state.status !== 'running'} onChange={(value) => updateControl('recircB', value)} hint={isId ? 'Pompa B dikendalikan terpisah pada tab Sistem.' : 'Pump B is independently controlled on the Systems tab.'}/>
            <Slider label={t('feedwaterControl')} value={state.controls.feedwater} disabled={state.systems.feedwaterAuto || state.status !== 'running'} onChange={(value) => updateControl('feedwater', value)} hint={isId ? 'Terkunci saat kontrol otomatis aktif.' : 'Locked while automatic control is enabled.'}/>
            <Slider label={isId ? 'Indeks suhu feedwater' : 'Feedwater temperature index'} value={state.controls.feedwaterTemp} disabled={!state.systems.feedwaterHeater || state.status !== 'running'} onChange={(value) => updateControl('feedwaterTemp', value)} hint={isId ? 'Gangguan pemanas dapat membuat nilai aktual berbeda.' : 'Heater faults may cause actual temperature to differ.'}/>
            <Slider label={t('turbineControl')} value={state.controls.turbine} disabled={state.status !== 'running'} onChange={(value) => updateControl('turbine', value)} hint={t('turbineHint')}/>
            <div className="control-foot"><span>{t('score')}: <b>{state.score}</b></span><span>{t('stable')}: <b>{formatTime(state.stableSeconds)}</b></span></div>
          </div>
          <div className="sim-side-stack">
            <section className="sim-panel"><div className="panel-heading"><div><span className="eyebrow">{t('monitoring')}</span><h2>{isId ? 'Annunciator alarm' : 'Alarm annunciator'}</h2></div><span className={`alarm-count ${alarms.length ? 'has-alarm' : ''}`}>{alarms.length}</span></div>
              {alarms.length ? <><div className="alarm-list">{alarmEntries.map((entry) => <div key={entry.key} className={`alarm-item ${entry.acknowledged ? 'is-acknowledged' : ''}`}><i/><span>{t(entry.key)}</span><small>{entry.acknowledged ? 'ACK' : 'UNACK'}</small><button className="ack-button" onClick={() => ackAlarm(entry.key)} disabled={entry.acknowledged}>{isId ? 'ACK' : 'ACK'}</button></div>)}</div><button className="quiet-button ack-all" onClick={ackAll}>{isId ? 'Acknowledge semua alarm' : 'Acknowledge all alarms'}</button></> : <p className="empty-state">✓ {t('noAlarms')}</p>}
            </section>
            <section className="sim-panel"><div className="panel-heading"><div><span className="eyebrow">{t('eventStream')}</span><h2>{t('events')}</h2></div></div>
              <div className="event-list">{state.events.slice(-8).reverse().map((event, index) => <div key={`${event.time}-${event.key}-${index}`}><time>{formatTime(event.time)}</time><span>{eventText(event.key)}</span></div>)}</div>
              {!state.events.length && <p className="empty-state">{t('noEvents')}</p>}
            </section>
          </div>
        </div>
        <div className="systems-insight-grid">
          <section className="sim-panel"><div className="eyebrow">{isId ? 'INDIKASI YANG TIDAK SELALU SEJALAN' : 'INDICATIONS MAY DISAGREE'}</div><h2>{isId ? 'Inventori vs level terindikasi' : 'Inventory vs indicated level'}</h2><div className="reading-rows"><div><span>{isId ? 'Inventori model tersembunyi' : 'Hidden model inventory'}</span><b>{state.water.toFixed(1)}</b></div><div><span>{isId ? 'Level pada panel instrumen' : 'Instrument panel level'}</span><b>{readings.water.toFixed(1)}</b></div><div><span>{isId ? 'Perbedaan indikasi' : 'Indication difference'}</span><b>{(readings.water - state.water).toFixed(1)}</b></div><div><span>{isId ? 'Void fraction proxy' : 'Void fraction proxy'}</span><b>{state.voidFraction.toFixed(2)}</b></div></div><p className="muted-note">{isId ? 'Swell indikasi dibuat sebagai proxy: perubahan tekanan dapat mengubah pembacaan level tanpa perubahan inventori yang sebanding.' : 'Indication swell is a proxy: pressure changes can alter indicated level without a corresponding inventory change.'}</p></section>
          <section className="sim-panel"><div className="eyebrow">{isId ? 'HASIL BERTINGKAT' : 'GRADUATED CONSEQUENCE'}</div><h2>{isId ? 'Profil konsekuensi edukatif' : 'Educational consequence profile'}</h2><div className="severity-score">{state.severityTier}<small>/5</small></div><strong>{severityLabel(state.severityTier, language)}</strong><div className="reading-rows"><div><span>{isId ? 'Paparan batas kumulatif' : 'Cumulative limit exposure'}</span><b>{state.cumulativeLimitExposure.toFixed(1)} s*</b></div><div><span>{isId ? 'Indikasi kebocoran bahan bakar' : 'Fuel leakage indication'}</span><b>{state.fuelLeakIndex.toFixed(1)}</b></div><div><span>{isId ? 'Indeks kerusakan model' : 'Model damage index'}</span><b>{state.damageIndex.toFixed(1)}</b></div></div><p className="muted-note">{isId ? 'Bukan klasifikasi INES. INES adalah skala komunikasi kejadian nuklir/radiologi, bukan skor permainan atau panduan respons.' : 'Not an INES rating. INES communicates nuclear/radiological event significance; it is not a game score or response guide.'}</p></section>
        </div>
        {state.startupStage !== 'generation' && <section className="sim-panel startup-panel"><div className="eyebrow">{isId ? 'SKENARIO START-UP EDUKATIF' : 'EDUCATIONAL START-UP SCENARIO'}</div><h2>{startupStageLabel[state.startupStage]}</h2><p>{isId ? 'Checklist ini menguji pengamatan dan pemahaman konseptual. Urutannya bukan prosedur start-up pembangkit.' : 'This checklist tests observation and conceptual understanding. It is not a plant start-up procedure.'}</p><div className="startup-checks">{startupLabels.map((label, index) => <label key={label}><input type="checkbox" checked={state.startupChecks[index]} onChange={(event) => updateStartupCheck(index, event.target.checked)}/><span>{label}</span></label>)}</div></section>}
        <div className="sim-footer-grid"><div className="sim-panel challenge-mini"><div><span className="eyebrow">{t('challengeDirector')}</span><h2>{t('challengeInfo')}</h2><p>{isId ? 'Kesulitan lebih tinggi menambah drift lambat, gangguan majemuk, sensor tidak andal, dan respons sistem yang tertunda.' : 'Higher difficulty adds slow drift, compound faults, unreliable sensors, and delayed system response.'}</p></div><div className="mini-stats"><span>{t('seed')}<b>{state.seed}</b></span><span>{t('activeFaults')}<b>{state.faults.length}</b></span></div></div><div className="sim-panel export-panel"><div><span className="eyebrow">{t('sessionOutput')}</span><h2>{t('exportTitle')}</h2><p>PDF, CSV, JSON</p></div><div className="export-buttons"><button className="primary-button" onClick={exportPdf}>↓ {t('exportPdf')}</button><button className="quiet-button" onClick={exportHistory}>{t('exportCsv')}</button><button className="quiet-button" onClick={exportSession}>{t('exportJson')}</button></div></div></div>
      </>}

      {tab === 'diagram' && <div className="diagram-layout"><LiveDiagram state={state}/><div className="sim-panel diagram-readings"><span className="eyebrow">{t('liveValues')}</span><h2>{t('tabOverview')}</h2><div className="reading-rows"><div><span>{t('steam')}</span><b>{state.steam.toFixed(1)}</b></div><div><span>{t('feedwater')}</span><b>{state.feedwaterFlow.toFixed(1)}</b></div><div><span>{t('turbine')}</span><b>{state.turbineFlow.toFixed(1)}</b></div><div><span>{isId ? 'Pompa resirkulasi A/B' : 'Recirculation pumps A/B'}</span><b>{state.systems.pumpAAvailable ? 'A ON' : 'A OFF'} / {state.systems.pumpBAvailable ? 'B ON' : 'B OFF'}</b></div><div><span>{isId ? 'MSIV' : 'MSIV'}</span><b>{state.systems.msivOpen ? 'OPEN' : 'CLOSED'}</b></div><div><span>{t('grid')}</span><b>{state.grid.toFixed(1)}</b></div></div><p className="muted-note">{t('diagramHint')}</p></div></div>}

      {tab === 'trends' && <><TrendPanel state={state}/><section className="sim-panel advanced-trend-note"><div className="eyebrow">{isId ? 'TREN TAMBAHAN' : 'ADDITIONAL TRENDS'}</div><div className="reading-rows"><div><span>Xe-135 / iodine-135</span><b>{state.xenon135.toFixed(3)} / {state.iodine135.toFixed(3)}</b></div><div><span>{isId ? 'Periode reaktor proxy' : 'Reactor period proxy'}</span><b>{state.periodSeconds.toFixed(1)} s*</b></div><div><span>{isId ? 'Rasio aliran/daya' : 'Flow/power ratio'}</span><b>{state.flowRatio.toFixed(2)}</b></div><div><span>{isId ? 'Margin didih proxy' : 'Boiling margin proxy'}</span><b>{state.boilingMargin.toFixed(1)}</b></div></div></section><div className="export-strip"><button className="primary-button" onClick={exportPdf}>↓ {t('exportPdf')}</button><button className="quiet-button" onClick={exportHistory}>{t('exportCsv')}</button><button className="quiet-button" onClick={exportSession}>{t('exportJson')}</button></div></>}

      {tab === 'challenges' && <div className="challenge-page-grid"><section className="sim-panel"><div className="eyebrow">CHALLENGE ENGINE / V3.2</div><h2>{t('challengeInfo')}</h2><p>{isId ? 'Fokus tantangan bukan ledakan mendadak. Gangguan berkembang pelan, beberapa instrumen dapat tidak sepakat, informasi dapat tertunda, dan satu aksi dapat memiliki efek samping pada subsistem lain.' : 'Challenges are not centered on sudden explosions. Faults develop gradually, instruments can disagree, information can be delayed, and one action can affect other subsystems.'}</p><div className="mode-cards"><button className={mode === 'standard' ? 'active' : ''} onClick={() => startSession('standard')}><b>{isId ? 'Dinamis lambat' : 'Slow dynamic'}</b><span>{isId ? 'Satu gangguan utama dengan drift dan jeda.' : 'One primary event with drift and delay.'}</span></button><button className={mode === 'compound' ? 'active' : ''} onClick={() => startSession('compound')}><b>{t('modeCompound')}</b><span>{isId ? 'Beberapa gangguan yang saling memengaruhi.' : 'Multiple interacting disturbances.'}</span></button><button className={mode === 'deception' ? 'active' : ''} onClick={() => startSession('deception')}><b>{t('modeDeception')}</b><span>{isId ? 'Indikasi sensor dapat macet atau bergeser.' : 'Sensors may freeze or drift.'}</span></button><button className={mode === 'slow-drift' ? 'active' : ''} onClick={() => startSession('slow-drift')}><b>{isId ? 'Drift bertahap' : 'Gradual drift'}</b><span>{isId ? 'Kebocoran dan degradasi berlangsung perlahan.' : 'Leakage and degradation evolve slowly.'}</span></button><button className={mode === 'master' ? 'active' : ''} onClick={() => startSession('master')}><b>Master</b><span>{isId ? 'Gangguan majemuk, ketidakpastian, dan tekanan keputusan.' : 'Compound faults, uncertainty, and decision pressure.'}</span></button></div><button className="quiet-button challenge-inject" onClick={forceChallenge} disabled={state.status !== 'running'}>＋ {isId ? 'Picu gangguan sintetis' : 'Inject a synthetic disturbance'}</button></section><section className="sim-panel"><div className="eyebrow">{t('faultCatalog')}</div><h2>{isId ? 'Katalog gangguan' : 'Fault catalog'}</h2><div className="fault-catalog">{faultKinds.map((kind) => <div key={kind}><span className="fault-bullet"/><div><b>{t(`fault-${kind}`)}</b><small>{isId ? 'Gangguan permainan sintetis; bukan prosedur atau mekanisme proteksi fasilitas.' : 'Synthetic game disturbance; not a facility procedure or protection function.'}</small></div><em>{state.faults.some((fault) => fault.kind === kind) ? t('active') : '—'}</em></div>)}</div></section></div>}

      {tab === 'systems' && <div className="systems-page-grid">
        <section className="sim-panel"><div className="eyebrow">{isId ? 'DISTRIBUSI DAYA & ISOLASI' : 'POWER DISTRIBUTION & ISOLATION'}</div><h2>{isId ? 'Sumber listrik dan jalur uap' : 'Electrical sources and steam path'}</h2><div className="system-toggle-grid">
          {systemButton('offsitePower', isId ? 'Sumber jaringan eksternal simulasi' : 'Simulated external grid source')}
          {systemButton('dieselAvailable', isId ? 'Sumber cadangan; aktivasi memiliki jeda' : 'Backup source; activation is delayed')}
          {systemButton('msivOpen', isId ? 'Isolasi jalur uap utama (MSIV)' : 'Main steam isolation (MSIV)')}
          {systemButton('feedwaterHeater', isId ? 'Mengubah respons suhu feedwater' : 'Affects feedwater temperature response')}
          {systemButton('feedwaterAuto', isId ? 'Kontrol otomatis; dapat terganggu' : 'Automatic control; may be degraded')}
          {systemButton('pumpAAvailable', isId ? 'Ketersediaan pompa A' : 'Pump A availability')}
          {systemButton('pumpBAvailable', isId ? 'Ketersediaan pompa B' : 'Pump B availability')}
        </div><div className="systems-readout"><span>{isId ? 'Status bus daya' : 'Power bus status'}</span><b>{state.systems.offsitePower || state.systems.dieselAvailable ? (isId ? 'TERSEDIA' : 'AVAILABLE') : (isId ? 'TIDAK TERSEDIA' : 'UNAVAILABLE')}</b></div></section>
        <section className="sim-panel"><div className="eyebrow">{isId ? 'SISTEM PENDUKUNG DARURAT' : 'EMERGENCY SUPPORT SYSTEMS'}</div><h2>{isId ? 'Subsistem konseptual' : 'Conceptual subsystems'}</h2><div className="system-toggle-grid">
          {systemButton('hpi', isId ? 'Injeksi tekanan tinggi: efek inventori model' : 'High-pressure injection: model inventory effect')}
          {systemButton('lpi', isId ? 'Injeksi tekanan rendah: efek inventori model' : 'Low-pressure injection: model inventory effect')}
          {systemButton('rhr', isId ? 'Pembuangan panas residual dan kolam' : 'Residual heat and pool heat-removal proxy')}
          {systemButton('ads', isId ? 'Penurunan indeks tekanan; level indikasi dapat swell' : 'Pressure-index reduction; indicated level may swell')}
          {systemButton('boron', isId ? 'Efek reaktivitas negatif lambat' : 'Slow negative-reactivity effect')}
        </div><p className="muted-note">{isId ? 'Nama sistem merujuk konsep umum. Dinamika, interlock, dan pengaruhnya disederhanakan serta tidak cocok untuk keputusan operasi.' : 'System names refer to general concepts. Dynamics, interlocks, and effects are simplified and are not suitable for operating decisions.'}</p></section>
        <section className="sim-panel"><div className="eyebrow">{isId ? 'KELOMPOK BATANG KENDALI' : 'CONTROL ROD GROUPS'}</div><h2>{isId ? 'Perintah grup A–D' : 'Group A–D commands'}</h2>{rodGroups.map((group) => <Slider key={group} label={`${isId ? 'Grup' : 'Group'} ${group}`} value={state.rodGroups[group].target} disabled={state.scram || state.status !== 'running' || state.rodGroups[group].stuck} onChange={(value) => updateRodGroup(group, value)} hint={`${isId ? 'Posisi model aktual' : 'Model actual position'}: ${state.rodGroups[group].actual.toFixed(1)} · ${state.rodGroups[group].stuck ? (isId ? 'MACET' : 'STUCK') : (isId ? 'Mengikuti perintah dengan jeda' : 'Follows command with delay')}`}/>)}</section>
        <section className="sim-panel"><div className="eyebrow">{isId ? 'TINDAKAN TERTUNDA' : 'PENDING ACTIONS'}</div><h2>{isId ? 'Antrean transisi' : 'Transition queue'}</h2>{state.pendingActions.length ? state.pendingActions.map((action) => <div className="pending-action" key={action.key}><b>{systemLabels[action.key]}</b><span>{Math.max(0, action.completeAt - state.elapsed).toFixed(1)} s*</span></div>) : <p className="empty-state">{isId ? 'Tidak ada transisi tertunda.' : 'No pending transitions.'}</p>}<p className="muted-note">{isId ? 'Sebagian aksi diberi jeda dan interlock bus listrik abstrak. Ini adalah mekanik game, bukan representasi logika proteksi pabrikan.' : 'Some actions are delayed and subject to an abstract electrical-bus interlock. This is game logic, not vendor protection logic.'}</p></section>
      </div>}

      {tab === 'instructor' && <div className="instructor-grid"><section className="sim-panel"><div className="eyebrow">{t('reproducibility')}</div><h2>{t('instructorTitle')}</h2><p>{t('instructorText')}</p><label className="seed-editor"><span>{t('seedLabel')}</span><input type="number" value={seedInput} onChange={(event) => setSeedInput(event.target.value)} /><button className="primary-button" onClick={() => startSession(mode, seedInput)}>{t('applySeed')}</button></label><div className="seed-current"><span>{t('seed')}</span><b>{state.seed}</b></div></section><section className="sim-panel"><div className="eyebrow">{t('sessionSummary')}</div><h2>{t('score')}</h2><div className="summary-score">{state.score}</div><div className="reading-rows"><div><span>{t('elapsed')}</span><b>{formatTime(state.elapsed)}</b></div><div><span>{t('stable')}</span><b>{formatTime(state.stableSeconds)}</b></div><div><span>{t('activeFaults')}</span><b>{state.faults.length}</b></div><div><span>{isId ? 'Kesulitan' : 'Difficulty'}</span><b>{difficulty}</b></div><div><span>{isId ? 'SCRAM tidak perlu' : 'Unnecessary SCRAM'}</span><b>{state.unnecessaryScrams}</b></div><div><span>{isId ? 'Pelanggaran kumulatif' : 'Cumulative breaches'}</span><b>{state.operatingLimitBreaches}</b></div></div><div className="export-buttons"><button className="primary-button" onClick={exportPdf}>↓ {t('exportPdf')}</button><button className="quiet-button" onClick={exportHistory}>{t('exportCsv')}</button><button className="quiet-button" onClick={exportSession}>{t('exportJson')}</button></div></section></div>}

      <p className="sim-model-boundary">{isId ? 'Reset latch hanya membuka kembali kontrol dalam model latihan saat indeks daya sintetis rendah. Ini bukan kriteria reset SCRAM atau prosedur restart reaktor nyata. ' : 'The training latch reset only unlocks controls in this educational model at a low synthetic power index. It is not a real SCRAM-reset criterion or reactor restart procedure. '}
{isId ? '*Waktu, periode, margin didih, rasio aliran, dan angka lain adalah indeks/clock sintetis untuk pembelajaran. Bukan setpoint, MCPR/CPR, nilai termohidraulik, atau kriteria keselamatan reaktor.' : '*Time, period, boiling margin, flow ratio, and other values are synthetic indices/clocks for learning. They are not setpoints, MCPR/CPR, thermal-hydraulic values, or reactor safety criteria.'}</p>
    </section>
  );
}
