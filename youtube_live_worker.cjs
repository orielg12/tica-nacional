/**
 * WORKER DE MONITOREO YOUTUBE LIVE Y FUENTE OFICIAL CONECTATE
 * 
 * REGLAS ESTRICTAS DE FUENTES DE RESULTADOS:
 * ============================================================
 * FUENTE ÚNICA DE RESULTADOS:
 * - ANGUILLA: https://loterias.conectate.com.do/anguilla/
 * - LA PRIMERA: https://loterias.conectate.com.do/la-primera/
 * - FLORIDA Y NEW YORK: https://loterias.conectate.com.do/americanas/
 * 
 * NO utilizar Google, blogs, Wikipedia, redes sociales.
 * 
 * HORARIOS FIJOS DE PANAMÁ:
 * - LA PRIMERA: 11:00 AM, 6:00 PM
 * - ANGUILLA: 12:00 PM (1 PM LIVE), 5:00 PM (6 PM LIVE), 8:00 PM (9 PM LIVE) [10 AM LIVE IGNORAR]
 * - FLORIDA: 12:30 PM, 8:45 PM
 * - NEW YORK: 1:30 PM, 9:30 PM
 * 
 * ROLES:
 * - YOUTUBE = Verificación visual (detectar LIVE, inicio de sorteo, fila/flecha, OCR, audio, timestamp).
 * - CONECTATE = Fuente oficial de resultados y publicación.
 * ============================================================
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://nqoqdlycxkwunngkuewb.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xb3FkbHljeGt3dW5uZ2t1ZXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NzkzNzUsImV4cCI6MjA5MTE1NTM3NX0.Dm8RCh2pqFhwu9lJvIeuTnNWYpArSUjxPcWR1-WV4oE';

const HEADERS = {
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json'
};

/**
 * TABLA OFICIAL DE HORARIOS DE PANAMÁ DEL SISTEMA
 */
const DRAW_SCHEDULES = [
  // LA PRIMERA (https://loterias.conectate.com.do/la-primera/)
  { lottery: 'LA PRIMERA', panama_hour: 11, panama_minute: 0,  live_time: '11:00 AM', conectate_url: 'https://loterias.conectate.com.do/la-primera/', draw_id: '11am-primera' },
  { lottery: 'LA PRIMERA', panama_hour: 18, panama_minute: 0,  live_time: '6:00 PM',  conectate_url: 'https://loterias.conectate.com.do/la-primera/', draw_id: '6pm-primera' },
  
  // ANGUILLA (https://loterias.conectate.com.do/anguilla/)
  // 12:00 PM Panamá -> 1 PM del LIVE
  // 5:00 PM Panamá -> 6 PM del LIVE
  // 8:00 PM Panamá -> 9 PM del LIVE
  // 10 AM del LIVE -> IGNORAR.
  { lottery: 'ANGUILLA',   panama_hour: 12, panama_minute: 0,  live_time: '1:00 PM',  conectate_url: 'https://loterias.conectate.com.do/anguilla/', draw_id: '120-anguilla' },
  { lottery: 'ANGUILLA',   panama_hour: 17, panama_minute: 0,  live_time: '6:00 PM',  conectate_url: 'https://loterias.conectate.com.do/anguilla/', draw_id: '170-anguilla' },
  { lottery: 'ANGUILLA',   panama_hour: 20, panama_minute: 0,  live_time: '9:00 PM',  conectate_url: 'https://loterias.conectate.com.do/anguilla/', draw_id: '200-anguilla' },
  
  // FLORIDA (https://loterias.conectate.com.do/americanas/)
  { lottery: 'FLORIDA',    panama_hour: 12, panama_minute: 30, live_time: '12:30 PM', conectate_url: 'https://loterias.conectate.com.do/americanas/', draw_id: '1230-florida' },
  { lottery: 'FLORIDA',    panama_hour: 20, panama_minute: 45, live_time: '8:45 PM',  conectate_url: 'https://loterias.conectate.com.do/americanas/', draw_id: '2045-florida' },
  
  // NEW YORK (https://loterias.conectate.com.do/americanas/)
  { lottery: 'NEW YORK',   panama_hour: 13, panama_minute: 30, live_time: '1:30 PM',  conectate_url: 'https://loterias.conectate.com.do/americanas/', draw_id: '1330-newyork' },
  { lottery: 'NEW YORK',   panama_hour: 21, panama_minute: 30, live_time: '9:30 PM',  conectate_url: 'https://loterias.conectate.com.do/americanas/', draw_id: '2130-newyork' }
];

function getTodayDateStr() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function isResultAlreadyRecorded(drawId, dateStr) {
  try {
    const url = `${SUPABASE_URL}/rest/v1/results?draw_id=eq.${encodeURIComponent(drawId)}&date=eq.${encodeURIComponent(dateStr)}&select=winning_number`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return false;
    const data = await res.json();
    return Array.isArray(data) && data.length > 0 && Boolean(data[0].winning_number);
  } catch (e) {
    console.error(`[WORKER] Error consultando Supabase REST API:`, e.message);
    return false;
  }
}

async function submitVerifiedResult(drawId, dateStr, winningNumbers, auditInfo) {
  const winningNumberStr = winningNumbers.join('-');

  console.log(`\n==================================================`);
  console.log(`📌 NUEVO RESULTADO PUBLICADO (FUENTE OFICIAL: CONECTATE)`);
  console.log(`   Sorteo / Draw ID  : ${drawId}`);
  console.log(`   Fecha             : ${dateStr}`);
  console.log(`   Resultado         : ${winningNumberStr}`);
  console.log(`   Estado            : ${auditInfo.status}`);
  console.log(`   Fuente Oficial    : ${auditInfo.source}`);
  console.log(`   Verificación LIVE : ${auditInfo.method}`);
  console.log(`==================================================\n`);

  try {
    const url = `${SUPABASE_URL}/rest/v1/results?on_conflict=draw_id,date`;
    const body = JSON.stringify([{
      draw_id: drawId,
      date: dateStr,
      winning_number: winningNumberStr
    }]);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        ...HEADERS,
        'Prefer': 'resolution=merge-duplicates,return=representation'
      },
      body
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`❌ [WORKER] Error insertando en Supabase REST API (${res.status}):`, errText);
      return false;
    }

    console.log(`✅ [WORKER] Resultado para ${drawId} guardado exitosamente en Supabase.`);
    return true;
  } catch (e) {
    console.error(`❌ [WORKER] Excepción guardando resultado:`, e.message);
    return false;
  }
}

async function checkAndProcessDraws() {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const todayDateStr = getTodayDateStr();

  console.log(`[WORKER ${now.toLocaleTimeString()}] Monitoreando sorteos oficiales (${todayDateStr})...`);

  for (const draw of DRAW_SCHEDULES) {
    const alreadyExists = await isResultAlreadyRecorded(draw.draw_id, todayDateStr);
    if (alreadyExists) {
      continue;
    }

    const drawTotalMins = draw.panama_hour * 60 + draw.panama_minute;
    const currentTotalMins = currentHour * 60 + currentMinute;
    const minsDiff = currentTotalMins - drawTotalMins;

    if (minsDiff >= 0 && minsDiff <= 60) {
      console.log(`🔍 [WORKER] Sorteo activo detectado: ${draw.lottery} (${draw.panama_hour}:${String(draw.panama_minute).padStart(2,'0')} Panamá / ${draw.live_time} LIVE / ${draw.draw_id}).`);
      console.log(`   Fuente Oficial de Resultados: ${draw.conectate_url}`);

      // REGLA DE PRIORIDAD: Sin captura real conectada -> REVISIÓN NECESARIA
      console.log(`ℹ️ [WORKER] Sorteo en ventana de monitoreo. Esperando confirmación de lectura oficial de Conectate / YouTube Stream...`);
      // No insertar números de prueba automáticamente en BD sin verificación de Conectate
    }
  }
}

// Iniciar monitoreo continuo
console.log('==================================================');
console.log('🚀 WORKER AUTOMÁTICO DE MONITOREO Y RESULTADOS CONECTATE/YOUTUBE INICIADO');
console.log('==================================================');
checkAndProcessDraws();
setInterval(checkAndProcessDraws, 60 * 1000);
