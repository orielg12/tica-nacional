import { getLocalISODate, getStartOfDayUTC } from '../utils/dateUtils';
import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabase';
import { useStore } from '../store/useStore';

export interface WeeklySales {
  day: string;
  sales: number;
  payouts: number;
  covers: number;
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
}

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
    monthlySales: []
  });
  const [loading, setLoading] = useState(true);

  const fetchMetrics = async () => {
    try {
      // Si recibimos fecha, instanciamos a mediodía para evitar saltos UTC
      const today = selectedDateStr ? new Date(`${selectedDateStr}T12:00:00`) : new Date();
      const todayStr = getLocalISODate(today);
      
      const thirtyDaysAgo = new Date(today.getTime());
      thirtyDaysAgo.setDate(today.getDate() - 29);
      const thirtyDaysAgoStr = getLocalISODate(thirtyDaysAgo);

      // 1. Gross Sales (Tickets de últimos 30 días para el gráfico mensual)
      const { data: ticketsData, error: ticketsErr } = await supabase
        .from('tickets')
        .select('created_at, total_amount, status, vendor_id')
        .gte('created_at', getStartOfDayUTC(thirtyDaysAgoStr));

      if (ticketsErr) throw ticketsErr;

      const validTickets = ticketsData?.filter(t => t.status !== 'cancelled') || [];
      const todaysTickets = validTickets.filter(t => getLocalISODate(new Date(t.created_at)) === todayStr);
      const ventasBrutas = todaysTickets.reduce((acc, t) => acc + parseFloat(t.total_amount || '0'), 0);
      const ticketsVendidos = todaysTickets.length;

      // Extraer Covers y Payouts de últimos 30 días
      const { data: coversData } = await supabase
        .from('covers')
        .select('created_at, excess_amount')
        .gte('created_at', getStartOfDayUTC(thirtyDaysAgoStr));

      const { data: payoutsData } = await supabase
        .from('payouts')
        .select('created_at, amount, paid_by')
        .gte('created_at', getStartOfDayUTC(thirtyDaysAgoStr));

      // Generar Monthly Sales (Últimos 30 días secuenciales)
      const monthMap: Record<string, { sales: number, payouts: number, covers: number, reimb: number }> = {};
      const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
      
      for (let i = 29; i >= 0; i--) {
         const d = new Date(today);
         d.setDate(today.getDate() - i);
         const dStr = getLocalISODate(d);
         monthMap[dStr] = { sales: 0, payouts: 0, covers: 0, reimb: 0 };
      }

      validTickets.forEach(t => {
         const dStr = getLocalISODate(new Date(t.created_at));
         if (monthMap[dStr]) monthMap[dStr].sales += parseFloat(t.total_amount || '0');
      });

      (coversData || []).forEach(c => {
         const dStr = getLocalISODate(new Date(c.created_at));
         if (monthMap[dStr]) monthMap[dStr].covers += parseFloat(c.excess_amount || '0');
      });

      (payoutsData || []).forEach(p => {
         const dStr = getLocalISODate(new Date(p.created_at));
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
      const users = useStore.getState().users;
      const commissionMap: Record<string, number> = {};
      users.forEach(u => {
         if (u.username) commissionMap[u.username] = u.commission;
         commissionMap[u.id.toString()] = u.commission;
      });

      let comisiones = 0;
      todaysTickets.forEach(t => {
         const amount = parseFloat(t.total_amount || '0');
         const vid = t.vendor_id?.toString() || 'desconocido';
         const commPerc = commissionMap[vid] || 0;
         comisiones += amount * (commPerc / 100);
      });

      // 3. Dinero Cubierto y Premios (hoy)
      const dineroCubierto = monthMap[todayStr]?.covers || 0;
      const premiosPagados = monthMap[todayStr]?.payouts || 0;
      const reembolsoRespaldo = monthMap[todayStr]?.reimb || 0;

      // CALCULATE NET PROFIT
      const gananciaNeta = ventasBrutas - comisiones - dineroCubierto - premiosPagados + reembolsoRespaldo;

      if (ticketsData) {
         setMetrics({ ventasBrutas, comisiones, dineroCubierto, premiosPagados, reembolsoRespaldo, gananciaNeta, ticketsVendidos, weeklySales, monthlySales });
      }
    } catch (error) {
      console.error("Error loading realtime dashboard data:", error);
    } finally {
      if (loading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, [selectedDateStr]);

  return { metrics, loading, refetch: fetchMetrics };
}
