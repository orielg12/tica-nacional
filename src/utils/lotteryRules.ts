export type LotteryDay = 'Lunes' | 'Martes' | 'Miércoles' | 'Jueves' | 'Viernes' | 'Sábado' | 'Domingo';

export interface LotteryConfig {
  id: string;
  name: string;
  hour: number;      // 0-23
  minute: number;    // 0-59
  days?: LotteryDay[]; // Si no esta definido, juega todos los días
  isActive: boolean;
  closeMinutes?: number; // Minutos antes del sorteo para cerrar ventas (default: 10)
}

export const LOTTERY_SCHEDULE: LotteryConfig[] = [
  { id: '9am-granjita', name: 'La Granjita', hour: 9, minute: 0, closeMinutes: 5, isActive: true },
  { id: '10am-granjita', name: 'La Granjita', hour: 10, minute: 0, closeMinutes: 5, isActive: true },
  { id: '11am-granjita', name: 'La Granjita', hour: 11, minute: 0, closeMinutes: 5, isActive: true },
  { id: '11am-primera', name: 'La Primera', hour: 11, minute: 0, isActive: true },
  { id: '12pm-honduras', name: 'Honduras', hour: 12, minute: 0, isActive: true },
  { id: '12pm-granjita', name: 'La Granjita', hour: 12, minute: 0, closeMinutes: 5, isActive: true },
  { id: '1pm-nica', name: 'Nica', hour: 12, minute: 0, isActive: true },
  { id: '120-anguilla', name: 'Anguilla', hour: 12, minute: 0, isActive: true },
  { id: '1230-florida', name: 'Florida', hour: 12, minute: 30, isActive: true },
  { id: '1pm-granjita', name: 'La Granjita', hour: 13, minute: 0, closeMinutes: 5, isActive: true },
  { id: '1330-newyork', name: 'New York', hour: 13, minute: 30, isActive: true },
  { id: '2pm-granjita', name: 'La Granjita', hour: 14, minute: 0, closeMinutes: 5, isActive: true },
  { id: '2pm-monazo', name: 'Monazo', hour: 14, minute: 0, isActive: true },
  { id: '3pm-granjita', name: 'La Granjita', hour: 15, minute: 0, closeMinutes: 5, isActive: true },
  { id: '3pm-nacional', name: 'Nacional', hour: 15, minute: 0, days: ['Miércoles', 'Domingo'], isActive: true },
  { id: '4pm-granjita', name: 'La Granjita', hour: 16, minute: 0, closeMinutes: 5, isActive: true },
  { id: '4pm-nica', name: 'Nica', hour: 16, minute: 0, isActive: true },
  { id: '4pm-honduras', name: 'Honduras', hour: 16, minute: 0, isActive: true },
  { id: '5pm-granjita', name: 'La Granjita', hour: 17, minute: 0, closeMinutes: 5, isActive: true },
  { id: '170-anguilla', name: 'Anguilla', hour: 17, minute: 0, isActive: true },
  { id: '530pm-monazo', name: 'Monazo', hour: 17, minute: 30, isActive: true },
  { id: '6pm-granjita', name: 'La Granjita', hour: 18, minute: 0, closeMinutes: 5, isActive: true },
  { id: '6pm-primera', name: 'La Primera', hour: 18, minute: 0, isActive: true },
  { id: '7pm-granjita', name: 'La Granjita', hour: 19, minute: 0, closeMinutes: 5, isActive: true },
  { id: '7pm-nica', name: 'Nica', hour: 19, minute: 0, days: ['Sábado', 'Domingo'], isActive: true },
  { id: '200-anguilla', name: 'Anguilla', hour: 20, minute: 0, isActive: true },
  { id: '830pm-monazo', name: 'Monazo', hour: 20, minute: 30, days: ['Lunes', 'Miércoles', 'Jueves', 'Sábado'], isActive: true },
  { id: '830pm-tica', name: 'Tica', hour: 20, minute: 30, days: ['Martes', 'Viernes', 'Domingo'], isActive: true },
  { id: '2045-florida', name: 'Florida', hour: 20, minute: 45, isActive: true },
  { id: '2130-newyork', name: 'New York', hour: 21, minute: 30, isActive: true },
  { id: '10pm-nica', name: 'Nica', hour: 22, minute: 0, isActive: true },
  { id: '10pm-honduras', name: 'Honduras', hour: 22, minute: 0, isActive: true },
];

/**
 * Retorna true si una lotería o su id corresponde a La Granjita
 */
export function isGranjitaLottery(lottery: LotteryConfig | string | null | undefined): boolean {
  if (!lottery) return false;
  const name = typeof lottery === 'string' ? lottery : lottery.name;
  const id = typeof lottery === 'string' ? lottery : lottery.id;
  const hasNameMatch = Boolean(name && name.toLowerCase().includes('granjita'));
  const hasIdMatch = Boolean(id && id.toLowerCase().includes('granjita'));
  return hasNameMatch || hasIdMatch;
}

/**
 * Retorna las loterías que aún están disponibles para vender.
 * Se cierran automáticamente 10 minutos antes de su hora programada.
 */
export function getAvailableLotteries(dateStr?: string, masterSchedule?: LotteryConfig[]): LotteryConfig[] {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  
  let targetDayName: LotteryDay;
  let isFutureDate = false;
  
  if (dateStr && dateStr !== todayStr) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0]);
      const m = parseInt(parts[1]) - 1;
      const d = parseInt(parts[2]);
      const targetDate = new Date(y, m, d);
      const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      if (targetDate > todayDate) {
        isFutureDate = true;
      }
      const currentDays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      targetDayName = currentDays[targetDate.getDay()] as LotteryDay;
    } else {
      const currentDays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      targetDayName = currentDays[now.getDay()] as LotteryDay;
    }
  } else {
    const currentDays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    targetDayName = currentDays[now.getDay()] as LotteryDay;
  }

  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const totalMinutesNow = currentHour * 60 + currentMinute;

  const scheduleToUse = masterSchedule || LOTTERY_SCHEDULE;

  return scheduleToUse.filter(lottery => {
    // 1. Validar si está inactiva por admin
    if (!lottery.isActive) return false;

    // 2. Validar si juega en el día seleccionado
    if (lottery.days && !lottery.days.includes(targetDayName)) {
      return false;
    }

    // 3. Validar corte de min (default 10) SOLO si la fecha seleccionada es hoy
    if (!isFutureDate) {
      const lotteryTotalMinutes = lottery.hour * 60 + lottery.minute;
      const closingTimeMinutes = lotteryTotalMinutes - (lottery.closeMinutes ?? 10);
      
      if (totalMinutesNow >= closingTimeMinutes) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Helper: Convierte la hora de un objeto lottery a un formato am/pm legible
 */
export function formatLotteryTime(hour: number, minute: number): string {
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h = hour % 12 || 12;
  const m = minute.toString().padStart(2, '0');
  return `${h}:${m} ${ampm}`;
}
