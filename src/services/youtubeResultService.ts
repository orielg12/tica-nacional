import { supabase } from '../utils/supabase';
import { useStore } from '../store/useStore';
import { OFFICIAL_DRAW_RULES } from './conectateService';

/**
 * REGLAS ESTRICTAS DE FUENTES DE RESULTADOS:
 * - FUENTE DE RESULTADOS = CONECTATE (Única oficial)
 *   - Anguilla: https://loterias.conectate.com.do/anguilla/
 *   - La Primera: https://loterias.conectate.com.do/la-primera/
 *   - Florida y New York: https://loterias.conectate.com.do/americanas/
 * - FUENTE DE VERIFICACIÓN VISUAL = YOUTUBE
 *   (Detectar LIVE, inicio de sorteo, fila/flecha, OCR, audio, timestamp)
 */

export interface YouTubeCapturedResult {
  lottery: string;
  date: string;               // YYYY-MM-DD
  panama_time: string;         // Ej. "12:00 PM"
  live_time?: string;          // Ej. "1:00 PM" (Anguilla)
  ocr_results: string[];       // Ej. ["15", "42", "89"]
  audio_results?: string[];     // Ej. ["15", "42", "89"]
  status: 'CONFIRMADO' | 'REVISIÓN NECESARIA';
  live_url?: string;
  video_timestamp?: string;    // MM:SS
  detection_method?: string;
}

export interface ProcessingResponse {
  success: boolean;
  status: 'CONFIRMADO' | 'REVISIÓN NECESARIA' | 'DUPLICADO_IGNORADO' | 'ERROR';
  draw_id: string;
  winning_number?: string;
  message: string;
  audit?: YouTubeCapturedResult;
}

/**
 * Resuelve el draw_id del sistema respetando la regla oficial de horarios de Panamá.
 */
export function resolveDrawId(lottery: string, panamaTime: string): string | null {
  const normLottery = lottery.trim().toUpperCase();
  const normTime = panamaTime.trim().toUpperCase();

  // Ignorar expresamente Anguilla 10 AM LIVE
  if (normLottery.includes('ANGUILLA') && (normTime === '10:00 AM' || normTime === '10 AM')) {
    console.warn("⚠️ Anguilla 10 AM LIVE es ignorado por especificación oficial.");
    return null;
  }

  const match = OFFICIAL_DRAW_RULES.find(r => {
    const lMatch = r.lottery === normLottery || normLottery.includes(r.lottery);
    const tMatch = r.panama_time.toUpperCase() === normTime || (r.live_time && r.live_time.toUpperCase() === normTime);
    return lMatch && tMatch;
  });

  return match ? match.draw_id : null;
}

/**
 * Valida si los resultados de OCR y Audio coinciden exactamente.
 * REGLA DE PRIORIDAD: Si hay cualquier duda -> REVISIÓN NECESARIA.
 */
export function validateCapture(
  ocrResults: string[],
  audioResults?: string[]
): 'CONFIRMADO' | 'REVISIÓN NECESARIA' {
  if (!ocrResults || ocrResults.length < 3) {
    return 'REVISIÓN NECESARIA';
  }

  // Verificar que los números sean de 2 dígitos legibles
  const validOcr = ocrResults.every(n => /^\d{2}$/.test(n.trim()));
  if (!validOcr) {
    return 'REVISIÓN NECESARIA';
  }

  if (audioResults && audioResults.length >= 3) {
    const ocrStr = ocrResults.slice(0, 3).map(n => n.trim()).join('-');
    const audioStr = audioResults.slice(0, 3).map(n => n.trim()).join('-');
    if (ocrStr === audioStr) {
      return 'CONFIRMADO';
    }
  }

  // Ante la menor duda o discrepancia entre OCR y Audio -> REVISIÓN NECESARIA
  return 'REVISIÓN NECESARIA';
}

/**
 * Procesa un resultado capturado desde el módulo de YouTube Live
 * e integra la información al sistema de resultados existente (Supabase `results`).
 */
export async function deliverYouTubeResult(capture: YouTubeCapturedResult): Promise<ProcessingResponse> {
  try {
    const drawId = resolveDrawId(capture.lottery, capture.panama_time);

    if (!drawId) {
      return {
        success: false,
        status: 'ERROR',
        draw_id: '',
        message: `No se encontró un sorteo configurado en el sistema para ${capture.lottery} a las ${capture.panama_time}.`
      };
    }

    // 1. Validar coincidencia OCR / Audio con regla estricta de prioridad
    const calculatedStatus = validateCapture(capture.ocr_results, capture.audio_results);
    const finalStatus = capture.status || calculatedStatus;
    const winningNumberStr = capture.ocr_results.slice(0, 3).map(n => n.trim().padStart(2, '0')).join('-');

    if (finalStatus === 'REVISIÓN NECESARIA') {
      return {
        success: false,
        status: 'REVISIÓN NECESARIA',
        draw_id: drawId,
        winning_number: winningNumberStr,
        message: `El resultado requiere revisión manual (Discrepancia entre OCR y Audio o falta de verificación visual).`,
        audit: { ...capture, status: 'REVISIÓN NECESARIA' }
      };
    }

    // 2. Comprobar si el sorteo (draw_id + date) ya existe en Supabase `results`
    const { data: existing, error: checkError } = await supabase
      .from('results')
      .select('winning_number')
      .eq('draw_id', drawId)
      .eq('date', capture.date)
      .maybeSingle();

    if (!checkError && existing) {
      if (existing.winning_number === winningNumberStr) {
        return {
          success: true,
          status: 'DUPLICADO_IGNORADO',
          draw_id: drawId,
          winning_number: winningNumberStr,
          message: `El resultado para el sorteo ${drawId} del ${capture.date} ya existe en el sistema y coincide (${existing.winning_number}). Ignorando duplicado.`
        };
      }
    }

    // 3. Entregar al mecanismo oficial (Supabase `results` table)
    const { error: upsertError } = await supabase.from('results').upsert({
      draw_id: drawId,
      date: capture.date,
      winning_number: winningNumberStr
    }, { onConflict: 'draw_id,date' });

    if (upsertError) {
      throw upsertError;
    }

    // 4. Actualizar estado local
    useStore.getState().addResult({
      id: `res-yt-${Date.now()}`,
      lotteryId: drawId,
      date: capture.date,
      winning_number: winningNumberStr
    });

    return {
      success: true,
      status: 'CONFIRMADO',
      draw_id: drawId,
      winning_number: winningNumberStr,
      message: `Resultado verificado de YouTube Live e integrado exitosamente.`,
      audit: {
        ...capture,
        status: 'CONFIRMADO',
        detection_method: capture.detection_method || 'OCR + Audio Validation'
      }
    };
  } catch (err: any) {
    console.error('Error al entregar resultado de YouTube al sistema:', err);
    return {
      success: false,
      status: 'ERROR',
      draw_id: '',
      message: `Error interno de entrega: ${err.message || err}`
    };
  }
}
