import { getLocalISODate, getStartOfDayUTC, getEndOfDayUTC } from '../../utils/dateUtils';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useDashboardData } from '../../hooks/useDashboardData';
import { DollarSign, Tag, Percent, Trophy, ShieldAlert, Flame, RefreshCw, Activity, Layers, TrendingUp, TrendingDown, AlertTriangle, Search, Copy, Check } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { supabase } from '../../utils/supabase';

/** Devuelve color de fondo, texto y borde según los VILES acumulados en el número respecto al máximo */
function getHotNumberStyle(viles: number, maxViles: number): { bg: string; border: string; textColor: string; badge: string } {
  const ratio = maxViles > 0 ? viles / maxViles : 0;
  if (ratio >= 0.75) return { bg: '#fef2f2', border: '#ef4444', textColor: '#b91c1c', badge: '#dc2626' };       // 🔴 Rojo — crítico
  if (ratio >= 0.50) return { bg: '#fff7ed', border: '#f97316', textColor: '#c2410c', badge: '#ea580c' };       // 🟠 Naranja — alto
  if (ratio >= 0.25) return { bg: '#fefce8', border: '#eab308', textColor: '#a16207', badge: '#ca8a04' };       // 🟡 Amarillo — medio
  return { bg: '#f0fdf4', border: '#22c55e', textColor: '#15803d', badge: '#16a34a' };                          // 🟢 Verde — bajo
}

export default function Dashboard() {
  const [activeDate, setActiveDate] = useState(getLocalISODate());
  const { metrics, refetch } = useDashboardData(activeDate);
  const store = useStore();

  // Ref estable para refetch: evita que el useEffect de Realtime
  // se re-ejecute (y re-registre canales) al cambiar la identidad de refetch.
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  // Debounce para el monitor de números altos
  const hotDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [chartView, setChartView] = useState<'weekly' | 'monthly'>('weekly');

  const [upcomingDrawsHot, setUpcomingDrawsHot] = useState<{
    drawId: string;
    drawName: string;
    drawTime: string;
    allNumbers: {
      number: string;
      viles: number;
      totalAmount: number;
      ticketsCount: number;
      viles020: number;
      amount020: number;
      viles025: number;
      amount025: number;
    }[];
  }[]>([]);
  const [monitorModality, setMonitorModality] = useState<'all' | '0.20' | '0.25'>('all');
  const [loadingHotNumbers, setLoadingHotNumbers] = useState(false);
  // Ref para mantener datos anteriores y evitar parpadeo durante refetch
  const prevDrawsRef = useRef<typeof upcomingDrawsHot>([]);
  // Límite de riesgo global leído de la DB
  const [riskLimit, setRiskLimit] = useState<number>(store.globalRiskLimit || 100);
  // Límites por número específico
  const [numberLimitsMap, setNumberLimitsMap] = useState<Record<string, number>>({});
  // Buscador de número en el monitor
  const [searchNumberQuery, setSearchNumberQuery] = useState('');
  const [copiedCovers, setCopiedCovers] = useState(false);

  const handleCopyCovers = (draws: typeof upcomingDrawsHot) => {
    const lines: string[] = [`*📋 LISTA DE RESPALDOS - ${activeDate}*`, ''];
    let count = 0;
    draws.forEach(d => {
      const over = d.allNumbers.filter(n => {
        const lim = numberLimitsMap[n.number] ?? riskLimit;
        return n.viles > lim;
      });
      if (over.length > 0) {
        lines.push(`*${d.drawName} (${d.drawTime})*:`);
        over.forEach(n => {
          const lim = numberLimitsMap[n.number] ?? riskLimit;
          const passed = n.viles - lim;
          lines.push(`• Número *${n.number}* -> *${passed} viles* (lleva ${n.viles}v, límite ${lim}v)`);
          count++;
        });
        lines.push('');
      }
    });
    if (count === 0) {
      alert("No hay números que superen el límite de riesgo en estos sorteos actualmente.");
      return;
    }
    const text = lines.join('\n');
    navigator.clipboard.writeText(text);
    setCopiedCovers(true);
    setTimeout(() => setCopiedCovers(false), 3000);
    alert(`¡Se copiaron ${count} jugadas de respaldo al portapapeles listas para enviar por WhatsApp!`);
  };

  // Cargar límite de riesgo desde Supabase una vez
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from('risk_limits').select('number_played, max_limit');
        if (data) {
          const global = data.find((r: any) => r.number_played === 'GLOBAL_LIMIT');
          if (global) setRiskLimit(parseFloat(global.max_limit) || 100);
          const numMap: Record<string, number> = {};
          data.filter((r: any) => r.number_played && /^\d{2}$/.test(r.number_played))
            .forEach((r: any) => { numMap[r.number_played] = parseFloat(r.max_limit) || 100; });
          setNumberLimitsMap(numMap);
        }
      } catch {}
    })();
  }, []);

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
        .select('number_played, amount, draw_id, ticket:ticket_id(id, status, total_amount, vendor_id, ticket_numbers(amount))')
        .in('draw_id', targetIds)
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay);

      if (error) {
        console.error("Error consultando jugadas de números altos:", error);
      }

      const validPlays = (!error && data) ? data.filter((tn: any) => {
        const ticketObj = Array.isArray(tn.ticket) ? tn.ticket[0] : tn.ticket;
        if (ticketObj?.status === 'cancelled') return false;
        if (isSubAdmin && subAdminVendorIds && subAdminVendorIds.length > 0) {
          return subAdminVendorIds.includes(ticketObj?.vendor_id);
        }
        return true;
      }) : [];

      const resultsByDraw: typeof upcomingDrawsHot = [];

      // Evaluar cada lotería objetivo
      targetLotteries.forEach(lotto => {
        const drawPlays = validPlays.filter((tn: any) => tn.draw_id === lotto.id);
        if (drawPlays.length === 0) return; // Solo mostrar sorteos con jugadas procesadas

        const countMap: Record<string, {
          number: string;
          viles: number;
          totalAmount: number;
          ticketsCount: number;
          viles020: number;
          amount020: number;
          viles025: number;
          amount025: number;
        }> = {};

        drawPlays.forEach((tn: any) => {
          const num = String(tn.number_played).padStart(2, '0');
          const viles = parseFloat(tn.amount || '0');
          if (viles <= 0) return;

          const ticketObj = Array.isArray(tn.ticket) ? tn.ticket[0] : tn.ticket;
          const ticketTotalAmount = parseFloat(ticketObj?.total_amount || '0');
          const totalTicketViles = (ticketObj?.ticket_numbers || []).reduce((sum: number, n: any) => sum + parseFloat(n.amount || '0'), 0) || 1;
          const pricePerVil = totalTicketViles > 0 ? (ticketTotalAmount / totalTicketViles) : (Number(store.saleMode) || 0.20);
          const isQuarter = pricePerVil >= 0.235;

          const unitPrice = isQuarter ? 0.25 : 0.20;
          const amt = viles * unitPrice;

          if (!countMap[num]) {
            countMap[num] = {
              number: num,
              viles: 0,
              totalAmount: 0,
              ticketsCount: 0,
              viles020: 0,
              amount020: 0,
              viles025: 0,
              amount025: 0
            };
          }

          countMap[num].viles += viles;
          countMap[num].totalAmount += amt;
          countMap[num].ticketsCount += 1;

          if (isQuarter) {
            countMap[num].viles025 += viles;
            countMap[num].amount025 += amt;
          } else {
            countMap[num].viles020 += viles;
            countMap[num].amount020 += amt;
          }
        });

        const allNumbers = Object.values(countMap);

        if (allNumbers.length > 0) {
          const timeStr = `${lotto.hour > 12 ? lotto.hour - 12 : (lotto.hour === 0 ? 12 : lotto.hour)}:${lotto.minute.toString().padStart(2, '0')} ${lotto.hour >= 12 ? 'PM' : 'AM'}`;

          resultsByDraw.push({
            drawId: lotto.id,
            drawName: lotto.name,
            drawTime: timeStr,
            allNumbers
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
      // Mostrar hasta 5 sorteos y guardar ref para evitar parpadeo
      const newData = sortedDraws.slice(0, 5);
      prevDrawsRef.current = newData;
      setUpcomingDrawsHot(newData);
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

    // Realtime WebSocket — debounce compartido evita renderizados en cascada
    const fireDebouncedUpdate = () => {
      if (hotDebounceRef.current) clearTimeout(hotDebounceRef.current);
      hotDebounceRef.current = setTimeout(() => {
        refetchRef.current();
        fetchHotNumbers(false);
        setLastRefreshTime(new Date());
      }, 800);
    };

    const channel = supabase
      .channel('dashboard-realtime-monitor-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, fireDebouncedUpdate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_numbers' }, fireDebouncedUpdate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payouts' }, fireDebouncedUpdate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'results' }, fireDebouncedUpdate)
      .subscribe();

    return () => {
      if (hotDebounceRef.current) clearTimeout(hotDebounceRef.current);
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [activeDate]); // refetch se accede via refetchRef — estable, sin re-registrar canales

  const getDayNameFromDateStr = (dateStr: string) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return days[date.getDay()];
  };

  const selectedDayName = getDayNameFromDateStr(activeDate);
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const isSelectedToday = activeDate === getLocalISODate();

  const dayLotteries = store.lotteriesMaster.filter(l => {
    if (!l.isActive) return false;
    if (!l.days || l.days.length === 0) return true; // Si no hay días definidos, juega todos los días
    return l.days.includes(selectedDayName as any);
  });
  const totalDayLotteries = dayLotteries.length;
  const remainingLotteriesCount = isSelectedToday
    ? dayLotteries.filter(l => {
        const lotMinutes = l.hour * 60 + l.minute - (l.closeMinutes ?? 10);
        return lotMinutes > currentMinutes;
      }).length
    : 0;

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

      {/* COMPARATIVA DIARIA POR MODALIDAD ($0.20 vs $0.25) */}
      {(() => {
        const m020 = metrics.modality020 || { ventas: 0, premios: 0, comisiones: 0, neto: 0, tickets: 0, payoutRatio: 0 };
        const m025 = metrics.modality025 || { ventas: 0, premios: 0, comisiones: 0, neto: 0, tickets: 0, payoutRatio: 0 };
        const totalSales = m020.ventas + m025.ventas;
        const pct020 = totalSales > 0 ? (m020.ventas / totalSales) * 100 : 50;
        const pct025 = totalSales > 0 ? (m025.ventas / totalSales) * 100 : 50;

        return (
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '1.25rem 1.5rem', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1.5rem', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Layers size={22} color="#4f46e5" />
                <div>
                  <h4 style={{ margin: 0, fontSize: '1.1rem', color: '#17233D', fontWeight: 800 }}>
                    Rendimiento por Modalidad de Banca (Diario)
                  </h4>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Comparativa de ventas, premios y rentabilidad entre bancas $0.20 y $0.25
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.75rem', fontWeight: 700 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#0284c7' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#0284c7', display: 'inline-block' }} />
                  Banca $0.20 ({pct020.toFixed(0)}%)
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#7c3aed' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#7c3aed', display: 'inline-block' }} />
                  Banca $0.25 ({pct025.toFixed(0)}%)
                </span>
              </div>
            </div>

            {/* Barra de Distribución de Ventas */}
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#64748b', marginBottom: '4px', fontWeight: 600 }}>
                <span>Participación de Venta: $0.20 ({pct020.toFixed(1)}%)</span>
                <span>$0.25 ({pct025.toFixed(1)}%)</span>
              </div>
              <div style={{ width: '100%', height: '10px', backgroundColor: '#f1f5f9', borderRadius: '999px', overflow: 'hidden', display: 'flex' }}>
                <div style={{ width: `${pct020}%`, backgroundColor: '#0284c7', transition: 'width 0.4s ease' }} title={`$0.20: $${m020.ventas.toFixed(2)}`} />
                <div style={{ width: `${pct025}%`, backgroundColor: '#7c3aed', transition: 'width 0.4s ease' }} title={`$0.25: $${m025.ventas.toFixed(2)}`} />
              </div>
            </div>

            {/* Tarjetas Comparativas de Cada Modalidad */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              {/* Tarjeta Modalidad $0.20 */}
              <div style={{ border: '1px solid #bae6fd', backgroundColor: '#f0f9ff', borderRadius: '10px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ backgroundColor: '#0284c7', color: '#fff', padding: '2px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 800 }}>$0.20</span>
                    <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0369a1' }}>Modalidad $0.20 (Paga x11)</span>
                  </div>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', backgroundColor: '#e0f2fe', color: '#0369a1' }}>
                    {m020.tickets} tickets
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', backgroundColor: '#fff', borderRadius: '8px', padding: '0.75rem', border: '1px solid #e0f2fe' }}>
                  <div>
                    <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700 }}>VENTAS</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0284c7' }}>${m020.ventas.toFixed(2)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700 }}>PREMIOS</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#dc2626' }}>${m020.premios.toFixed(2)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700 }}>COMISIONES</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#d97706' }}>${m020.comisiones.toFixed(2)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700 }}>SINIESTRALIDAD</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: m020.payoutRatio > 80 ? '#dc2626' : m020.payoutRatio > 65 ? '#d97706' : '#16a34a' }}>
                      {m020.payoutRatio.toFixed(1)}%
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: m020.neto >= 0 ? '#ecfdf5' : '#fef2f2', padding: '0.6rem 0.8rem', borderRadius: '8px', border: `1px solid ${m020.neto >= 0 ? '#a7f3d0' : '#fecaca'}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', fontWeight: 700, color: m020.neto >= 0 ? '#065f46' : '#991b1b' }}>
                    {m020.neto >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                    <span>Ganancia Neta $0.20</span>
                  </div>
                  <span style={{ fontSize: '1.1rem', fontWeight: 900, color: m020.neto >= 0 ? '#059669' : '#dc2626' }}>
                    ${m020.neto.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Tarjeta Modalidad $0.25 */}
              <div style={{ border: '1px solid #ddd6fe', backgroundColor: '#fbf7ff', borderRadius: '10px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ backgroundColor: '#7c3aed', color: '#fff', padding: '2px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 800 }}>$0.25</span>
                    <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#5b21b6' }}>Modalidad $0.25 (Paga x14)</span>
                  </div>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', backgroundColor: '#ede9fe', color: '#5b21b6' }}>
                    {m025.tickets} tickets
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', backgroundColor: '#fff', borderRadius: '8px', padding: '0.75rem', border: '1px solid #ede9fe' }}>
                  <div>
                    <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700 }}>VENTAS</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#7c3aed' }}>${m025.ventas.toFixed(2)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700 }}>PREMIOS</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#dc2626' }}>${m025.premios.toFixed(2)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700 }}>COMISIONES</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#d97706' }}>${m025.comisiones.toFixed(2)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700 }}>SINIESTRALIDAD</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: m025.payoutRatio > 80 ? '#dc2626' : m025.payoutRatio > 65 ? '#d97706' : '#16a34a' }}>
                      {m025.payoutRatio.toFixed(1)}%
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: m025.neto >= 0 ? '#ecfdf5' : '#fef2f2', padding: '0.6rem 0.8rem', borderRadius: '8px', border: `1px solid ${m025.neto >= 0 ? '#a7f3d0' : '#fecaca'}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', fontWeight: 700, color: m025.neto >= 0 ? '#065f46' : '#991b1b' }}>
                    {m025.neto >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                    <span>Ganancia Neta $0.25</span>
                  </div>
                  <span style={{ fontSize: '1.1rem', fontWeight: 900, color: m025.neto >= 0 ? '#059669' : '#dc2626' }}>
                    ${m025.neto.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Mini Desglose 7 Días Modalidades si hay datos */}
            {metrics.weeklyModality && metrics.weeklyModality.length > 0 && (
              <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Activity size={14} color="#6366f1" /> Tendencia de Ventas (Últimos 7 Días por Modalidad)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${metrics.weeklyModality.length}, 1fr)`, gap: '4px', textAlign: 'center' }}>
                  {metrics.weeklyModality.map((wm, idx) => {
                    const dayTotal = wm.sales020 + wm.sales025;
                    const p020 = dayTotal > 0 ? (wm.sales020 / dayTotal) * 100 : 50;
                    return (
                      <div key={idx} style={{ backgroundColor: '#f8fafc', padding: '6px 4px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#475569' }}>{wm.day}</div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0f172a', margin: '2px 0' }}>${dayTotal.toFixed(0)}</div>
                        <div style={{ width: '100%', height: '5px', backgroundColor: '#ede9fe', borderRadius: '999px', overflow: 'hidden', display: 'flex' }}>
                          <div style={{ width: `${p020}%`, backgroundColor: '#0284c7' }} />
                          <div style={{ width: `${100 - p020}%`, backgroundColor: '#7c3aed' }} />
                        </div>
                        <div style={{ fontSize: '0.6rem', color: '#64748b', marginTop: '2px', display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#0284c7', fontWeight: 700 }}>${wm.sales020.toFixed(0)}</span>
                          <span style={{ color: '#7c3aed', fontWeight: 700 }}>${wm.sales025.toFixed(0)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* MONITOR DE NÚMEROS ALTOS POR SORTEO PRÓXIMO / ACTIVO */}
      {(() => {
        // Usar datos previos si el estado actual está vacío y estamos cargando (evita flasheo)
        const displayDraws = upcomingDrawsHot.length > 0 ? upcomingDrawsHot : prevDrawsRef.current;

        return (
        <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '1.25rem 1.5rem', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1.5rem', border: '1px solid #e2e8f0' }}>
         <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
               <Flame size={24} color="#ef4444" />
               <div>
                  <h4 style={{ margin: 0, fontSize: '1.12rem', color: '#17233D', fontWeight: 800 }}>
                     Monitor de Números Altos
                  </h4>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                     Ordenado por viles acumulados · Límite global: <strong style={{ color: '#0f172a' }}>{riskLimit} viles</strong>
                  </span>
               </div>
            </div>

            {/* Controles de Acción: Buscar Número, Copiar Respaldos y Selector de Modalidad */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
               {/* Buscador Rápido de Número */}
               <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Search size={14} style={{ position: 'absolute', left: '8px', color: '#94a3b8' }} />
                  <input
                     type="text"
                     maxLength={2}
                     placeholder="Buscar nº..."
                     value={searchNumberQuery}
                     onChange={(e) => setSearchNumberQuery(e.target.value.replace(/\D/g, '').slice(0, 2))}
                     style={{
                        padding: '0.35rem 0.6rem 0.35rem 1.8rem',
                        fontSize: '0.78rem',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        width: '95px',
                        fontWeight: 700,
                        outline: 'none',
                        backgroundColor: searchNumberQuery ? '#fef3c7' : '#fff'
                     }}
                  />
                  {searchNumberQuery && (
                     <button
                        onClick={() => setSearchNumberQuery('')}
                        style={{ position: 'absolute', right: '6px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 800 }}
                     >
                        ✕
                     </button>
                  )}
               </div>

               {/* Botón Copiar Respaldos WhatsApp */}
               <button
                  type="button"
                  onClick={() => handleCopyCovers(displayDraws)}
                  style={{
                     display: 'flex',
                     alignItems: 'center',
                     gap: '0.35rem',
                     padding: '0.38rem 0.75rem',
                     fontSize: '0.75rem',
                     fontWeight: 800,
                     borderRadius: '6px',
                     border: '1px solid #10b981',
                     cursor: 'pointer',
                     backgroundColor: copiedCovers ? '#10b981' : '#ecfdf5',
                     color: copiedCovers ? '#fff' : '#047857',
                     transition: 'all 0.15s ease'
                  }}
                  title="Copia una lista con todos los números que exceden el límite de riesgo formateada para WhatsApp"
               >
                  {copiedCovers ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedCovers ? '¡Copiado!' : 'Copiar Respaldos'}</span>
               </button>

               {/* Selector de Modalidad */}
               <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', backgroundColor: '#f1f5f9', padding: '3px', borderRadius: '8px' }}>
                  <button
                     type="button"
                     onClick={() => setMonitorModality('all')}
                     style={{
                        padding: '0.35rem 0.85rem',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        borderRadius: '6px',
                        border: 'none',
                        cursor: 'pointer',
                        backgroundColor: monitorModality === 'all' ? '#17233D' : 'transparent',
                        color: monitorModality === 'all' ? '#fff' : '#64748b',
                        transition: 'all 0.15s ease-in-out'
                     }}
                  >
                     Todas
                  </button>
                  <button
                     type="button"
                     onClick={() => setMonitorModality('0.20')}
                     style={{
                        padding: '0.35rem 0.85rem',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        borderRadius: '6px',
                        border: 'none',
                        cursor: 'pointer',
                        backgroundColor: monitorModality === '0.20' ? '#0d9488' : 'transparent',
                        color: monitorModality === '0.20' ? '#fff' : '#64748b',
                        transition: 'all 0.15s ease-in-out'
                     }}
                  >
                     Solo $0.20
                  </button>
                  <button
                     type="button"
                     onClick={() => setMonitorModality('0.25')}
                     style={{
                        padding: '0.35rem 0.85rem',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        borderRadius: '6px',
                        border: 'none',
                        cursor: 'pointer',
                        backgroundColor: monitorModality === '0.25' ? '#7c3aed' : 'transparent',
                        color: monitorModality === '0.25' ? '#fff' : '#64748b',
                        transition: 'all 0.15s ease-in-out'
                     }}
                  >
                     Solo $0.25
                  </button>
               </div>
            </div>
         </div>

         {loadingHotNumbers && displayDraws.length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: '0.9rem', padding: '1.5rem', textAlign: 'center' }}>Cargando jugadas procesadas...</div>
         ) : displayDraws.length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: '0.9rem', padding: '1.5rem', textAlign: 'center', fontStyle: 'italic' }}>
               Sin jugadas procesadas en sorteos activos por vencer.
            </div>
         ) : (
            <div>
               {/* Leyenda de colores + indicador de carga sutil */}
               <div style={{ display: 'flex', gap: '0.8rem', marginBottom: '1rem', flexWrap: 'wrap', fontSize: '0.75rem', fontWeight: 'bold', alignItems: 'center' }}>
                 <span style={{ color: '#64748b' }}>Nivel de riesgo (por viles):</span>
                 <span style={{ backgroundColor: '#f0fdf4', border: '1px solid #22c55e', color: '#15803d', padding: '0.2rem 0.6rem', borderRadius: '4px' }}>🟢 Bajo</span>
                 <span style={{ backgroundColor: '#fefce8', border: '1px solid #eab308', color: '#a16207', padding: '0.2rem 0.6rem', borderRadius: '4px' }}>🟡 Medio</span>
                 <span style={{ backgroundColor: '#fff7ed', border: '1px solid #f97316', color: '#c2410c', padding: '0.2rem 0.6rem', borderRadius: '4px' }}>🟠 Alto</span>
                 <span style={{ backgroundColor: '#fef2f2', border: '1px solid #ef4444', color: '#b91c1c', padding: '0.2rem 0.6rem', borderRadius: '4px' }}>🔴 Crítico</span>
                 <span style={{ backgroundColor: '#fdf4ff', border: '1px solid #c026d3', color: '#86198f', padding: '0.2rem 0.6rem', borderRadius: '4px' }}>⚠️ Respaldar</span>
                 {loadingHotNumbers && <span style={{ color: '#94a3b8', fontSize: '0.7rem', fontStyle: 'italic' }}>⟳ Actualizando...</span>}
               </div>
               <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(320px, 1fr))`, gap: '1.25rem' }}>
                 {displayDraws.map((drawData) => {
                   // ORDENAR POR VILES ACUMULADOS (no por monto en dólares)
                   let displayNumbers = drawData.allNumbers;
                   if (monitorModality === '0.20') {
                     displayNumbers = drawData.allNumbers
                       .filter(n => n.viles020 > 0)
                       .sort((a, b) => b.viles020 - a.viles020);
                   } else if (monitorModality === '0.25') {
                     displayNumbers = drawData.allNumbers
                       .filter(n => n.viles025 > 0)
                       .sort((a, b) => b.viles025 - a.viles025);
                   } else {
                     displayNumbers = drawData.allNumbers
                       .filter(n => n.viles > 0)
                       .sort((a, b) => b.viles - a.viles);
                   }
                   const sortedFiltered = displayNumbers;
                   const topNumbers = searchNumberQuery 
                     ? sortedFiltered.filter(n => n.number === searchNumberQuery)
                     : sortedFiltered.slice(0, 10);
                   const maxViles = Math.max(
                     ...topNumbers.map(n => monitorModality === '0.20' ? n.viles020 : monitorModality === '0.25' ? n.viles025 : n.viles),
                     1
                   );

                   // Total de viles y monto del sorteo
                   const totalDrawViles = drawData.allNumbers.reduce((sum, n) => sum + n.viles, 0);
                   const totalDrawAmount = drawData.allNumbers.reduce((sum, n) => sum + n.totalAmount, 0);
                   const numbersNeedingCover = drawData.allNumbers.filter(n => {
                     const limit = numberLimitsMap[n.number] ?? riskLimit;
                     return n.viles > limit;
                   }).length;

                   return (
                     <div key={drawData.drawId} style={{ backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #cbd5e1', padding: '1rem', transition: 'opacity 0.3s ease' }}>
                       {/* Header del sorteo */}
                       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.6rem', marginBottom: '0.5rem' }}>
                         <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                           <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0d9488' }}>{drawData.drawName}</span>
                           <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', backgroundColor: '#fff', padding: '0.15rem 0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}>{drawData.drawTime}</span>
                         </div>
                         {numbersNeedingCover > 0 && (
                           <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#be123c', backgroundColor: '#fff1f2', padding: '0.2rem 0.5rem', borderRadius: '6px', border: '1px solid #fda4af', display: 'flex', alignItems: 'center', gap: '3px' }}>
                             <AlertTriangle size={12} /> {numbersNeedingCover} a respaldar
                           </span>
                         )}
                       </div>
                       {/* Mini resumen del sorteo */}
                       <div style={{ display: 'flex', gap: '0.8rem', marginBottom: '0.6rem', fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>
                         <span>Números: <strong style={{ color: '#0f172a' }}>{drawData.allNumbers.length}</strong></span>
                         <span>Viles: <strong style={{ color: '#0f172a' }}>{totalDrawViles}</strong></span>
                         <span>Monto: <strong style={{ color: '#0f172a' }}>${totalDrawAmount.toFixed(2)}</strong></span>
                       </div>

                       {topNumbers.length === 0 ? (
                         <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: '0.5rem 0', fontStyle: 'italic', textAlign: 'center' }}>
                           Sin jugadas registradas {monitorModality !== 'all' ? `en modalidad $${monitorModality}` : ''} para este sorteo.
                         </p>
                       ) : (
                         <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                           {topNumbers.map((numItem, nIdx) => {
                             const displayedViles = monitorModality === '0.20' ? numItem.viles020 : monitorModality === '0.25' ? numItem.viles025 : numItem.viles;
                             const displayedAmount = monitorModality === '0.20' ? numItem.amount020 : monitorModality === '0.25' ? numItem.amount025 : numItem.totalAmount;
                             const effectiveLimit = numberLimitsMap[numItem.number] ?? riskLimit;
                             const needsCover = displayedViles > effectiveLimit;
                             const excessViles = needsCover ? displayedViles - effectiveLimit : 0;
                             const coverPct = effectiveLimit > 0 ? Math.min((displayedViles / effectiveLimit) * 100, 100) : 0;
                             const style = needsCover
                               ? { bg: '#fdf4ff', border: '#c026d3', textColor: '#86198f', badge: '#a21caf' }
                               : getHotNumberStyle(displayedViles, maxViles);
                             const barWidth = maxViles > 0 ? Math.max((displayedViles / maxViles) * 100, 4) : 4;

                             return (
                               <div key={nIdx} style={{ position: 'relative', overflow: 'hidden', backgroundColor: style.bg, padding: '0.5rem 0.75rem', borderRadius: '8px', border: `1.5px solid ${style.border}`, boxShadow: '0 1px 2px rgba(0,0,0,0.03)', transition: 'all 0.3s ease' }}>
                                 {/* Barra de progreso de fondo */}
                                 <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${barWidth}%`, backgroundColor: style.border, opacity: 0.12, transition: 'width 0.4s ease' }} />
                                 <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                   {/* Lado izquierdo: ranking + número + viles GRANDES */}
                                   <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                     <span style={{ fontSize: '0.72rem', fontWeight: 900, backgroundColor: style.badge, color: '#fff', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>{nIdx + 1}</span>
                                     <span style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '1.7rem', color: style.textColor, letterSpacing: '1px', lineHeight: 1 }}>{numItem.number}</span>
                                     {/* VILES como métrica principal GRANDE */}
                                     <div style={{ display: 'flex', flexDirection: 'column', marginLeft: '0.2rem' }}>
                                       <span style={{ fontSize: '1.3rem', fontWeight: 900, color: style.textColor, lineHeight: 1 }}>{displayedViles}</span>
                                       <span style={{ fontSize: '0.65rem', fontWeight: 700, color: style.textColor, opacity: 0.7 }}>viles</span>
                                     </div>
                                   </div>
                                   {/* Lado derecho: monto + recomendación */}
                                   <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                                     <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#475569', lineHeight: 1.1 }}>
                                       ${displayedAmount.toFixed(2)}
                                     </div>
                                     {needsCover ? (
                                       <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.68rem', fontWeight: 800, color: '#be123c', backgroundColor: '#fff1f2', padding: '1px 6px', borderRadius: '4px', border: '1px solid #fda4af' }}>
                                         <AlertTriangle size={11} />
                                         RESPALDAR {excessViles} viles
                                       </div>
                                     ) : coverPct >= 70 ? (
                                       <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#d97706', backgroundColor: '#fffbeb', padding: '1px 6px', borderRadius: '4px', border: '1px solid #fde68a' }}>
                                         ⚡ {coverPct.toFixed(0)}% del límite
                                       </div>
                                     ) : (
                                       <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#64748b' }}>
                                         {numItem.ticketsCount}t · {coverPct.toFixed(0)}% límite
                                       </div>
                                     )}
                                     {/* Desglose por modalidad si aplica */}
                                     {monitorModality === 'all' && numItem.viles020 > 0 && numItem.viles025 > 0 && (
                                       <span style={{ fontSize: '0.62rem', backgroundColor: '#e2e8f0', color: '#334155', padding: '0.05rem 0.3rem', borderRadius: '3px', fontWeight: 600 }}>
                                         0.20: {numItem.viles020}v | 0.25: {numItem.viles025}v
                                       </span>
                                     )}
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
        );
      })()}

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
              {isSelectedToday ? (
                <SummaryRow 
                  label="Sorteos por Cerrar Hoy" 
                  value={`${remainingLotteriesCount} de ${totalDayLotteries}`} 
                />
              ) : (
                <SummaryRow 
                  label="Sorteos del Día" 
                  value={`${totalDayLotteries} programados`} 
                />
              )}
              
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
