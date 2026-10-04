import { getLocalISODate, getStartOfDayUTC, getEndOfDayUTC } from '../../utils/dateUtils';
import { useState, useEffect, useCallback } from 'react';
import { useDashboardData } from '../../hooks/useDashboardData';
import { DollarSign, Tag, Percent, Trophy, ShieldAlert, Flame, RefreshCw } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { supabase } from '../../utils/supabase';

/** Devuelve color de fondo, texto y borde según el monto apostado en el número */
function getHotNumberStyle(totalAmount: number, maxAmount: number): { bg: string; border: string; textColor: string; badge: string } {
  const ratio = maxAmount > 0 ? totalAmount / maxAmount : 0;
  if (ratio >= 0.75) return { bg: '#fef2f2', border: '#ef4444', textColor: '#b91c1c', badge: '#dc2626' };       // 🔴 Rojo — crítico
  if (ratio >= 0.50) return { bg: '#fff7ed', border: '#f97316', textColor: '#c2410c', badge: '#ea580c' };       // 🟠 Naranja — alto
  if (ratio >= 0.25) return { bg: '#fefce8', border: '#eab308', textColor: '#a16207', badge: '#ca8a04' };       // 🟡 Amarillo — medio
  return { bg: '#f0fdf4', border: '#22c55e', textColor: '#15803d', badge: '#16a34a' };                          // 🟢 Verde — bajo
}

export default function Dashboard() {
  const [activeDate, setActiveDate] = useState(getLocalISODate());
  const { metrics, refetch } = useDashboardData(activeDate);
  const store = useStore();

  const [chartView, setChartView] = useState<'weekly' | 'monthly'>('weekly');

  const [upcomingDrawsHot, setUpcomingDrawsHot] = useState<{
    drawId: string;
    drawName: string;
    drawTime: string;
    topNumbers: { number: string; viles: number; totalAmount: number; ticketsCount: number }[];
  }[]>([]);
  const [loadingHotNumbers, setLoadingHotNumbers] = useState(false);

  const fetchHotNumbers = async (isInitial = false) => {
    if (isInitial) setLoadingHotNumbers(true);
    try {
      const isSubAdmin = store.currentUser?.isSubAdmin;
      const subAdminVendorIds = isSubAdmin
        ? store.users
            .filter(u => u.parentAdminId === store.currentUser?.username)
            .map(u => u.username)
            .concat(store.currentUser?.username || '')
        : null;

      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const isToday = activeDate === getLocalISODate();

      // 1. Obtener todas las loterías activas configuradas
      const availableLotteries = store.lotteriesMaster.filter(l => l.isActive);

      // Si es hoy, filtrar por las loterías que aún no han cerrado
      let targetLotteries = availableLotteries;
      if (isToday) {
        const upcoming = availableLotteries.filter(l => {
          const lotMinutes = l.hour * 60 + l.minute - (l.closeMinutes ?? 10);
          return lotMinutes > currentMinutes;
        });
        if (upcoming.length > 0) {
          targetLotteries = upcoming;
        }
      }

      if (targetLotteries.length === 0) {
        setUpcomingDrawsHot([]);
        return;
      }

      const startOfDay = getStartOfDayUTC(activeDate);
      const endOfDay = getEndOfDayUTC(activeDate);
      const targetIds = targetLotteries.map(l => l.id);

      const { data, error } = await supabase
        .from('ticket_numbers')
        .select('number_played, amount, draw_id, ticket:ticket_id(id, status, total_amount, vendor_id)')
        .in('draw_id', targetIds)
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay);

      if (error) {
        console.error("Error consultando jugadas de números altos:", error);
      }

      const validPlays = (!error && data) ? data.filter((tn: any) => {
        if (tn.ticket?.status === 'cancelled') return false;
        if (isSubAdmin && subAdminVendorIds && subAdminVendorIds.length > 0) {
          return subAdminVendorIds.includes(tn.ticket?.vendor_id);
        }
        return true;
      }) : [];

      const resultsByDraw: typeof upcomingDrawsHot = [];

      // Evaluar cada lotería objetivo
      targetLotteries.forEach(lotto => {
        const drawPlays = validPlays.filter((tn: any) => tn.draw_id === lotto.id);
        if (drawPlays.length === 0) return; // Solo mostrar sorteos con jugadas procesadas

        const countMap: Record<string, { viles: number; totalAmount: number; ticketsCount: number }> = {};

        drawPlays.forEach((tn: any) => {
          const num = String(tn.number_played).padStart(2, '0');
          const viles = parseFloat(tn.amount || '0');
          const ticketMode = Number(store.saleMode) || 0.20;
          const amt = viles * ticketMode;

          if (!countMap[num]) countMap[num] = { viles: 0, totalAmount: 0, ticketsCount: 0 };
          countMap[num].viles += viles;
          countMap[num].totalAmount += amt;
          countMap[num].ticketsCount += 1;
        });

        // Ordenar por viles / dinero apostado
        const topNumbers = Object.entries(countMap)
          .map(([num, d]) => ({ number: num, viles: d.viles, totalAmount: d.totalAmount, ticketsCount: d.ticketsCount }))
          .filter(item => item.viles > 0)
          .sort((a, b) => b.totalAmount - a.totalAmount)
          .slice(0, 8);

        if (topNumbers.length > 0) {
          const timeStr = `${lotto.hour > 12 ? lotto.hour - 12 : (lotto.hour === 0 ? 12 : lotto.hour)}:${lotto.minute.toString().padStart(2, '0')} ${lotto.hour >= 12 ? 'PM' : 'AM'}`;

          resultsByDraw.push({
            drawId: lotto.id,
            drawName: lotto.name,
            drawTime: timeStr,
            topNumbers
          });
        }
      });

      const sortedDraws = resultsByDraw.sort((a, b) => {
        const parseTime = (t: string) => {
          const [time, meridiem] = t.split(' ');
          const [h, m] = time.split(':').map(Number);
          const hour24 = meridiem === 'PM' && h !== 12 ? h + 12 : meridiem === 'AM' && h === 12 ? 0 : h;
          return hour24 * 60 + m;
        };
        return parseTime(a.drawTime) - parseTime(b.drawTime);
      });
      setUpcomingDrawsHot(sortedDraws.slice(0, 3));
    } catch (e) {
      console.error("Error fetching automatic upcoming draw hot numbers:", e);
    } finally {
      setLoadingHotNumbers(false);
    }
  };

  const [lastRefreshTime, setLastRefreshTime] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleManualRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([fetchHotNumbers(true), refetch()]);
    setLastRefreshTime(new Date());
    setIsRefreshing(false);
  }, [refetch]);

  useEffect(() => {
    store.fetchUsers();
    store.fetchLotteries();
    fetchHotNumbers(true);

    // Polling de respaldo cada 30 segundos (sin parpadeo)
    const timer = setInterval(() => {
      fetchHotNumbers(false);
      refetch();
      setLastRefreshTime(new Date());
    }, 30000);

    // Realtime WebSocket (actualización instantánea silenciosa en segundo plano)
    const channel = supabase
      .channel('dashboard-realtime-monitor-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
        refetch();
        fetchHotNumbers(false);
        setLastRefreshTime(new Date());
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_numbers' }, () => {
        refetch();
        fetchHotNumbers(false);
        setLastRefreshTime(new Date());
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payouts' }, () => {
        refetch();
        setLastRefreshTime(new Date());
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'results' }, () => {
        refetch();
        fetchHotNumbers(false);
        setLastRefreshTime(new Date());
      })
      .subscribe();

    return () => {
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [activeDate, refetch]);

  const getDayNameFromDateStr = (dateStr: string) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return days[date.getDay()];
  };

  const selectedDayName = getDayNameFromDateStr(activeDate);
  const activelotteriesCount = store.lotteriesMaster.filter(l => {
    if (!l.isActive) return false;
    if (!l.days || l.days.length === 0) return true; // Si no hay días definidos, juega todos los días
    return l.days.includes(selectedDayName as any);
  }).length;

  const isSubAdmin = store.currentUser?.isSubAdmin;
  const activeVendorsCount = store.users.filter(u => {
    if (u.status !== 'Activo' || u.role !== 'Vendedor') return false;
    if (isSubAdmin) return u.parentAdminId === store.currentUser?.username;
    return true;
  }).length;

  const chartData = chartView === 'weekly' ? metrics.weeklySales : metrics.monthlySales;

  return (
    <div style={{ padding: '2rem', backgroundColor: '#f4f7f6', minHeight: '100%', color: '#333' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: '1rem 1.5rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1.5rem' }}>
         <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
           <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#17233D' }}>Dashboard</h2>
           <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', backgroundColor: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', padding: '0.15rem 0.5rem', borderRadius: '10px', fontWeight: 'bold' }}>
             <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#22c55e', display: 'inline-block', animation: 'pulse 2s infinite' }}></span>
             Tiempo Real
           </span>
         </div>
         <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
              Actualizado: {lastRefreshTime.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.35rem 0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0', backgroundColor: isRefreshing ? '#f1f5f9' : '#fff', color: '#475569', fontSize: '0.78rem', fontWeight: 'bold', cursor: isRefreshing ? 'default' : 'pointer', outline: 'none' }}
            >
              <RefreshCw size={13} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
              {isRefreshing ? 'Actualizando...' : 'Actualizar'}
            </button>
            <input 
              type="date" 
              style={{ padding: '0.4rem 0.8rem', borderRadius: '4px', border: '1px solid #ddd', fontSize: '0.85rem', outline: 'none' }} 
              value={activeDate}
              onChange={(e) => setActiveDate(e.target.value)}
            />
         </div>
      </div>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>

      {/* Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <MetricCard title="VENTAS DEL DÍA" value={`$${metrics.ventasBrutas.toFixed(2)}`} icon={<DollarSign size={18}/>} color="#3399ff" />
        <MetricCard title="GANANCIA NETA" value={`$${metrics.gananciaNeta.toFixed(2)}`} icon={<DollarSign size={18}/>} color={metrics.gananciaNeta >= 0 ? "#28a745" : "#dc3545"} />
        <MetricCard title="TICKETS VENDIDOS" value={metrics.ticketsVendidos.toString()} icon={<Tag size={18}/>} color="#6c757d" />
        <MetricCard title="COMISIONES" value={`$${metrics.comisiones.toFixed(2)}`} icon={<Percent size={18}/>} color="#ffc107" />
        <MetricCard title="PREMIOS PAGADOS" value={`$${metrics.premiosPagados.toFixed(2)}`} icon={<Trophy size={18}/>} color="#dc3545" />
        <MetricCard title="DINERO CUBIERTO" value={`$${metrics.dineroCubierto.toFixed(2)}`} icon={<ShieldAlert size={18}/>} color="#ea868f" />
        <MetricCard title="REEMBOLSOS BANCA" value={`$${metrics.reembolsoRespaldo.toFixed(2)}`} icon={<ShieldAlert size={18}/>} color="#10b981" />
      </div>

      {/* MONITOR DE NÚMEROS ALTOS POR SORTEO PRÓXIMO / ACTIVO */}
      <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '1.2rem 1.5rem', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1.5rem', border: '1px solid #e2e8f0' }}>
         <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
               <Flame size={20} color="#ef4444" />
               <h4 style={{ margin: 0, fontSize: '1rem', color: '#17233D', fontWeight: 'bold' }}>
                  Monitor de Números Altos (Jugadas Procesadas)
               </h4>
            </div>
            <span style={{ fontSize: '0.75rem', backgroundColor: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', padding: '0.2rem 0.6rem', borderRadius: '12px', fontWeight: 'bold' }}>
               ● Solo sorteos activos con viles apostados
            </span>
         </div>

         {loadingHotNumbers ? (
            <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: '1rem', textAlign: 'center' }}>Cargando jugadas procesadas...</div>
         ) : upcomingDrawsHot.length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: '1rem', textAlign: 'center', fontStyle: 'italic' }}>
               Sin jugadas procesadas en sorteos activos por vencer.
            </div>
         ) : (
            <div>
               {/* Leyenda de colores */}
               <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', flexWrap: 'wrap', fontSize: '0.7rem', fontWeight: 'bold', alignItems: 'center' }}>
                 <span style={{ color: '#6b7280' }}>Nivel de riesgo:</span>
                 <span style={{ backgroundColor: '#f0fdf4', border: '1px solid #22c55e', color: '#15803d', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>🟢 Bajo</span>
                 <span style={{ backgroundColor: '#fefce8', border: '1px solid #eab308', color: '#a16207', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>🟡 Medio</span>
                 <span style={{ backgroundColor: '#fff7ed', border: '1px solid #f97316', color: '#c2410c', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>🟠 Alto</span>
                 <span style={{ backgroundColor: '#fef2f2', border: '1px solid #ef4444', color: '#b91c1c', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>🔴 Crítico</span>
               </div>
               <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(260px, 1fr))`, gap: '1rem' }}>
                 {upcomingDrawsHot.map((drawData) => {
                   const maxAmt = Math.max(...drawData.topNumbers.map(n => n.totalAmount), 1);
                   return (
                     <div key={drawData.drawId} style={{ backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0.8rem' }}>
                       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.4rem', marginBottom: '0.6rem' }}>
                         <span style={{ fontWeight: 'bold', fontSize: '0.85rem', color: '#0d9488' }}>{drawData.drawName}</span>
                         <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#64748b', backgroundColor: '#fff', padding: '0.1rem 0.4rem', borderRadius: '4px', border: '1px solid #e2e8f0' }}>{drawData.drawTime}</span>
                       </div>

                       {drawData.topNumbers.length === 0 ? (
                         <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0, fontStyle: 'italic' }}>Sin apuntes aún para este sorteo...</p>
                       ) : (
                         <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                           {drawData.topNumbers.map((numItem, nIdx) => {
                             const style = getHotNumberStyle(numItem.totalAmount, maxAmt);
                             const barWidth = maxAmt > 0 ? Math.max((numItem.totalAmount / maxAmt) * 100, 4) : 4;
                             return (
                               <div key={nIdx} style={{ position: 'relative', overflow: 'hidden', backgroundColor: style.bg, padding: '0.4rem 0.6rem', borderRadius: '6px', border: `1px solid ${style.border}` }}>
                                 {/* Barra de progreso de fondo */}
                                 <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${barWidth}%`, backgroundColor: style.border, opacity: 0.12 }} />
                                 <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                   <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                     <span style={{ fontSize: '0.65rem', fontWeight: 'bold', backgroundColor: style.badge, color: '#fff', width: '18px', height: '18px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{nIdx + 1}</span>
                                     <span style={{ fontFamily: 'monospace', fontWeight: 'bold', fontSize: '1.05rem', color: style.textColor, letterSpacing: '1px' }}>{numItem.number}</span>
                                   </div>
                                   <div style={{ textAlign: 'right' }}>
                                     <span style={{ fontSize: '0.88rem', fontWeight: 'bold', color: style.textColor }}>${numItem.totalAmount.toFixed(2)}</span>
                                     <span style={{ fontSize: '0.67rem', color: '#64748b', marginLeft: '0.3rem' }}>({numItem.viles}v / {numItem.ticketsCount}t)</span>
                                   </div>
                                 </div>
                               </div>
                             );
                           })}
                         </div>
                       )}
                     </div>
                   );
                 })}
               </div>
            </div>
         )}
      </div>

      {/* Content Sections */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
         
         {/* Dynamic Chart */}
         <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '1.5rem', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#17233D' }}>
                  {chartView === 'weekly' ? 'Rendimiento Últimos 7 Días' : 'Rendimiento Últimos 30 Días'}
                </h4>
                <div style={{ display: 'flex', backgroundColor: '#f1f5f9', borderRadius: '6px', padding: '2px' }}>
                  <button 
                    onClick={() => setChartView('weekly')} 
                    style={{ 
                      padding: '0.25rem 0.5rem', 
                      fontSize: '0.7rem', 
                      fontWeight: 'bold', 
                      border: 'none', 
                      borderRadius: '4px', 
                      cursor: 'pointer', 
                      backgroundColor: chartView === 'weekly' ? '#fff' : 'transparent', 
                      color: chartView === 'weekly' ? '#0f172a' : '#64748b',
                      boxShadow: chartView === 'weekly' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                      outline: 'none'
                    }}
                  >
                    7 Días
                  </button>
                  <button 
                    onClick={() => setChartView('monthly')} 
                    style={{ 
                      padding: '0.25rem 0.5rem', 
                      fontSize: '0.7rem', 
                      fontWeight: 'bold', 
                      border: 'none', 
                      borderRadius: '4px', 
                      cursor: 'pointer', 
                      backgroundColor: chartView === 'monthly' ? '#fff' : 'transparent', 
                      color: chartView === 'monthly' ? '#0f172a' : '#64748b',
                      boxShadow: chartView === 'monthly' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                      outline: 'none'
                    }}
                  >
                    30 Días
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.8rem', fontSize: '0.7rem', fontWeight: 'bold' }}>
                 <span style={{ color: '#3b82f6' }}>■ Ingresos</span>
                 <span style={{ color: '#ef4444' }}>■ Premios</span>
                 <span style={{ color: '#eab308' }}>■ Respaldo</span>
              </div>
            </div>
            
            <div style={{ width: '100%', height: '200px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '1rem', gap: chartView === 'weekly' ? '0.5rem' : '2px' }}>
               {chartData.length > 0 ? (() => {
                  const maxVal = Math.max(...chartData.map(d => Math.max(d.sales, d.payouts, d.covers)), 1);
                  return chartData.map((dayData, i) => {
                     const hSales = Math.max((dayData.sales / maxVal) * 100, 1);
                     const hPayouts = Math.max((dayData.payouts / maxVal) * 100, 1);
                     const hCovers = Math.max((dayData.covers / maxVal) * 100, 1);
                     
                     return (
                       <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'row', alignItems: 'flex-end', height: '100%', justifyContent: 'center', gap: '1px' }}>
                          
                          {/* Barra Ventas */}
                          <div style={{ width: '35%', height: `${hSales}%`, backgroundColor: hSales > 1 ? '#3b82f6' : 'transparent', borderRadius: '1px 1px 0 0', position: 'relative' }} title={`Ventas: $${dayData.sales.toFixed(2)}`}>
                              {chartView === 'weekly' && hSales > 15 && <span style={{ position: 'absolute', top: '-16px', left: '50%', transform: 'translateX(-50%)', fontSize: '0.6rem', color: '#3b82f6', fontWeight: 'bold' }}>{dayData.sales.toFixed(0)}</span>}
                          </div>
                          
                          {/* Barra Premios */}
                          <div style={{ width: '30%', height: `${hPayouts}%`, backgroundColor: hPayouts > 1 ? '#ef4444' : 'transparent', borderRadius: '1px 1px 0 0', position: 'relative', transition: 'height 0.4s' }} title={`Premios: $${dayData.payouts.toFixed(2)}`}>
                          </div>

                          {/* Barra Covers */}
                          <div style={{ width: '30%', height: `${hCovers}%`, backgroundColor: hCovers > 1 ? '#eab308' : 'transparent', borderRadius: '1px 1px 0 0', position: 'relative', transition: 'height 0.4s' }} title={`Respaldo: $${dayData.covers.toFixed(2)}`}>
                          </div>

                       </div>
                     );
                  });
               })() : (
                 <div style={{ width: '100%', textAlign: 'center', color: '#94a3b8', alignSelf: 'center' }}>Extrayendo gráfica...</div>
               )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#6c757d', marginTop: '0.8rem', padding: '0 0.2rem' }}>
               {chartData.length > 0 ? chartData.map((dayData, i) => {
                  const shouldShowLabel = chartView === 'weekly' || i % 5 === 0 || i === chartData.length - 1;
                  return (
                     <span key={i} style={{ flex: 1, textAlign: 'center', fontWeight: 'bold', visibility: shouldShowLabel ? 'visible' : 'hidden' }}>{dayData.day}</span>
                  );
               }) : null}
            </div>
         </div>

         {/* General Summary */}
         <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '1.5rem', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
            <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem', color: '#17233D' }}>Resumen General</h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              <SummaryRow label="Total Bancas" value="1" />
              <SummaryRow label="Cajeros Activos" value={activeVendorsCount.toString()} />
              <SummaryRow label="Sorteos Activos" value={activelotteriesCount.toString()} />
              
              <div style={{ borderTop: '1px solid #eee', paddingTop: '0.8rem', marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                 <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#333' }}>Ganancia Neta Hoy</span>
                 <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: metrics.gananciaNeta >= 0 ? '#28a745' : '#dc3545' }}>
                   ${metrics.gananciaNeta.toFixed(2)}
                 </span>
              </div>
              
              {store.partnerModeActive && (
                <div style={{ marginTop: '1rem', backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 'bold' }}>RESPALDO (CAPITAL)</span>
                      <span style={{ fontSize: '0.85rem', color: '#0f172a', fontWeight: 'bold' }}>${Number(store.partnerCapital).toFixed(2)}</span>
                   </div>
                   {store.partnerReinvestPct > 0 && (
                     <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', borderBottom: '1px dashed #e2e8f0', paddingBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.8rem', color: '#15803d', fontWeight: 'bold' }}>CRECIMIENTO BANCA ({store.partnerReinvestPct}%)</span>
                        <span style={{ fontSize: '0.85rem', color: metrics.gananciaNeta >= 0 ? '#10b981' : '#dc3545', fontWeight: 'bold' }}>
                          ${(metrics.gananciaNeta * (store.partnerReinvestPct / 100)).toFixed(2)}
                        </span>
                     </div>
                   )}
                   <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', borderBottom: '1px dashed #e2e8f0', paddingBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.8rem', color: '#8b5cf6', fontWeight: 'bold' }}>SOCIO ({store.partnerSplit}%)</span>
                      <span style={{ fontSize: '0.85rem', color: metrics.gananciaNeta >= 0 ? '#8b5cf6' : '#dc3545', fontWeight: 'bold' }}>
                        ${(metrics.gananciaNeta * (store.partnerSplit / 100)).toFixed(2)}
                      </span>
                   </div>
                   <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                      <span style={{ fontSize: '0.8rem', color: '#3b82f6', fontWeight: 'bold' }}>ADMINISTRADOR ({100 - store.partnerSplit - (store.partnerReinvestPct || 0)}%)</span>
                      <span style={{ fontSize: '0.85rem', color: metrics.gananciaNeta >= 0 ? '#3b82f6' : '#dc3545', fontWeight: 'bold' }}>
                        ${(metrics.gananciaNeta * ((100 - store.partnerSplit - (store.partnerReinvestPct || 0)) / 100)).toFixed(2)}
                      </span>
                   </div>
                </div>
              )}
            </div>
          </div>
      </div>

      {/* Gráfica Lineal de Tendencia Mensual */}
      {(() => {
         const data = metrics.monthlySales;
         if (data.length === 0) return null;

         // Calcular la ganancia acumulada día por día
         const netValues: number[] = [];
         let runningTotal = 0;
         data.forEach(d => {
            const dailyNet = d.sales - d.payouts - d.covers;
            runningTotal += dailyNet;
            netValues.push(runningTotal);
         });

         const maxVal = Math.max(...netValues, 100);
         const minVal = Math.min(...netValues, -100);
         const valRange = maxVal - minVal || 1;

         const width = 800;
         const height = 180;
         const paddingX = 40;
         const paddingY = 25;

         const getX = (index: number) => paddingX + (index * (width - 2 * paddingX) / (data.length - 1));
         const getY = (val: number) => height - paddingY - ((val - minVal) / valRange) * (height - 2 * paddingY);

         const points = netValues.map((val, idx) => ({ x: getX(idx), y: getY(val) }));
         const linePath = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

         const bottomY = height - paddingY;
         const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${bottomY} L ${points[0].x.toFixed(1)} ${bottomY} Z`;
         const zeroY = getY(0);

         return (
            <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '1.5rem', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginTop: '1.5rem' }}>
               <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem', color: '#17233D' }}>Crecimiento del Capital Acumulado (Últimos 30 Días)</h4>
               
               <div style={{ position: 'relative', width: '100%', height: `${height}px` }}>
                  <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
                     <defs>
                        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                           <stop offset="0%" stopColor="#10b981" stopOpacity="0.2" />
                           <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                        </linearGradient>
                     </defs>

                     {/* Líneas horizontales de cuadrícula */}
                     <line x1={paddingX} y1={paddingY} x2={width - paddingX} y2={paddingY} stroke="#f1f5f9" strokeWidth="1" />
                     <line x1={paddingX} y1={height/2} x2={width - paddingX} y2={height/2} stroke="#f1f5f9" strokeWidth="1" />
                     <line x1={paddingX} y1={height - paddingY} x2={width - paddingX} y2={height - paddingY} stroke="#f1f5f9" strokeWidth="1" />

                     {/* Línea cero (base neutra de ganancias) */}
                     {zeroY >= paddingY && zeroY <= height - paddingY && (
                        <line 
                           x1={paddingX} 
                           y1={zeroY} 
                           x2={width - paddingX} 
                           y2={zeroY} 
                           stroke="#cbd5e1" 
                           strokeWidth="1.5" 
                           strokeDasharray="4 4" 
                        />
                     )}

                     {/* Relleno con gradiente bajo la línea */}
                     <path d={areaPath} fill="url(#areaGrad)" />

                     {/* Línea de tendencia */}
                     <path d={linePath} fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

                     {/* Puntos sobre el gráfico */}
                     {points.map((p, idx) => {
                        const val = netValues[idx];
                        const color = val >= 0 ? '#10b981' : '#ef4444';
                        return (
                           <circle 
                              key={idx} 
                              cx={p.x} 
                              cy={p.y} 
                              r="3.5" 
                              fill={color} 
                              stroke="#fff" 
                              strokeWidth="1.2"
                              style={{ cursor: 'pointer' }}
                           >
                              <title>{`Día ${data[idx].day}: Balance Acumulado: $${val.toFixed(2)}`}</title>
                           </circle>
                        );
                     })}
                  </svg>
               </div>

               {/* Leyenda y Ejes */}
               <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#6c757d', marginTop: '0.8rem', padding: `0 ${paddingX}px` }}>
                  <span>Día {data[0]?.day} (Inicio: $0)</span>
                  <span>Balance Máximo: <strong style={{ color: '#10b981' }}>${maxVal.toFixed(2)}</strong></span>
                  <span>Balance Mínimo: <strong style={{ color: '#ef4444' }}>${minVal.toFixed(2)}</strong></span>
                  <span>Día {data[data.length - 1]?.day} (Cierre: ${runningTotal.toFixed(2)})</span>
               </div>
            </div>
         );
      })()}
    </div>
  );
}

// ------ Helper Components para el archivo actual ------

function MetricCard({ title, value, icon, color }: { title: string, value: string, icon: React.ReactNode, color: string }) {
  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '1.5rem', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', borderLeft: `4px solid ${color}` }}>
       <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem', color }}>
          {icon}
          <div style={{ fontSize: '0.7rem', fontWeight: 'bold', letterSpacing: '0.5px' }}>{title}</div>
       </div>
       <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#17233D' }}>{value}</div>
    </div>
  );
}



function SummaryRow({ label, value }: { label: string, value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.8rem', borderBottom: '1px dashed #eee' }}>
       <span style={{ fontSize: '0.85rem', color: '#6c757d' }}>{label}</span>
       <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#17233D' }}>{value}</span>
    </div>
  );
}
