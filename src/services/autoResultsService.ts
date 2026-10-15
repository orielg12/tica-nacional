import { supabase } from '../utils/supabase';
import { getLocalISODate } from '../utils/dateUtils';
import { useStore } from '../store/useStore';

export interface AutoResultStatus {
  drawId: string;
  name: string;
  winningNumber: string | null;
  status: 'updated' | 'already_exists' | 'pending' | 'error';
  message?: string;
}

/**
 * Los 9 Sorteos permitidos exclusivamente en el sistema:
 * Mapeo: ID del sistema -> Nombre de búsqueda en loteriasdominicanas.com
 */
/**
 * Los 9 Sorteos permitidos exclusivamente en el sistema:
 * Mapeo: ID del sistema -> Nombre de búsqueda en loteriasdominicanas.com
 */
const ALLOWED_DRAWS_MAP: Record<string, { pageGameName: string; pageTimeStr?: string; systemTimeStr: string }> = {
  // República Dominicana
  '11am-primera': { pageGameName: 'la primera día', systemTimeStr: '11:00 AM' },
  '120-anguilla':  { pageGameName: 'anguilla', pageTimeStr: '1:00 pm', systemTimeStr: '12:00 PM' },
  '1230-florida':  { pageGameName: 'florida día', systemTimeStr: '12:30 PM' },
  '1330-newyork':  { pageGameName: 'new york tarde', systemTimeStr: '1:30 PM' },
  '170-anguilla':  { pageGameName: 'anguilla', pageTimeStr: '6:00 pm', systemTimeStr: '5:00 PM' },
  '6pm-primera':   { pageGameName: 'la primera tarde', systemTimeStr: '6:00 PM' },
  '200-anguilla':  { pageGameName: 'anguilla', pageTimeStr: '9:00 pm', systemTimeStr: '8:00 PM' },
  '2045-florida':  { pageGameName: 'florida noche', systemTimeStr: '8:45 PM' },
  '2130-newyork':  { pageGameName: 'new york noche', systemTimeStr: '9:30 PM' },

  // Honduras
  '12pm-honduras': { pageGameName: 'honduras 11am', systemTimeStr: '12:00 PM' },
  '4pm-honduras':  { pageGameName: 'honduras 3pm',  systemTimeStr: '4:00 PM' },
  '10pm-honduras': { pageGameName: 'honduras 9pm',  systemTimeStr: '10:00 PM' },

  // Nicaragua
  '1pm-nica':      { pageGameName: 'nica 11am',     systemTimeStr: '12:00 PM' },
  '4pm-nica':      { pageGameName: 'nica 3pm',      systemTimeStr: '4:00 PM' },
  '7pm-nica':      { pageGameName: 'nica 6pm',      systemTimeStr: '7:00 PM' },
  '10pm-nica':     { pageGameName: 'nica 9pm',      systemTimeStr: '10:00 PM' }
};

/**
 * Mapeo explícito de game_id de la API oficial de loteriasdominicanas.com a draw_id del sistema
 */
const API_GAME_ID_MAP: Record<string, string> = {
  '6966a6d2ea7015c3b8a3d5c0': '11am-primera', // La Primera Día (11:00 AM)
  '6966a6d3ea7015c3b8a3d611': '120-anguilla',  // Anguilla 12:00 PM
  '6966a6d2ea7015c3b8a3d515': '1230-florida',  // Florida Día (12:30 PM)
  '6966a6d2ea7015c3b8a3d509': '1330-newyork',  // New York Tarde (1:30 PM)
  '6966a6d3ea7015c3b8a3d617': '170-anguilla',  // Anguilla 5:00 PM / 6:00 PM
  '6966a6d2ea7015c3b8a3d5c6': '6pm-primera',   // La Primera Tarde (6:00 PM)
  '6966a6d3ea7015c3b8a3d61d': '200-anguilla',  // Anguilla Noche (8:00 PM / 9:00 PM)
  '6966a6d2ea7015c3b8a3d51b': '2045-florida',  // Florida Noche (8:45 PM)
  '6966a6d2ea7015c3b8a3d50f': '2130-newyork'   // New York Noche (9:30 PM)
};

/**
 * Servicio automatizado de sincronización de premiaciones
 * FUENTE ÚNICA EXCLUSIVA: https://loteriasdominicanas.com/
 */
export async function syncAutoResults(targetDate: string = getLocalISODate()): Promise<AutoResultStatus[]> {
  const resultsStatuses: AutoResultStatus[] = [];
  const store = useStore.getState();
  const lotteries = store.lotteriesMaster;

  if (!lotteries || lotteries.length === 0) {
    return [];
  }

  console.log(`[autoResultsService] Iniciando sincronización para fecha: ${targetDate}`);

  // 1. Obtener resultados ya guardados en Supabase (solo columnas necesarias para ahorrar Egress)
  const { data: existingResults, error: fetchErr } = await supabase
    .from('results')
    .select('draw_id, winning_number')
    .eq('date', targetDate);

  if (fetchErr) {
    console.error("[autoResultsService] Error consultando resultados en Supabase:", fetchErr);
  }

  const existingMap = new Map<string, string>();
  if (existingResults) {
    existingResults.forEach((r: any) => {
      if (r.draw_id && r.winning_number) {
        existingMap.set(r.draw_id, r.winning_number);
      }
    });
  }

  // Incluir resultados guardados en Zustand local
  if (store.results) {
    store.results.forEach(r => {
      if (r.date === targetDate && r.lotteryId && r.winning_number) {
        existingMap.set(r.lotteryId, r.winning_number);
      }
    });
  }

  // 2. Verificar si hay sorteos pendientes que ya debieron jugar
  const now = new Date();
  const isToday = targetDate === getLocalISODate();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const pendingDraws = lotteries.filter(lot => {
    const config = ALLOWED_DRAWS_MAP[lot.id];
    if (!config) return false;
    if (existingMap.has(lot.id)) return false; // Ya tiene resultado
    if (isToday) {
      const drawMinutes = lot.hour * 60 + lot.minute;
      if (currentMinutes < drawMinutes) return false; // Aún no es hora
    }
    return true;
  });

  // Si no hay sorteos pendientes que ya debieron jugar, no consultar API externa
  if (pendingDraws.length === 0) {
    console.log(`[autoResultsService] No hay sorteos pendientes por consultar. Todos completos o aún no es hora.`);
    // Devolver estado de todos los configurados
    for (const lot of lotteries) {
      const config = ALLOWED_DRAWS_MAP[lot.id];
      if (!config) continue;
      const existing = existingMap.get(lot.id);
      resultsStatuses.push({
        drawId: lot.id,
        name: lot.name,
        winningNumber: existing || null,
        status: existing ? 'already_exists' : 'pending',
        message: existing ? 'Resultado ya registrado' : `Sorteo programado para las ${config.systemTimeStr}`
      });
    }
    return resultsStatuses;
  }

  console.log(`[autoResultsService] ${pendingDraws.length} sorteo(s) pendiente(s): ${pendingDraws.map(d => d.id).join(', ')}`);

  // Consultar fuentes en paralelo solo según los sorteos pendientes
  const hasDominicanaPending = pendingDraws.some(d => !d.id.includes('honduras') && !d.id.includes('nica'));
  const hasHondurasPending = pendingDraws.some(d => d.id.includes('honduras'));
  const hasNicaPending = pendingDraws.some(d => d.id.includes('nica'));

  const [domData, hnData, nicaData] = await Promise.all([
    hasDominicanaPending ? fetchLoteriasDominicanasData(targetDate) : Promise.resolve({}),
    hasHondurasPending ? fetchHondurasData(targetDate) : Promise.resolve({}),
    hasNicaPending ? fetchNicaraguaData(targetDate) : Promise.resolve({})
  ]);

  const scrapedData: Record<string, string> = {
    ...domData,
    ...hnData,
    ...nicaData
  };

  for (const lot of lotteries) {
    const config = ALLOWED_DRAWS_MAP[lot.id];
    if (!config) {
      continue; // Ignorar sorteos no configurados
    }

    const existing = existingMap.get(lot.id);
    if (existing) {
      resultsStatuses.push({
        drawId: lot.id,
        name: lot.name,
        winningNumber: existing,
        status: 'already_exists',
        message: 'Resultado ya registrado y premiado'
      });
      continue;
    }

    const winner = scrapedData[lot.id] || null;

    const drawMinutes = lot.hour * 60 + lot.minute;

    // Si el sorteo es hoy y aún no transcurre el horario
    if (isToday && currentMinutes < drawMinutes && !winner) {
      resultsStatuses.push({
        drawId: lot.id,
        name: lot.name,
        winningNumber: null,
        status: 'pending',
        message: `Sorteo programado para las ${config.systemTimeStr}`
      });
      continue;
    }

    if (winner) {
      console.log(`[autoResultsService] Ejecutando upsert en Supabase: draw_id=${lot.id}, date=${targetDate}, winning_number=${winner}`);
      // Upsert a Supabase
      const { error: upsertErr } = await supabase.from('results').upsert({
        draw_id: lot.id,
        date: targetDate,
        winning_number: winner
      }, { onConflict: 'draw_id,date' });

      if (upsertErr) {
        console.error(`[autoResultsService] Error en upsert para ${lot.id}:`, upsertErr);
      } else {
        console.log(`[autoResultsService] ✅ Upsert exitoso en resultados para ${lot.id}`);
      }

      // Guardar localmente
      store.addResult({
        id: `res-auto-${lot.id}-${targetDate}`,
        lotteryId: lot.id,
        date: targetDate,
        winning_number: winner
      });

      resultsStatuses.push({
        drawId: lot.id,
        name: lot.name,
        winningNumber: winner,
        status: 'updated',
        message: !upsertErr ? '¡Premio cargado y verificado!' : 'Cargado en memoria local'
      });
    } else {
      resultsStatuses.push({
        drawId: lot.id,
        name: lot.name,
        winningNumber: null,
        status: 'pending',
        message: 'Esperando publicación oficial de resultados'
      });
    }
  }

  return resultsStatuses;
}

/**
 * Consulta la fuente https://loteriasdominicanas.com/
 * y extrae los resultados validando las bolitas publicadas.
 */
async function fetchLoteriasDominicanasData(targetDate: string): Promise<Record<string, string>> {
  const map: Record<string, string> = {};

  try {
    // 1. Consultar API oficial de loteriasdominicanas.com para obtener sesiones publicadas
    // Formato de fecha para la API (04:00:00.000Z = medianoche local dominicana UTC-4)
    const apiDateIso = `${targetDate}T04:00:00.000Z`;
    const apiUrl = `https://api.loteriasdominicanas.com/dominicana/sessions?date=${encodeURIComponent(apiDateIso)}`;
    console.log(`[autoResultsService] Consultando API URL: ${apiUrl}`);
    
    const apiRes = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });

    if (apiRes.ok) {
      const sessions = await apiRes.json();
      console.log(`[autoResultsService] Petición API OK. Sesiones recibidas: ${Array.isArray(sessions) ? sessions.length : 0}`);
      if (Array.isArray(sessions) && sessions.length > 0) {
        parseSessionsArray(sessions, map, targetDate);
      }
    } else {
      console.warn(`[autoResultsService] Petición API retornó status ${apiRes.status}`);
    }

    // 2. Si la API no retorna resultados, consultar HTML / payload de https://loteriasdominicanas.com/
    if (Object.keys(map).length === 0) {
      console.log(`[autoResultsService] Intentando fallback HTML en loteriasdominicanas.com...`);
      const pageRes = await fetch('https://loteriasdominicanas.com/', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html'
        }
      });
      if (pageRes.ok) {
        const html = await pageRes.text();
        parseLdPageHTML(html, map);
      } else {
        console.warn(`[autoResultsService] Fallback HTML retornó status ${pageRes.status}`);
      }
    }
  } catch (err) {
    console.warn("[autoResultsService] Error al consultar loteriasdominicanas.com:", err);
  }

  return map;
}

/**
 * Procesa las sesiones de la API de loteriasdominicanas.com
 */
function parseSessionsArray(sessions: any[], map: Record<string, string>, targetDate?: string) {
  for (const item of sessions) {
    if (!item) continue;
    
    // La API actual agrupa por juego: { game_id, lastSession, sessions }
    const sess = item.lastSession || (Array.isArray(item.sessions) && item.sessions[0]) || item;
    if (!sess || !sess.score) continue;

    // Validación estricta de fecha: si la sesión no es de la fecha requerida (ej. sorteo nocturno que aún no juega), ignorar
    if (targetDate && sess.date && !sess.date.startsWith(targetDate)) {
      continue;
    }
    
    const gameId = String(item.game_id || sess.game_id || sess.game?.id || sess.game?._id || '');

    // Extraer los 3 números de izquierda a derecha (0, 1, 2)
    const rawScores = Array.isArray(sess.score[0]) ? sess.score[0] : sess.score;
    if (!Array.isArray(rawScores) || rawScores.length < 3) continue;

    const num1 = String(rawScores[0]).padStart(2, '0');
    const num2 = String(rawScores[1]).padStart(2, '0');
    const num3 = String(rawScores[2]).padStart(2, '0');
    const formattedWinner = `${num1}-${num2}-${num3}`;

    // 1. Intentar mapear por game_id explícito
    let mappedDrawId = API_GAME_ID_MAP[gameId];

    // 2. Fallback: mapear por game.title si el objeto game existe
    if (!mappedDrawId && sess.game) {
      const gameTitle = (sess.game.title || sess.game.name || '').toLowerCase();
      const timeStr = (sess.time || sess.name || '').toLowerCase();

      for (const [drawId, config] of Object.entries(ALLOWED_DRAWS_MAP)) {
        if (gameTitle.includes(config.pageGameName)) {
          if (config.pageTimeStr) {
            if (timeStr.includes(config.pageTimeStr) || gameTitle.includes(config.pageTimeStr)) {
              mappedDrawId = drawId;
              break;
            }
          } else {
            mappedDrawId = drawId;
            break;
          }
        }
      }
    }

    if (mappedDrawId) {
      map[mappedDrawId] = formattedWinner;
      console.log(`[autoResultsService] ✅ Sorteo detectado: game_id="${gameId}" -> draw_id="${mappedDrawId}" | score=[${rawScores.join(',')}] | winner="${formattedWinner}"`);
    } else {
      console.log(`[autoResultsService] ℹ️ Sesión recibida sin mapear: game_id="${gameId}" | score=[${rawScores.join(',')}]`);
    }
  }
}

/**
 * Procesa el código HTML / payload de Nuxt de loteriasdominicanas.com
 */
function parseLdPageHTML(html: string, map: Record<string, string>) {
  try {
    const match = html.match(/<script[^>]*data-nuxt-data[^>]*>([\s\S]*?)<\/script>/i) ||
                  html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (!match) return;

    const arr = JSON.parse(match[1]);
    arr.forEach((item: any, idx: number) => {
      if (Array.isArray(item) && item.length === 3 && item.every((x: any) => typeof x === 'string' && /^\d{2}$/.test(x))) {
        const contextStr = arr.slice(Math.max(0, idx - 20), idx + 20).filter((x: any) => typeof x === 'string').join(' ').toLowerCase();
        
        const isGreenContext = !contextStr.includes('pendiente') && !contextStr.includes('en vivo');
        if (!isGreenContext) return;

        const winnerStr = item.join('-');

        if (contextStr.includes('primera') && contextStr.includes('día')) map['11am-primera'] = winnerStr;
        if (contextStr.includes('anguilla') && contextStr.includes('1:00')) map['120-anguilla'] = winnerStr;
        if (contextStr.includes('florida') && contextStr.includes('día')) map['1230-florida'] = winnerStr;
        if (contextStr.includes('york') && (contextStr.includes('tarde') || contextStr.includes('medio día'))) map['1330-newyork'] = winnerStr;
        if (contextStr.includes('anguilla') && contextStr.includes('6:00')) map['170-anguilla'] = winnerStr;
        if (contextStr.includes('primera') && contextStr.includes('tarde')) map['6pm-primera'] = winnerStr;
        if (contextStr.includes('anguilla') && contextStr.includes('9:00')) map['200-anguilla'] = winnerStr;
        if (contextStr.includes('florida') && contextStr.includes('noche')) map['2045-florida'] = winnerStr;
        if (contextStr.includes('york') && contextStr.includes('noche')) map['2130-newyork'] = winnerStr;
      }
    });
  } catch (e) {
    // Ignorar errores de sintaxis JSON
  }
}

/**
 * Consulta la API oficial de Honduras para resolver La Diaria y Premia 2
 * Mapeo:
 * - 12:00 PM Panamá (11:00 AM HN): 12pm-honduras
 * - 4:00 PM Panamá (3:00 PM HN):   4pm-honduras
 * - 10:00 PM Panamá (9:00 PM HN):  10pm-honduras
 */
async function fetchHondurasData(targetDate: string): Promise<Record<string, string>> {
  const map: Record<string, string> = {};

  const hnConfigs = [
    { drawId: '12pm-honduras', dSiteGameId: '693ae5bbd7b13e9daed23b31', pSiteGameId: '693ae5bbd7b13e9daed23b3d' },
    { drawId: '4pm-honduras',  dSiteGameId: '693ae5bbd7b13e9daed23b07', pSiteGameId: '693ae5bbd7b13e9daed23b25' },
    { drawId: '10pm-honduras', dSiteGameId: '693ae5bbd7b13e9daed23b1f', pSiteGameId: '693ae5bbd7b13e9daed23b2b' }
  ];

  const fetchSiteGame = async (id: string) => {
    try {
      const url = `https://api.loteriasdominicanas.com/honduras/site-games/${id}?date=${encodeURIComponent(targetDate + 'T04:00:00.000Z')}`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
      });
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn(`[autoResultsService] Error en site-game HN ${id}:`, e);
    }
    return null;
  };

  await Promise.all(hnConfigs.map(async (cfg) => {
    try {
      const [dData, pData] = await Promise.all([
        fetchSiteGame(cfg.dSiteGameId),
        fetchSiteGame(cfg.pSiteGameId)
      ]);

      if (!dData?.game || !pData?.game) return;

      // 1. Extraer Diaria (1er Premio)
      const dOpts = dData.game.score_layout?.[0]?.[0]?.options || [];
      const dSymMap: Record<string, string> = {};
      dOpts.forEach((o: any) => {
        const numPart = String(o.text || '').trim().split(' ')[0];
        if (numPart) dSymMap[o.id] = numPart.padStart(2, '0');
      });

      const dSession = dData.game.sessions?.[0];
      const dDateMatches = dSession?.date && dSession.date.startsWith(targetDate);
      const dToken = dSession?.score?.[0]?.[0];
      const dWinner = dToken ? dSymMap[dToken] : null;

      // 2. Extraer Premia 2 (2do y 3er Premio)
      const pSession = pData.game.sessions?.[0];
      const pDateMatches = pSession?.date && pSession.date.startsWith(targetDate);
      const pScores = pSession?.score?.[0] || [];

      if (dDateMatches && pDateMatches && dWinner && pScores.length >= 2 && pScores[0] && pScores[1]) {
        const p1 = String(dWinner).padStart(2, '0');
        const p2 = String(pScores[0]).padStart(2, '0');
        const p3 = String(pScores[1]).padStart(2, '0');
        const fullResult = `${p1}-${p2}-${p3}`;
        map[cfg.drawId] = fullResult;
        console.log(`[autoResultsService] ✅ Honduras ${cfg.drawId} confirmado para ${targetDate}: ${fullResult}`);
      }
    } catch (err) {
      console.warn(`[autoResultsService] Error procesando Honduras ${cfg.drawId}:`, err);
    }
  }));

  return map;
}

/**
 * Consulta la API oficial de Nicaragua para resolver La Diaria y Premia 2
 * Mapeo:
 * - 12:00 PM Panamá (11:00 AM NI): 1pm-nica
 * - 4:00 PM Panamá (3:00 PM NI):   4pm-nica
 * - 7:00 PM Panamá (6:00 PM NI):   7pm-nica (Sáb/Dom)
 * - 10:00 PM Panamá (9:00 PM NI):  10pm-nica
 */
async function fetchNicaraguaData(targetDate: string): Promise<Record<string, string>> {
  const map: Record<string, string> = {};

  const nicaConfigs = [
    { drawId: '1pm-nica',  dSiteGameId: '6938bae65aada821ed601e99', pSiteGameId: '6938bae65aada821ed601ea5' },
    { drawId: '4pm-nica',  dSiteGameId: '6938bae65aada821ed601ebd', pSiteGameId: '6938bae65aada821ed601ecf' },
    { drawId: '7pm-nica',  dSiteGameId: '6938bae65aada821ed601f00', pSiteGameId: '6938bae65aada821ed601eee' },
    { drawId: '10pm-nica', dSiteGameId: '6938bae65aada821ed601ed6', pSiteGameId: '6938bae65aada821ed601ee8' }
  ];

  const fetchSiteGame = async (id: string) => {
    try {
      const url = `https://api.loteriasdenicaragua.com/nicaragua/site-games/${id}?date=${encodeURIComponent(targetDate + 'T04:00:00.000Z')}`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
      });
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn(`[autoResultsService] Error en site-game NI ${id}:`, e);
    }
    return null;
  };

  await Promise.all(nicaConfigs.map(async (cfg) => {
    try {
      const [dData, pData] = await Promise.all([
        fetchSiteGame(cfg.dSiteGameId),
        fetchSiteGame(cfg.pSiteGameId)
      ]);

      if (!dData?.game || !pData?.game) return;

      // 1. Extraer Diaria (1er Premio) - columna 2 del score_layout
      const dOpts = dData.game.score_layout?.[0]?.[2]?.options || [];
      const dSymMap: Record<string, string> = {};
      dOpts.forEach((o: any) => {
        const numPart = String(o.text || '').trim().split(' ')[0];
        if (numPart) dSymMap[o.id] = numPart.padStart(2, '0');
      });

      const dSession = dData.game.sessions?.[0];
      const dDateMatches = dSession?.date && dSession.date.startsWith(targetDate);
      const dToken = dSession?.score?.[0]?.[2];
      const dWinner = dToken ? dSymMap[dToken] : null;

      // 2. Extraer Premia 2 (2do y 3er Premio)
      const pSession = pData.game.sessions?.[0];
      const pDateMatches = pSession?.date && pSession.date.startsWith(targetDate);
      const pScores = pSession?.score?.[0] || [];

      if (dDateMatches && pDateMatches && dWinner && pScores.length >= 2 && pScores[0] && pScores[1]) {
        const p1 = String(dWinner).padStart(2, '0');
        const p2 = String(pScores[0]).padStart(2, '0');
        const p3 = String(pScores[1]).padStart(2, '0');
        const fullResult = `${p1}-${p2}-${p3}`;
        map[cfg.drawId] = fullResult;
        console.log(`[autoResultsService] ✅ Nicaragua ${cfg.drawId} confirmado para ${targetDate}: ${fullResult}`);
      }
    } catch (err) {
      console.warn(`[autoResultsService] Error procesando Nicaragua ${cfg.drawId}:`, err);
    }
  }));

  return map;
}

