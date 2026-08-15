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
const ALLOWED_DRAWS_MAP: Record<string, { pageGameName: string; pageTimeStr?: string; systemTimeStr: string }> = {
  '11am-primera': { pageGameName: 'la primera día', systemTimeStr: '11:00 AM' },
  '120-anguilla':  { pageGameName: 'anguilla', pageTimeStr: '1:00 pm', systemTimeStr: '12:00 PM' },
  '1230-florida':  { pageGameName: 'florida día', systemTimeStr: '12:30 PM' },
  '1330-newyork':  { pageGameName: 'new york tarde', systemTimeStr: '1:30 PM' },
  '170-anguilla':  { pageGameName: 'anguilla', pageTimeStr: '6:00 pm', systemTimeStr: '5:00 PM' },
  '6pm-primera':   { pageGameName: 'la primera tarde', systemTimeStr: '6:00 PM' },
  '200-anguilla':  { pageGameName: 'anguilla', pageTimeStr: '9:00 pm', systemTimeStr: '8:00 PM' },
  '2045-florida':  { pageGameName: 'florida noche', systemTimeStr: '8:45 PM' },
  '2130-newyork':  { pageGameName: 'new york noche', systemTimeStr: '9:30 PM' }
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

  // 1. Obtener resultados ya guardados en Supabase
  const { data: existingResults, error: fetchErr } = await supabase
    .from('results')
    .select('*')
    .eq('date', targetDate);

  if (fetchErr) {
    console.error("Error consultando resultados en Supabase:", fetchErr);
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

  // 2. Consultar FUENTE de resultados
  const scrapedData = await fetchLoteriasDominicanasData(targetDate);

  const now = new Date();
  const isToday = targetDate === getLocalISODate();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

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
      // Upsert a Supabase
      const { error: upsertErr } = await supabase.from('results').upsert({
        draw_id: lot.id,
        date: targetDate,
        winning_number: winner
      }, { onConflict: 'draw_id,date' });

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
    const nowIso = new Date(targetDate + 'T12:00:00.000Z').toISOString();
    const apiUrl = `https://api.loteriasdominicanas.com/dominicana/sessions?date=${encodeURIComponent(nowIso)}`;
    
    const apiRes = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });

    if (apiRes.ok) {
      const sessions = await apiRes.json();
      if (Array.isArray(sessions) && sessions.length > 0) {
        parseSessionsArray(sessions, map);
      }
    }

    // 2. Si la API no retorna resultados, consultar HTML / payload de https://loteriasdominicanas.com/
    if (Object.keys(map).length === 0) {
      const pageRes = await fetch('https://loteriasdominicanas.com/', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html'
        }
      });
      if (pageRes.ok) {
        const html = await pageRes.text();
        parseLdPageHTML(html, map);
      }
    }
  } catch (err) {
    console.warn("Error al consultar loteriasdominicanas.com:", err);
  }

  return map;
}

/**
 * Procesa las sesiones de la API de loteriasdominicanas.com
 */
function parseSessionsArray(sessions: any[], map: Record<string, string>) {
  for (const sess of sessions) {
    if (!sess || !sess.game || !sess.score) continue;
    
    const isGreen = sess.status === 'published' || sess.is_published === true || sess.color === 'green' || (sess.score && sess.score.length > 0);
    if (!isGreen) continue;

    const gameTitle = (sess.game.title || sess.game.name || '').toLowerCase();
    const timeStr = (sess.time || sess.name || '').toLowerCase();

    // Extraer los 3 números de izquierda a derecha (0, 1, 2)
    const rawScores = sess.score[0] || sess.score;
    if (!Array.isArray(rawScores) || rawScores.length < 3) continue;

    const num1 = String(rawScores[0]).padStart(2, '0');
    const num2 = String(rawScores[1]).padStart(2, '0');
    const num3 = String(rawScores[2]).padStart(2, '0');
    const formattedWinner = `${num1}-${num2}-${num3}`;

    // Mapear con los 9 sorteos permitidos
    for (const [drawId, config] of Object.entries(ALLOWED_DRAWS_MAP)) {
      if (gameTitle.includes(config.pageGameName)) {
        if (config.pageTimeStr) {
          if (timeStr.includes(config.pageTimeStr) || gameTitle.includes(config.pageTimeStr)) {
            map[drawId] = formattedWinner;
          }
        } else {
          map[drawId] = formattedWinner;
        }
      }
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
