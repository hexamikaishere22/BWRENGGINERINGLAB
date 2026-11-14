import { formatTime, getAlarmKeys } from './model';
import type { Language, SimState } from './types';

const textMap: Record<Language, Record<string, string>> = {
  id: {
    title: 'BWR ENGINEERING LAB - LAPORAN SESI', subtitle: 'Laporan hasil simulasi edukatif', generated: 'Dibuat', duration: 'Durasi', score: 'Skor belajar', seed: 'Seed sesi', mode: 'Mode tantangan',
    summary: 'RINGKASAN PARAMETER TERAKHIR', power: 'Indeks daya', pressure: 'Indeks tekanan', water: 'Inventori air', thermal: 'Indeks termal', grid: 'Keluaran jaringan', status: 'Status akhir',
    trends: 'TREN HISTORI (INDEKS TANPA SATUAN)', events: 'LOG KEJADIAN', alarms: 'Alarm akhir', faults: 'Gangguan aktif saat akhir', noEvents: 'Tidak ada kejadian tercatat.',
    note: 'Catatan: seluruh nilai adalah indeks sintetis untuk pembelajaran, bukan satuan atau setpoint pembangkit nyata.', disclaimer: 'Bukan alat operasi, desain, analisis keselamatan, atau pelatihan operator tersertifikasi.', advanced: 'Xe-135 / period / flow ratio / boiling margin / fuel integrity / consequence tier',
    ended: 'BERAKHIR', active: 'AKTIF', normal: 'TANPA KEGAGALAN', standard: 'Dinamis', compound: 'Gabungan', deception: 'Indikasi sensor', 'slow-drift': 'Drift bertahap', master: 'Master',
  },
  en: {
    title: 'BWR ENGINEERING LAB - SESSION REPORT', subtitle: 'Educational simulation session report', generated: 'Generated', duration: 'Duration', score: 'Learning score', seed: 'Session seed', mode: 'Challenge mode',
    summary: 'LAST PARAMETER SUMMARY', power: 'Power index', pressure: 'Pressure index', water: 'Water inventory', thermal: 'Thermal index', grid: 'Grid output', status: 'Final status',
    trends: 'HISTORICAL TRENDS (DIMENSIONLESS INDEX)', events: 'EVENT LOG', alarms: 'Final alarms', faults: 'Faults active at end', noEvents: 'No events were recorded.',
    note: 'Note: all values are synthetic educational indices, not real plant units or setpoints.', disclaimer: 'Not for plant operation, design, safety analysis, or certified operator training.', advanced: 'Xe-135 / period / flow ratio / boiling margin / fuel integrity / consequence tier',
    ended: 'ENDED', active: 'ACTIVE', normal: 'NO FAILURE', standard: 'Dynamic', compound: 'Compound', deception: 'Sensor indication', 'slow-drift': 'Gradual drift', master: 'Master',
  },
};

function ascii(input: string): string {
  return input.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, ' ').replace(/\s+/g, ' ').trim();
}
function esc(input: string): string { return ascii(input).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); }
function timeStamp() { return new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC'; }
function eventLabel(key: string, language: Language): string {
  const id: Record<string, string> = {
    'session-started': 'Sesi simulasi dimulai', 'scram-activated': 'SCRAM edukatif diaktifkan', 'scram-reset-training': 'Latch dibuka untuk percobaan restart edukatif', 'failure-power': 'Sesi berakhir: indeks daya melewati batas sintetis',
    'failure-pressure': 'Sesi berakhir: indeks tekanan melewati batas sintetis', 'failure-low-inventory': 'Sesi berakhir: inventori air terlalu rendah',
    'failure-high-inventory': 'Sesi berakhir: inventori air terlalu tinggi', 'failure-thermal-index': 'Sesi berakhir: indeks termal melewati batas sintetis',
    'challenge-feedwater': 'Gangguan sintetis: kapasitas feedwater menurun', 'challenge-circulation': 'Gangguan sintetis: sirkulasi menurun',
    'challenge-condenser': 'Gangguan sintetis: pelepasan panas kondensor terbatas', 'challenge-load': 'Gangguan sintetis: permintaan turbin turun',
    'challenge-sensor': 'Gangguan sintetis: indikasi sensor menyimpang', 'challenge-heater': 'Gangguan sintetis: pemanas feedwater terdegradasi', 'challenge-stuck-rod': 'Gangguan sintetis: grup batang kendali macet', 'challenge-pump-a': 'Gangguan sintetis: pompa resirkulasi A', 'challenge-pump-b': 'Gangguan sintetis: pompa resirkulasi B', 'challenge-offsite-power': 'Gangguan sintetis: daya eksternal hilang', 'challenge-instrument-freeze': 'Gangguan sintetis: kanal instrumen membeku', 'challenge-instrument-bias': 'Gangguan sintetis: bias instrumen', 'challenge-slow-leak': 'Gangguan sintetis: kehilangan inventori lambat', 'challenge-msiv': 'Gangguan sintetis: indikasi MSIV tidak andal', 'challenge-suppression-load': 'Gangguan sintetis: beban kolam supresi', 'recovered-feedwater': 'Feedwater pulih pada model',
    'recovered-circulation': 'Sirkulasi pulih pada model', 'recovered-condenser': 'Kondensor pulih pada model', 'recovered-load': 'Permintaan turbin pulih pada model', 'recovered-sensor': 'Indikasi sensor pulih pada model',
  };
  const en: Record<string, string> = {
    'session-started': 'Simulation session started', 'scram-activated': 'Educational SCRAM activated', 'scram-reset-training': 'Latch released for an educational restart attempt', 'failure-power': 'Session ended: power index exceeded synthetic limit',
    'failure-pressure': 'Session ended: pressure index exceeded synthetic limit', 'failure-low-inventory': 'Session ended: water inventory too low',
    'failure-high-inventory': 'Session ended: water inventory too high', 'failure-thermal-index': 'Session ended: thermal index exceeded synthetic limit',
    'challenge-feedwater': 'Synthetic fault: feedwater capacity reduced', 'challenge-circulation': 'Synthetic fault: circulation reduced',
    'challenge-condenser': 'Synthetic fault: condenser heat rejection restricted', 'challenge-load': 'Synthetic fault: turbine demand reduced',
    'challenge-sensor': 'Synthetic fault: sensor indication drift', 'challenge-heater': 'Synthetic fault: feedwater heater degraded', 'challenge-stuck-rod': 'Synthetic fault: control rod group stuck', 'challenge-pump-a': 'Synthetic fault: recirculation pump A', 'challenge-pump-b': 'Synthetic fault: recirculation pump B', 'challenge-offsite-power': 'Synthetic fault: offsite power lost', 'challenge-instrument-freeze': 'Synthetic fault: instrument channel frozen', 'challenge-instrument-bias': 'Synthetic fault: instrument bias', 'challenge-slow-leak': 'Synthetic fault: slow inventory loss', 'challenge-msiv': 'Synthetic fault: MSIV indication unreliable', 'challenge-suppression-load': 'Synthetic fault: suppression pool heat load', 'recovered-feedwater': 'Feedwater recovered in model',
    'recovered-circulation': 'Circulation recovered in model', 'recovered-condenser': 'Condenser recovered in model', 'recovered-load': 'Turbine demand recovered in model', 'recovered-sensor': 'Sensor indication recovered in model',
  };
  const map = language === 'en' ? en : id;
  const actions: Record<string, string> = language === 'en' ? {
    offsitePower: 'External grid source', dieselAvailable: 'Backup generator', feedwaterAuto: 'Feedwater auto mode',
    feedwaterHeater: 'Feedwater heater', msivOpen: 'Main steam isolation valve', pumpAAvailable: 'Recirculation pump A',
    pumpBAvailable: 'Recirculation pump B', hpi: 'High-pressure injection model', lpi: 'Low-pressure injection model',
    rhr: 'Residual heat removal model', ads: 'Automatic depressurization model', boron: 'Boron injection model',
  } : {
    offsitePower: 'Sumber daya eksternal', dieselAvailable: 'Generator cadangan', feedwaterAuto: 'Mode feedwater otomatis',
    feedwaterHeater: 'Pemanas feedwater', msivOpen: 'Katup isolasi uap utama', pumpAAvailable: 'Pompa resirkulasi A',
    pumpBAvailable: 'Pompa resirkulasi B', hpi: 'Model injeksi tekanan tinggi', lpi: 'Model injeksi tekanan rendah',
    rhr: 'Model pendingin panas residual', ads: 'Model depresurisasi otomatis', boron: 'Model injeksi boron',
  };
  if (key.startsWith('challenge-')) return `${language === 'en' ? 'Synthetic challenge' : 'Gangguan sintetis'}: ${faultLabel(key.slice(10), language)}`;
  if (key.startsWith('recovered-')) return `${language === 'en' ? 'Recovered in model' : 'Pulih pada model'}: ${faultLabel(key.slice(10), language)}`;
  if (key.startsWith('action-start-') || key.startsWith('action-complete-')) {
    const starting = key.startsWith('action-start-');
    const actionKey = key.slice(starting ? 13 : 16);
    return `${language === 'en' ? (starting ? 'Transition requested' : 'Transition complete') : (starting ? 'Perubahan diminta' : 'Perubahan selesai')}: ${actions[actionKey] ?? actionKey}`;
  }
  if (key.startsWith('startup-stage-')) return `${language === 'en' ? 'Startup learning stage' : 'Tahap belajar start-up'}: ${key.slice(14)}`;
  return map[key] ?? key;
}

function faultLabel(kind: string, language: Language): string {
  const labels: Record<Language, Record<string, string>> = {
    id: { feedwater: 'Kapasitas feedwater menurun', circulation: 'Sirkulasi menurun', condenser: 'Pelepasan panas kondensor terbatas', load: 'Permintaan turbin berkurang', sensor: 'Drift indikasi sensor', heater: 'Pemanas feedwater terdegradasi', 'stuck-rod': 'Grup batang kendali macet', 'pump-a': 'Pompa resirkulasi A', 'pump-b': 'Pompa resirkulasi B', 'offsite-power': 'Daya eksternal hilang', msiv: 'Indikasi MSIV tidak andal', 'instrument-freeze': 'Kanal instrumen membeku', 'instrument-bias': 'Bias instrumen', 'slow-leak': 'Kehilangan inventori lambat', 'suppression-load': 'Beban kolam supresi meningkat' },
    en: { feedwater: 'Feedwater capacity reduced', circulation: 'Circulation reduced', condenser: 'Condenser heat rejection restricted', load: 'Turbine demand reduced', sensor: 'Sensor indication drift', heater: 'Feedwater heater degraded', 'stuck-rod': 'Control rod group stuck', 'pump-a': 'Recirculation pump A', 'pump-b': 'Recirculation pump B', 'offsite-power': 'Offsite power lost', msiv: 'MSIV indication unreliable', 'instrument-freeze': 'Instrument channel frozen', 'instrument-bias': 'Instrument bias', 'slow-leak': 'Slow inventory loss', 'suppression-load': 'Suppression pool heat load rises' },
  };
  return labels[language][kind] ?? kind;
}
function alarmLabel(key: string, language: Language): string {
  const labels: Record<Language, Record<string, string>> = {
    id: { 'alarm-power': 'Indeks daya tinggi', 'alarm-pressure': 'Indeks tekanan tinggi', 'alarm-low-water': 'Inventori air rendah', 'alarm-high-water': 'Inventori air tinggi', 'alarm-thermal': 'Indeks termal tinggi', 'alarm-fault': 'Gangguan simulasi aktif', 'alarm-level-disagreement': 'Level dan inventori berbeda', 'alarm-period': 'Periode model memendek', 'alarm-flow-map': 'Rasio aliran/daya tidak stabil (proxy)', 'alarm-boiling-margin': 'Margin didih rendah (proxy)', 'alarm-xenon': 'Inhibisi Xe-135 meningkat', 'alarm-containment': 'Indeks kontainmen meningkat', 'alarm-electrical': 'Bus listrik tidak tersedia' },
    en: { 'alarm-power': 'High power index', 'alarm-pressure': 'High pressure index', 'alarm-low-water': 'Low water inventory', 'alarm-high-water': 'High water inventory', 'alarm-thermal': 'High thermal index', 'alarm-fault': 'Active simulation fault', 'alarm-level-disagreement': 'Level and inventory disagree', 'alarm-period': 'Model period shortening', 'alarm-flow-map': 'Flow/power ratio unstable (proxy)', 'alarm-boiling-margin': 'Low boiling margin (proxy)', 'alarm-xenon': 'Xe-135 inhibition increasing', 'alarm-containment': 'Containment index increasing', 'alarm-electrical': 'Electrical bus unavailable' },
  };
  return labels[language][key] ?? key;
}

export function createSessionPdf(state: SimState, language: Language): Blob {
  const t = textMap[language];
  const commands: string[][] = [];
  const addText = (list: string[], x: number, y: number, value: string, size = 10, bold = false, color = '0.86 0.92 0.96') => {
    list.push(`${color} rg BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(1)} ${y.toFixed(1)} Td (${esc(value)}) Tj ET`);
  };
  const line = (list: string[], x1: number, y1: number, x2: number, y2: number, color = '0.22 0.39 0.49', width = 0.8) => {
    list.push(`${color} RG ${width} w ${x1.toFixed(1)} ${y1.toFixed(1)} m ${x2.toFixed(1)} ${y2.toFixed(1)} l S`);
  };
  const rect = (list: string[], x: number, y: number, w: number, h: number, color: string) => {
    list.push(`${color} rg ${x} ${y} ${w} ${h} re f`);
  };

  const p1: string[] = [];
  rect(p1, 0, 0, 595, 842, '0.035 0.075 0.105');
  rect(p1, 0, 748, 595, 94, '0.03 0.08 0.12');
  rect(p1, 0, 744, 595, 4, '0.22 0.78 0.86');
  addText(p1, 42, 805, t.title, 16, true, '0.85 0.97 1');
  addText(p1, 42, 783, t.subtitle, 9, false, '0.55 0.71 0.79');
  addText(p1, 42, 728, `${t.generated}: ${timeStamp()}`, 8, false, '0.55 0.71 0.79');
  addText(p1, 42, 704, `${t.duration}: ${formatTime(state.elapsed)}    ${t.score}: ${state.score}    ${t.seed}: ${state.seed}`, 9, true);
  const modeLabel = t[state.mode];
  addText(p1, 42, 685, `${t.mode}: ${modeLabel}    ${t.status}: ${state.status === 'failed' ? t.ended : t.normal}`, 9);
  line(p1, 42, 670, 553, 670);
  addText(p1, 42, 650, t.summary, 10, true, '0.34 0.82 0.88');

  const reads = [
    [t.power, state.power], [t.pressure, state.pressure], [t.water, state.water], [t.thermal, state.thermal], [t.grid, state.grid],
  ];
  reads.forEach(([label, value], index) => {
    const x = index % 2 === 0 ? 42 : 305;
    const y = 622 - Math.floor(index / 2) * 37;
    rect(p1, x, y - 10, 240, 27, '0.07 0.14 0.20');
    addText(p1, x + 10, y, String(label), 8, false, '0.55 0.71 0.79');
    addText(p1, x + 185, y, Number(value).toFixed(1), 11, true, '0.85 0.97 1');
  });

  addText(p1, 42, 528, `${t.advanced}: ${state.xenon135.toFixed(2)} / ${state.periodSeconds.toFixed(1)} / ${state.flowRatio.toFixed(2)} / ${state.boilingMargin.toFixed(1)} / ${state.fuelIntegrity.toFixed(1)} / ${state.severityTier}/5`, 7, false, '0.70 0.80 0.86');
  addText(p1, 42, 507, t.trends, 10, true, '0.34 0.82 0.88');
  const chartX = 52, chartY = 345, chartW = 490, chartH = 145;
  rect(p1, chartX, chartY, chartW, chartH, '0.05 0.11 0.16');
  for (let i = 0; i <= 4; i++) {
    const y = chartY + chartH * i / 4;
    line(p1, chartX, y, chartX + chartW, y, '0.15 0.26 0.34', 0.45);
  }
  const series = [
    { key: 'power' as const, color: '0.30 0.82 0.88' },
    { key: 'pressure' as const, color: '0.98 0.72 0.35' },
    { key: 'water' as const, color: '0.43 0.82 0.62' },
    { key: 'thermal' as const, color: '0.91 0.48 0.54' },
  ];
  const points = state.history.slice(-120);
  series.forEach((entry) => {
    if (points.length < 2) return;
    const cmds = [`${entry.color} RG 1.45 w`];
    points.forEach((point, index) => {
      const x = chartX + index / (points.length - 1) * chartW;
      const value = clampPdf(point[entry.key], 0, 160) / 160;
      const y = chartY + value * chartH;
      cmds.push(`${x.toFixed(1)} ${y.toFixed(1)} ${index === 0 ? 'm' : 'l'}`);
    });
    cmds.push('S');
    p1.push(cmds.join(' '));
  });
  addText(p1, 52, 327, 'CYAN: POWER   AMBER: PRESSURE   GREEN: WATER   RED: THERMAL', 7, false, '0.62 0.75 0.81');
  addText(p1, 42, 295, t.alarms, 10, true, '0.34 0.82 0.88');
  const alarms = getAlarmKeys(state);
  addText(p1, 42, 276, alarms.length ? alarms.map((key) => alarmLabel(key, language)).join(', ') : t.normal, 8);
  addText(p1, 42, 248, t.faults, 10, true, '0.34 0.82 0.88');
  addText(p1, 42, 229, state.faults.length ? state.faults.map((fault) => faultLabel(fault.kind, language)).join(', ') : t.normal, 8);
  line(p1, 42, 201, 553, 201);
  addText(p1, 42, 182, t.note, 8, false, '0.98 0.75 0.42');
  addText(p1, 42, 165, t.disclaimer, 8, false, '0.62 0.75 0.81');
  commands.push(p1);

  const eventRows = state.events.slice().reverse();
  const eventChunks: typeof eventRows[] = [];
  for (let index = 0; index < eventRows.length; index += 25) eventChunks.push(eventRows.slice(index, index + 25));
  if (!eventChunks.length) eventChunks.push([]);
  eventChunks.forEach((chunk) => {
    const page: string[] = [];
    rect(page, 0, 0, 595, 842, '0.035 0.075 0.105');
    rect(page, 0, 748, 595, 94, '0.03 0.08 0.12');
    rect(page, 0, 744, 595, 4, '0.22 0.78 0.86');
    addText(page, 42, 805, t.events, 16, true, '0.85 0.97 1');
    addText(page, 42, 783, `${t.seed}: ${state.seed}  |  ${t.duration}: ${formatTime(state.elapsed)}`, 9, false, '0.55 0.71 0.79');
    let y = 718;
    if (!chunk.length) addText(page, 42, y, t.noEvents, 9);
    chunk.forEach((event, index) => {
      if (index % 2 === 1) rect(page, 42, y - 7, 511, 22, '0.06 0.12 0.17');
      addText(page, 50, y, formatTime(event.time), 8, false, '0.34 0.82 0.88');
      addText(page, 112, y, eventLabel(event.key, language), 8, false, '0.83 0.90 0.94');
      y -= 25;
    });
    commands.push(page);
  });
  const totalPages = commands.length;
  commands.forEach((page, pageIndex) => addText(page, 42, 38, `BWR Engineering Lab v3.2  |  Page ${pageIndex + 1} / ${totalPages}`, 8, false, '0.40 0.56 0.64'));

  const objects: string[] = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${commands.map((_, index) => `${5 + index * 2} 0 R`).join(' ')}] /Count ${commands.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
  commands.forEach((items, index) => {
    const pageObject = 5 + index * 2;
    const streamObject = pageObject + 1;
    const stream = items.join('\n');
    objects[pageObject] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamObject} 0 R >>`;
    objects[streamObject] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });

  let pdf = '%PDF-1.4\n% BWR Engineering Lab educational report\n';
  const offsets = [0];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return new Blob([pdf], { type: 'application/pdf' });
}

function clampPdf(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
