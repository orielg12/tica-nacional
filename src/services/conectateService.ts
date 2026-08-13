/**
 * SERVICIO OFICIAL DE CONSULTA Y VERIFICACIÓN DE RESULTADOS CONECTATE
 * 
 * FUENTES ÚNICAS AUTORIZADAS:
 * - ANGUILLA: https://loterias.conectate.com.do/anguilla/
 * - LA PRIMERA: https://loterias.conectate.com.do/la-primera/
 * - FLORIDA Y NEW YORK: https://loterias.conectate.com.do/americanas/
 */

export interface DrawMappingRule {
  lottery: 'ANGUILLA' | 'LA PRIMERA' | 'FLORIDA' | 'NEW YORK';
  panama_time: string;       // Horario de Panamá (Fijo)
  conectate_url: string;     // URL única oficial de Conectate
  conectate_label: string;   // Etiqueta oficial en Conectate (ej: "Anguilla 1 PM", "Día", "Noche")
  live_time?: string;        // Para YouTube LIVE (+1h en Anguilla)
  draw_id: string;
}

/**
 * TABLA DE REGLAS Y MAPEOS OFICIALES DE HORARIOS PANAMÁ A CONECTATE Y YOUTUBE LIVE
 */
export const OFFICIAL_DRAW_RULES: DrawMappingRule[] = [
  // LA PRIMERA (https://loterias.conectate.com.do/la-primera/)
  {
    lottery: 'LA PRIMERA',
    panama_time: '11:00 AM',
    conectate_url: 'https://loterias.conectate.com.do/la-primera/',
    conectate_label: '11:00 AM / Día',
    draw_id: '11am-primera'
  },
  {
    lottery: 'LA PRIMERA',
    panama_time: '6:00 PM',
    conectate_url: 'https://loterias.conectate.com.do/la-primera/',
    conectate_label: '6:00 PM / Noche',
    draw_id: '6pm-primera'
  },

  // ANGUILLA (https://loterias.conectate.com.do/anguilla/)
  // 10 AM LIVE -> IGNORAR por especificación.
  {
    lottery: 'ANGUILLA',
    panama_time: '12:00 PM',
    live_time: '1:00 PM',
    conectate_url: 'https://loterias.conectate.com.do/anguilla/',
    conectate_label: 'Anguilla 1 PM',
    draw_id: '120-anguilla'
  },
  {
    lottery: 'ANGUILLA',
    panama_time: '5:00 PM',
    live_time: '6:00 PM',
    conectate_url: 'https://loterias.conectate.com.do/anguilla/',
    conectate_label: 'Anguilla 6 PM',
    draw_id: '170-anguilla'
  },
  {
    lottery: 'ANGUILLA',
    panama_time: '8:00 PM',
    live_time: '9:00 PM',
    conectate_url: 'https://loterias.conectate.com.do/anguilla/',
    conectate_label: 'Anguilla 9 PM',
    draw_id: '200-anguilla'
  },

  // FLORIDA (https://loterias.conectate.com.do/americanas/)
  {
    lottery: 'FLORIDA',
    panama_time: '12:30 PM',
    conectate_url: 'https://loterias.conectate.com.do/americanas/',
    conectate_label: 'Florida Día / Tarde (12:30 PM)',
    draw_id: '1230-florida'
  },
  {
    lottery: 'FLORIDA',
    panama_time: '8:45 PM',
    conectate_url: 'https://loterias.conectate.com.do/americanas/',
    conectate_label: 'Florida Noche (8:45 PM)',
    draw_id: '2045-florida'
  },

  // NEW YORK (https://loterias.conectate.com.do/americanas/)
  {
    lottery: 'NEW YORK',
    panama_time: '1:30 PM',
    conectate_url: 'https://loterias.conectate.com.do/americanas/',
    conectate_label: 'New York Tarde / Día (1:30 PM)',
    draw_id: '1330-newyork'
  },
  {
    lottery: 'NEW YORK',
    panama_time: '9:30 PM',
    conectate_url: 'https://loterias.conectate.com.do/americanas/',
    conectate_label: 'New York Noche (9:30 PM)',
    draw_id: '2130-newyork'
  }
];

export interface ConectateResultFetch {
  draw_id: string;
  lottery: string;
  panama_time: string;
  winning_number?: string;
  status: 'CONFIRMADO' | 'REVISIÓN NECESARIA';
  source_url: string;
  fetched_at: string;
  notes?: string;
}

/**
 * Determina la regla oficial de sorteo basada únicamente en la lotería y hora de Panamá.
 */
export function getOfficialRule(lottery: string, panamaTime: string): DrawMappingRule | null {
  const normLottery = lottery.trim().toUpperCase();
  const normTime = panamaTime.trim().toUpperCase();

  const rule = OFFICIAL_DRAW_RULES.find(r => 
    (r.lottery === normLottery || normLottery.includes(r.lottery)) &&
    (r.panama_time.toUpperCase() === normTime || (r.live_time && r.live_time.toUpperCase() === normTime))
  );

  return rule || null;
}
