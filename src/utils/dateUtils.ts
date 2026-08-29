/**
 * dateUtils.ts
 * Utilidad global para el manejo de fechas basado en la zona horaria local del dispositivo.
 */

export function getLocalISODate(dateParam?: Date): string {
  const d = dateParam || new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getStartOfDayUTC(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0).toISOString();
}

export function getEndOfDayUTC(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999).toISOString();
}

export function getEndOfLocalDayUTC(dateStr: string): string {
  // Start of the local day in UTC (midnight)
  const startUTC = getStartOfDayUTC(dateStr);
  // Add 24h and subtract 1ms to get 23:59:59.999 of the same local day in UTC
  const endUTC = new Date(new Date(startUTC).getTime() + 24 * 60 * 60 * 1000 - 1).toISOString();
  return endUTC;
}

// Panama timezone helpers (UTC‑5, no DST)
export function getPanamaLocalISODate(dateParam?: Date | string): string {
  const d = dateParam ? new Date(dateParam) : new Date();
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Panama',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(d);
  } catch (e) {
    // Fallback if Intl timeZone is unavailable
    const utcMs = d.getTime();
    const panamaMs = utcMs - 5 * 60 * 60 * 1000;
    const pDate = new Date(panamaMs);
    const year = pDate.getUTCFullYear();
    const month = String(pDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(pDate.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}


export function getStartOfPanamaDayUTC(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  // Panama midnight is 05:00 UTC (UTC‑5)
  return new Date(Date.UTC(year, month - 1, day, 5, 0, 0, 0)).toISOString();
}

export function getEndOfPanamaDayUTC(dateStr: string): string {
  // End of Panama day = start + 24h - 1ms
  const [year, month, day] = dateStr.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, 5, 0, 0, 0));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return end.toISOString();
}
