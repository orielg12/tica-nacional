import { getLocalISODate, getStartOfDayUTC } from '../utils/dateUtils';
import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../utils/supabase';
import { useStore } from '../store/useStore';

export interface WeeklySales {
  day: string;
  sales: number;
  payouts: number;
  covers: number;
}

export interface ModalityStats {
  ventas: number;
  premios: number;
  comisiones: number;
  neto: number;
  tickets: number;
  payoutRatio: number;
}

export interface WeeklyModality {
  day: string;
  sales020: number;
  sales025: number;
  net020: number;
  net025: number;
}

interface DashboardMetrics {
  ventasBrutas: number;
  comisiones: number;
  dineroCubierto: number;
  premiosPagados: number;
  reembolsoRespaldo: number;
  gananciaNeta: number;
  ticketsVendidos: number;
  weeklySales: WeeklySales[];
  monthlySales: WeeklySales[];
  modality020: ModalityStats;
  modality025: ModalityStats;
  weeklyModality: WeeklyModality[];
}

const emptyModalityStats: ModalityStats = {
  ventas: 0,
  premios: 0,
  comisiones: 0,
  neto: 0,
  tickets: 0,
  payoutRatio: 0
};

export function useDashboardData(selectedDateStr?: string) {
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    ventasBrutas: 0,
    comisiones: 0,
    dineroCubierto: 0,
    premiosPagados: 0,
    reembolsoRespaldo: 0,
    gananciaNeta: 0,
    ticketsVendidos: 0,
    weeklySales: [],
    monthlySales: [],
    modality020: emptyModalityStats,
    modality025: emptyModalityStats,
    weeklyModality: []
  });
  const [loading, setLoading] = useState(true);

  // Debounce ref compartido: colapsa N eventos rápidos en una sola llamada
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchMetrics = useCallback(async () => {
    try {
      // Si recibimos fecha, instanciamos a mediodía para evitar saltos UTC
      const today = selectedDateStr ? new Date(`${selectedDateStr}T12:00:00`) : new Date();
      const todayStr = getLocalISODate(today);
      
      const thirtyDaysAgo = new Date(today.getTime());
      thirtyDaysAgo.setDate(today.getDate() - 29);
      const thirtyDaysAgoStr = getLocalISODate(thirtyDaysAgo);

      // Check if logged in user is Sub-Admin to scope metrics to their vendors only
      const storeState = useStore.getState();
      const currentUser = storeState.currentUser;
      const isSubAdmin = currentUser?.isSubAdmin;

      let users = storeState.users;
      if (isSubAdmin && (!users || users.length === 0)) {
        await storeState.fetchUsers();
        users = useStore.getState().users;
      }

      const subAdminVendorIds = isSubAdmin
        ? (users || [])
            .filter(u => u.parentAdminId === currentUser?.username)
            .map(u => u.username)
            .concat(currentUser?.username || '')
        : null;

      // 1. Gross Sales (Tickets de últimos 30 días para el gráfico mensual)
      let query = supabase
        .from('tickets')
        .select('id, created_at, total_amount, status, vendor_id, ticket_numbers(amount)')
        .gte('created_at', getStartOfDayUTC(thirtyDaysAgoStr));

      if (subAdminVendorIds && subAdminVendorIds.length > 0) {
        query = query.in('vendor_id', subAdminVendorIds);
      }

      const { data: ticketsData, error: ticketsErr } = await query;

      if (ticketsErr) throw ticketsErr;

      const validTickets = ticketsData?.filter(t => t.status !== 'cancelled') || [];
      const todaysTickets = validTickets.filter(t => getLocalISODate(new Date(t.created_at)) === todayStr);
      const ventasBrutas = todaysTickets.reduce((acc, t) => acc + parseFloat(t.total_amount || '0'), 0);
      const ticketsVendidos = todaysTickets.length;

      // Extraer Covers y Payouts de últimos 30 días
      // Sub-admins no tienen acceso a cubiertas globales
      const { data: coversData } = isSubAdmin ? { data: [] } : await supabase
        .from('covers')
        .select('created_at, excess_amount')
        .gte('created_at', getStartOfDayUTC(thirtyDaysAgoStr));

      let payoutsQuery = supabase
        .from('payouts')
        .select('created_at, amount, paid_by, ticket_id')
        .gte('created_at', getStartOfDayUTC(thirtyDaysAgoStr));

      if (isSubAdmin) {
        if (validTickets.length > 0) {
          const ticketIds = validTickets.map(t => t.id);
          payoutsQuery = payoutsQuery.in('ticket_id', ticketIds);
        } else {
          // Si el sub-admin no tiene tickets, no tiene premios
          payoutsQuery = payoutsQuery.eq('ticket_id', '00000000-0000-0000-0000-000000000000');
        }
      }

      const { data: payoutsData } = await payoutsQuery;

      // Generar Monthly Sales (Últimos 30 días secuenciales)
      const monthMap: Record<string, { sales: number, payouts: number, covers: number, reimb: number }> = {};
      const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
      
      for (let i = 29; i >= 0; i--) {
         const d = new Date(today);
         d.setDate(today.getDate() - i);
         const dStr = getLocalISODate(d);
         monthMap[dStr] = { sales: 0, payouts: 0, covers: 0, reimb: 0 };
      }

      // Generar mapa de fechas de tickets para atribuir cada premio a la fecha en que se jugó la venta
      const ticketDateMap: Record<string, string> = {};
      (ticketsData || []).forEach(t => {
         ticketDateMap[t.id] = getLocalISODate(new Date(t.created_at));
      });

      validTickets.forEach(t => {
         const dStr = getLocalISODate(new Date(t.created_at));
         if (monthMap[dStr]) monthMap[dStr].sales += parseFloat(t.total_amount || '0');
      });

      (coversData || []).forEach(c => {
         const dStr = getLocalISODate(new Date(c.created_at));
         if (monthMap[dStr]) monthMap[dStr].covers += parseFloat(c.excess_amount || '0');
      });

      (payoutsData || []).forEach(p => {
         // Si el premio tiene ticket_id, atribuir el gasto a la fecha en que se jugó el ticket (ayer u otro día),
         // de modo que no descuente premios viejos de la venta de hoy
         const dStr = (p.ticket_id && ticketDateMap[p.ticket_id]) 
            ? ticketDateMap[p.ticket_id] 
            : getLocalISODate(new Date(p.created_at));

         if (monthMap[dStr]) {
            if (p.paid_by === 'EXTERNAL_BANK_REIMBURSEMENT') {
               monthMap[dStr].reimb += Math.abs(parseFloat(p.amount || '0'));
            } else {
               monthMap[dStr].payouts += parseFloat(p.amount || '0');
            }
         }
      });

      // Extraer los últimos 7 días de monthMap para el gráfico semanal
      const weekMap: Record<string, { sales: number, payouts: number, covers: number, reimb: number }> = {};
      for (let i = 6; i >= 0; i--) {
         const d = new Date(today);
         d.setDate(today.getDate() - i);
         const dStr = getLocalISODate(d);
         weekMap[dStr] = monthMap[dStr] || { sales: 0, payouts: 0, covers: 0, reimb: 0 };
      }

      const weeklySales = Object.entries(weekMap).map(([dateStr, dayMetrics]) => ({
          day: dayNames[new Date(dateStr + 'T12:00:00Z').getDay()],
          sales: dayMetrics.sales,
          payouts: dayMetrics.payouts - dayMetrics.reimb, // Red bar shrinks cleanly
          covers: dayMetrics.covers
      }));

      const monthlySales = Object.entries(monthMap).map(([dateStr, dayMetrics]) => {
          const d = new Date(dateStr + 'T12:00:00Z');
          return {
             day: d.getDate().toString(), // Solo el número del día (ej. "13")
             sales: dayMetrics.sales,
             payouts: dayMetrics.payouts - dayMetrics.reimb,
             covers: dayMetrics.covers
          };
      });

      // 2. Comisiones (Cálculo real por vendedor según su configuración)
      const storeUsers = useStore.getState().users;
      const commissionMap: Record<string, number> = {};
      storeUsers.forEach(u => {
         if (u.username) commissionMap[u.username] = u.commission;
         commissionMap[u.id.toString()] = u.commission;
      });

      // Mapear modalidad por ticket
      const ticketModalityMap: Record<string, '0.20' | '0.25'> = {};
      validTickets.forEach((t: any) => {
        const amt = parseFloat(t.total_amount || '0');
        const numbers = t.ticket_numbers || [];
        const tiempos = numbers.reduce((sum: number, tn: any) => sum + parseFloat(tn.amount || '0'), 0) || 1;
        const isQuarter = (amt / tiempos) >= 0.235;
        ticketModalityMap[t.id] = isQuarter ? '0.25' : '0.20';
      });

      let comisiones = 0;
      let ventas020 = 0, tickets020 = 0, comisiones020 = 0;
      let ventas025 = 0, tickets025 = 0, comisiones025 = 0;

      todaysTickets.forEach((t: any) => {
         const amount = parseFloat(t.total_amount || '0');
         const vid = t.vendor_id?.toString() || 'desconocido';
         const commPerc = commissionMap[vid] || 0;
         const comm = amount * (commPerc / 100);
         comisiones += comm;

         const mod = ticketModalityMap[t.id] || '0.20';
         if (mod === '0.25') {
            ventas025 += amount;
            tickets025 += 1;
            comisiones025 += comm;
         } else {
            ventas020 += amount;
            tickets020 += 1;
            comisiones020 += comm;
         }
      });

      // Premios de hoy separados por modalidad
      let premios020 = 0;
      let premios025 = 0;

      (payoutsData || []).forEach(p => {
        if (p.paid_by === 'EXTERNAL_BANK_REIMBURSEMENT') return;
        const dStr = (p.ticket_id && ticketDateMap[p.ticket_id]) 
          ? ticketDateMap[p.ticket_id] 
          : getLocalISODate(new Date(p.created_at));

        if (dStr === todayStr) {
          const amt = parseFloat(p.amount || '0');
          const mod = (p.ticket_id && ticketModalityMap[p.ticket_id]) || '0.20';
          if (mod === '0.25') {
            premios025 += amt;
          } else {
            premios020 += amt;
          }
        }
      });

      const neto020 = ventas020 - comisiones020 - premios020;
      const neto025 = ventas025 - comisiones025 - premios025;
      const payoutRatio020 = ventas020 > 0 ? (premios020 / ventas020) * 100 : 0;
      const payoutRatio025 = ventas025 > 0 ? (premios025 / ventas025) * 100 : 0;

      const modality020: ModalityStats = {
        ventas: ventas020,
        premios: premios020,
        comisiones: comisiones020,
        neto: neto020,
        tickets: tickets020,
        payoutRatio: payoutRatio020
      };

      const modality025: ModalityStats = {
        ventas: ventas025,
        premios: premios025,
        comisiones: comisiones025,
        neto: neto025,
        tickets: tickets025,
        payoutRatio: payoutRatio025
      };

      // Desglose de últimos 7 días por modalidad
      const weekModalityMap: Record<string, { sales020: number; sales025: number; payouts020: number; payouts025: number }> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const dStr = getLocalISODate(d);
        weekModalityMap[dStr] = { sales020: 0, sales025: 0, payouts020: 0, payouts025: 0 };
      }

      validTickets.forEach((t: any) => {
        const dStr = getLocalISODate(new Date(t.created_at));
        if (weekModalityMap[dStr]) {
          const amt = parseFloat(t.total_amount || '0');
          const mod = ticketModalityMap[t.id] || '0.20';
          if (mod === '0.25') weekModalityMap[dStr].sales025 += amt;
          else weekModalityMap[dStr].sales020 += amt;
        }
      });

      (payoutsData || []).forEach(p => {
        if (p.paid_by === 'EXTERNAL_BANK_REIMBURSEMENT') return;
        const dStr = (p.ticket_id && ticketDateMap[p.ticket_id]) 
          ? ticketDateMap[p.ticket_id] 
          : getLocalISODate(new Date(p.created_at));
        if (weekModalityMap[dStr]) {
          const amt = parseFloat(p.amount || '0');
          const mod = (p.ticket_id && ticketModalityMap[p.ticket_id]) || '0.20';
          if (mod === '0.25') weekModalityMap[dStr].payouts025 += amt;
          else weekModalityMap[dStr].payouts020 += amt;
        }
      });

      const weeklyModality = Object.entries(weekModalityMap).map(([dateStr, d]) => ({
        day: dayNames[new Date(dateStr + 'T12:00:00Z').getDay()],
        sales020: d.sales020,
        sales025: d.sales025,
        net020: d.sales020 - d.payouts020,
        net025: d.sales025 - d.payouts025
      }));

      // 3. Dinero Cubierto y Premios (hoy)
      const dineroCubierto = monthMap[todayStr]?.covers || 0;
      const premiosPagados = monthMap[todayStr]?.payouts || 0;
      const reembolsoRespaldo = monthMap[todayStr]?.reimb || 0;

      // CALCULATE NET PROFIT
      const gananciaNeta = ventasBrutas - comisiones - dineroCubierto - premiosPagados + reembolsoRespaldo;

      if (ticketsData) {
         setMetrics({ 
           ventasBrutas, 
           comisiones, 
           dineroCubierto, 
           premiosPagados, 
           reembolsoRespaldo, 
           gananciaNeta, 
           ticketsVendidos, 
           weeklySales, 
           monthlySales,
           modality020,
           modality025,
           weeklyModality
         });
      }
    } catch (error) {
      console.error("Error loading realtime dashboard data:", error);
    } finally {
      if (loading) setLoading(false);
    }
  }, [selectedDateStr]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dispara fetchMetrics una sola vez por ráfaga de eventos Realtime
  const debouncedFetch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchMetrics();
    }, 800);
  }, [fetchMetrics]);

  useEffect(() => {
    fetchMetrics();

    // 1. Fallback auto-polling (cada 30 segundos) para garantizar sincronía si el WebSocket se interrumpe
    const interval = setInterval(() => {
      fetchMetrics();
    }, 30000);

    // 2. Supabase Realtime live sync — eventos agrupados con debounce compartido
    const channel = supabase.channel('dashboard-live-updates-all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_numbers' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payouts' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'covers' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'results' }, debouncedFetch)
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [selectedDateStr, fetchMetrics, debouncedFetch]);

  return { metrics, loading, refetch: fetchMetrics };
}

