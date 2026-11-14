import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { siteMeta, type AppRoute } from './data/site';
import { useI18n } from './i18n';

const SimulationPage = lazy(() => import('./pages/SimulationPage'));
const LearnPage = lazy(() => import('./pages/LearnPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }> };
const routeFromHash = (): AppRoute => {
  const route = window.location.hash.replace(/^#\/?/, '').split('/')[0];
  return route === 'learn' || route === 'about' ? route : 'simulation';
};

function LoadingScreen({ progress, step, title, subtitle, readyLabel }: { progress: number; step: string; title: string; subtitle: string; readyLabel: string }) {
  return <div className="boot-screen"><div className="boot-orbit"><span/><i/><b/></div><div className="boot-brand">BWR <em>ENGINEERING LAB</em></div><h1>{title}</h1><p>{subtitle}</p><div className="boot-progress"><div><span>{step}</span><b>{Math.round(progress)}%</b></div><i><span style={{ width: `${progress}%` }}/></i></div><small>{progress >= 100 ? readyLabel : 'TYPESCRIPT ENGINE · LIGHTWEIGHT RUNTIME'}</small></div>;
}

export default function App() {
  const { language, setLanguage, t } = useI18n();
  const [route, setRoute] = useState<AppRoute>(routeFromHash);
  const [online, setOnline] = useState(navigator.onLine);
  const [lowPower] = useState(() => ((navigator.hardwareConcurrency || 8) <= 4) || Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory || 8) <= 4);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installMessage, setInstallMessage] = useState('');
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(4);
  const [loadingStep, setLoadingStep] = useState('BOOT');

  const navigate = useCallback((next: AppRoute) => {
    window.location.hash = `/${next}`;
    setRoute(next);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  useEffect(() => {
    let active = true;
    const boot = async () => {
      try {
        setLoadingStep(t('loadingInterface')); setProgress(18);
        await import('./i18n');
        if (!active) return;
        setLoadingStep(t('loadingEngine')); setProgress(38);
        const engine = await import('./engine/model');
        engine.createInitialState(310031, 'standard');
        if (!active) return;
        setProgress(66);
        await import('./pages/SimulationPage');
        if (!active) return;
        setLoadingStep(t('loadingOffline')); setProgress(88);
        if ('serviceWorker' in navigator && location.protocol !== 'file:') {
          await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => null);
        }
        if ('caches' in window) await caches.open('bwr-v32-runtime').catch(() => null);
        if (!active) return;
        setProgress(100); setLoadingStep(t('loadingDone'));
        window.setTimeout(() => { if (active) setReady(true); }, 180);
      } catch {
        if (active) { setProgress(100); setReady(true); }
      }
    };
    void boot();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash());
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onBeforeInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
    };
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) { setInstallMessage(t('installHelp')); return; }
    await installPrompt.prompt();
    const result = await installPrompt.userChoice;
    setInstallMessage(result.outcome === 'accepted' ? t('installAccepted') : t('installDismissed'));
    setInstallPrompt(null);
  };

  if (!ready) return <LoadingScreen progress={progress} step={loadingStep} title={t('loadingTitle')} subtitle={t('loadingSubtitle')} readyLabel={t('loadingDone')}/>;

  const navItems: { id: AppRoute; number: string; title: string; subtitle: string; icon: string }[] = [
    { id: 'simulation', number: '01', title: t('navSimulation'), subtitle: t('navSimulationSub'), icon: '◉' },
    { id: 'learn', number: '02', title: t('navLearn'), subtitle: t('navLearnSub'), icon: '∑' },
    { id: 'about', number: '03', title: t('navAbout'), subtitle: t('navAboutSub'), icon: 'ⓘ' },
  ];

  return (
    <div className="app-shell" data-low-power={lowPower ? 'true' : 'false'}>
      <header className="topbar">
        <button className="brand" onClick={() => navigate('simulation')} aria-label={t('navSimulation')}>
          <span className="brand-mark"><span/></span><span className="brand-copy"><strong>{siteMeta.name}</strong><small>{t('appTagline')} <em>v3.2</em></small></span>
        </button>
        <div className="topbar-actions">
          <span className={`connection ${online ? 'is-online' : 'is-offline'}`}><i/>{online ? t('online') : t('offline')}</span>
          <label className="language-picker" aria-label="Language"><span>文</span><select value={language} onChange={(event) => setLanguage(event.target.value as 'id' | 'en')}><option value="id">ID</option><option value="en">EN</option></select></label>
          <button className="install-button" onClick={handleInstall} title={t('install')}>↓ <span>{t('install')}</span></button>
        </div>
      </header>

      <nav className="main-nav" aria-label="Main navigation">
        {navItems.map((item) => <button key={item.id} className={`nav-item ${route === item.id ? 'active' : ''}`} onClick={() => navigate(item.id)} aria-current={route === item.id ? 'page' : undefined}>
          <span className="nav-number">{item.number}</span><span className="nav-icon">{item.icon}</span><span className="nav-copy"><strong>{item.title}</strong><small>{item.subtitle}</small></span>{route === item.id && <span className="nav-active-line"/>}
        </button>)}
      </nav>

      <main className="page-content">
        <Suspense fallback={<LoadingScreen progress={76} step={t('loadingInterface')} title={t('loadingTitle')} subtitle={t('loadingSubtitle')} readyLabel={t('loadingDone')}/> }>
          {route === 'simulation' && <SimulationPage/>}
          {route === 'learn' && <LearnPage/>}
          {route === 'about' && <AboutPage/>}
        </Suspense>
      </main>
      {installMessage && <div className="toast" role="status"><span>{installMessage}</span><button onClick={() => setInstallMessage('')} aria-label="Close">×</button></div>}
      <footer className="app-footer"><span>© {new Date().getFullYear()} {siteMeta.name}</span><span>{t('footer')}</span></footer>
      <Analytics />
    </div>
  );
}
