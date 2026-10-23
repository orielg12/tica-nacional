import { getLocalISODate, getStartOfDayUTC, getEndOfDayUTC } from '../../utils/dateUtils';
import { LOTTERY_SCHEDULE } from '../../utils/lotteryRules';
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../utils/supabase';
import { useStore } from '../../store/useStore';
import { Calendar, ArrowRight, AlertCircle, Activity, Download, ChevronDown, ChevronUp } from 'lucide-react';

export default function AdminReports() {
  const store = useStore();
  const [tickets, setTickets] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [covers, setCovers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Debounce ref para agrupar múltiples eventos Realtime y evitar recargas masivas
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Rango de fechas por defecto a Hoy
  const [startDate, setStartDate] = useState(getLocalISODate());
  const [endDate, setEndDate] = useState(getLocalISODate());
  const [selectedVendor, setSelectedVendor] = useState<string>('all');
  const [selectedModality, setSelectedModality] = useState<'all' | '0.20' | '0.25'>('all');
  const [expandedVendor, setExpandedVendor] = useState<string | null>(null);

  const currentUser = store.currentUser;
  const isSubAdmin = currentUser?.isSubAdmin;
  const subAdminVendorIds = isSubAdmin
    ? store.users
        .filter(u => u.parentAdminId === currentUser?.username)
        .map(u => u.username)
        .concat(currentUser?.username || '')
    : null;

  const fetchGlobalSales = async () => {
    setLoading(true);
    try {
      // Paginación en bloques de 1000 para traer el 100% de los tickets sin topar en el límite de Supabase
      const allTicketsData: any[] = [];
      let from = 0;
      const step = 1000;
      while (true) {
        let query = supabase
          .from('tickets')
          .select('id, created_at, vendor_id, client_name, total_amount, status, ticket_numbers(amount, draw_id, number_played)')
          .gte('created_at', getStartOfDayUTC(startDate))
          .lte('created_at', getEndOfDayUTC(endDate))
          .order('created_at', { ascending: false })
          .range(from, from + step - 1);

        if (subAdminVendorIds && subAdminVendorIds.length > 0) {
          query = query.in('vendor_id', subAdminVendorIds);
        }

        const { data, error } = await query;
        if (error || !data || data.length === 0) break;
        allTicketsData.push(...data);
        if (data.length < step) break;
        from += step;
      }
        
      const { data: coversData } = await supabase
        .from('covers')
        .select('excess_amount')
        .gte('created_at', getStartOfDayUTC(startDate))
        .lte('created_at', getEndOfDayUTC(endDate));

      if (allTicketsData.length > 0) {
        setTickets(allTicketsData);
        
        const ticketIds = allTicketsData.map(t => t.id);
        const chunkSize = 100;
        const chunks: string[][] = [];
        for (let i = 0; i < ticketIds.length; i += chunkSize) {
          chunks.push(ticketIds.slice(i, i + chunkSize));
        }
        const payoutPromises = chunks.map(chunk =>
          supabase
            .from('payouts')
            .select('ticket_id, amount, paid_by')
            .in('ticket_id', chunk)
        );
        const results = await Promise.all(payoutPromises);
        const allPayouts = results.flatMap(r => r.data || []);
        setPayouts(allPayouts);
      } else {
        setTickets([]);
        setPayouts([]);
      }

      if (coversData) {
        setCovers(coversData);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    store.fetchUsers();
    fetchGlobalSales();

    const triggerDebouncedFetch = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        fetchGlobalSales();
      }, 800);
    };

    // Suscripción Realtime para actualizar reportes en vivo con debounce compartido
    const channel = supabase.channel('reports-live-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, triggerDebouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payouts' }, triggerDebouncedFetch)
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [startDate, endDate]);


  // --- CALCULOS GLOBALES ---
  // Mapa de comisiones por id o username de vendedor para búsqueda rápida
  const commissionMap: Record<string, number> = {};
  const usernameMap: Record<string, string> = {};
  store.users.forEach(u => {
     // El sistema vieja guardaba numérico, el nuevo usa username text
     if (u.username) {
         commissionMap[u.username] = u.commission;
         usernameMap[u.id.toString()] = u.username;
         usernameMap[u.username] = u.username;
     }
     commissionMap[u.id.toString()] = u.commission;
  });

  // Filtramos tickets anulados
  const activeTickets = tickets.filter(t => t.status !== 'cancelled');
  const cancelledTickets = tickets.filter(t => t.status === 'cancelled');
  const totalCancelledAmount = cancelledTickets.reduce((acc, t) => acc + (parseFloat(t.total_amount) || 0), 0);

  let globalGross = 0;
  let globalCommission = 0;
  
  let global020Ventas = 0;
  let global020Comisiones = 0;
  let global020Premios = 0;
  let global020Tickets = 0;
  
  let global025Ventas = 0;
  let global025Comisiones = 0;
  let global025Premios = 0;
  let global025Tickets = 0;
  
  // Tickets agrupados por vendedor y por lotería (Viles y USD exacto)
  const vendorTotals: Record<string, { 
    gross: number, commission: number, prizesPaid: number, ticketCount: number,
    tickets020: number, ventas020: number, premios020: number, comisiones020: number,
    tickets025: number, ventas025: number, premios025: number, comisiones025: number,
    cancelledCount: number, cancelledAmount: number,
    lotterySalesViles: Record<string, number>,
    lotterySalesUSD: Record<string, number>
  }> = {};
  
  const lotterySalesViles: Record<string, number> = {};
  const lotterySalesUSD: Record<string, number> = {};

  const initVendor = (vid: string) => {
     if (!vendorTotals[vid]) {
       vendorTotals[vid] = { 
           gross: 0, commission: 0, prizesPaid: 0, ticketCount: 0,
           tickets020: 0, ventas020: 0, premios020: 0, comisiones020: 0,
           tickets025: 0, ventas025: 0, premios025: 0, comisiones025: 0,
           cancelledCount: 0, cancelledAmount: 0,
           lotterySalesViles: {},
           lotterySalesUSD: {}
       };
     }
  };

  cancelledTickets.forEach(t => {
     const rawVid = t.vendor_id?.toString() || 'desconocido';
     const vid = usernameMap[rawVid] || rawVid;
     initVendor(vid);
     vendorTotals[vid].cancelledCount += 1;
     vendorTotals[vid].cancelledAmount += (parseFloat(t.total_amount) || 0);
  });

  activeTickets.forEach(t => {
     const amount = parseFloat(t.total_amount) || 0;
     const rawVid = t.vendor_id?.toString() || 'desconocido';
     const vid = usernameMap[rawVid] || rawVid;
     initVendor(vid);
     vendorTotals[vid].ticketCount += 1;
     
     // Determinar modalidad (0.20 vs 0.25) para calcular precio real por vil
     const tiempos = t.ticket_numbers?.reduce((acc: number, tn: any) => acc + parseFloat(tn.amount || '0'), 0) || 1;
     const isQuarterMode = (amount / tiempos) >= 0.24;
     const unitPrice = isQuarterMode ? 0.25 : 0.20;

     // Agregar a lotterySales (Viles y USD exacto por sorteo)
     t.ticket_numbers?.forEach((tn: any) => {
       const draw = tn.draw_id || 'Sin Sorteo';
       const viles = parseFloat(tn.amount) || 0;
       const isPalet = tn.number_played && String(tn.number_played).length === 4;
       const itemUsd = isPalet ? viles : (viles * unitPrice);

       lotterySalesViles[draw] = (lotterySalesViles[draw] || 0) + viles;
       lotterySalesUSD[draw] = (lotterySalesUSD[draw] || 0) + itemUsd;

       vendorTotals[vid].lotterySalesViles[draw] = (vendorTotals[vid].lotterySalesViles[draw] || 0) + viles;
       vendorTotals[vid].lotterySalesUSD[draw] = (vendorTotals[vid].lotterySalesUSD[draw] || 0) + itemUsd;
     });

     const commPerc = commissionMap[vid] || 0;
     const commAmount = amount * (commPerc / 100);

     const ticketPayouts = payouts.filter(p => p.ticket_id === t.id);
     let ticketPrize = 0;
     ticketPayouts.forEach(p => {
       ticketPrize += parseFloat(p.amount || '0');
     });

     vendorTotals[vid].prizesPaid += ticketPrize;

     if (isQuarterMode) {
        global025Ventas += amount;
        global025Comisiones += commAmount;
        global025Premios += ticketPrize;
        global025Tickets += 1;
        vendorTotals[vid].tickets025 += 1;
        vendorTotals[vid].ventas025 += amount;
        vendorTotals[vid].comisiones025 += commAmount;
        vendorTotals[vid].premios025 += ticketPrize;
     } else {
        global020Ventas += amount;
        global020Comisiones += commAmount;
        global020Premios += ticketPrize;
        global020Tickets += 1;
        vendorTotals[vid].tickets020 += 1;
        vendorTotals[vid].ventas020 += amount;
        vendorTotals[vid].comisiones020 += commAmount;
        vendorTotals[vid].premios020 += ticketPrize;
     }
     
     globalGross += amount;
     globalCommission += commAmount;

     vendorTotals[vid].gross += amount;
     vendorTotals[vid].commission += commAmount;
  });

  // Calcular la Utilidad Neta Real Global
  const totalCovers = covers.reduce((acc, c) => acc + parseFloat(c.excess_amount || '0'), 0);
  const totalPayoutNet = payouts.reduce((acc, p) => acc + parseFloat(p.amount || '0'), 0);
  const globalNet = globalGross - globalCommission - totalCovers - totalPayoutNet;

  // --- VARIABLES DE VISTA (GLOBAL vs VENDEDOR SELECCIONADO) ---
  const isGlobal = selectedVendor === 'all';
  
  const baseGross = isGlobal ? globalGross : (vendorTotals[selectedVendor]?.gross || 0);
  const baseCommission = isGlobal ? globalCommission : (vendorTotals[selectedVendor]?.commission || 0);
  const basePrizes = isGlobal ? totalPayoutNet : (vendorTotals[selectedVendor]?.prizesPaid || 0);
  const baseNet = isGlobal ? globalNet : (baseGross - baseCommission - basePrizes);
  
  const baseActiveCount = isGlobal ? activeTickets.length : (vendorTotals[selectedVendor]?.ticketCount || 0);
  const baseCancelledCount = isGlobal ? cancelledTickets.length : (vendorTotals[selectedVendor]?.cancelledCount || 0);
  const baseCancelledAmount = isGlobal ? totalCancelledAmount : (vendorTotals[selectedVendor]?.cancelledAmount || 0);

  const display020Tickets = isGlobal ? global020Tickets : (vendorTotals[selectedVendor]?.tickets020 || 0);
  const display020Ventas = isGlobal ? global020Ventas : (vendorTotals[selectedVendor]?.ventas020 || 0);
  const display020Comisiones = isGlobal ? global020Comisiones : (vendorTotals[selectedVendor]?.comisiones020 || 0);
  const display020Premios = isGlobal ? global020Premios : (vendorTotals[selectedVendor]?.premios020 || 0);
  const display020Net = display020Ventas - display020Comisiones - display020Premios;

  const display025Tickets = isGlobal ? global025Tickets : (vendorTotals[selectedVendor]?.tickets025 || 0);
  const display025Ventas = isGlobal ? global025Ventas : (vendorTotals[selectedVendor]?.ventas025 || 0);
  const display025Comisiones = isGlobal ? global025Comisiones : (vendorTotals[selectedVendor]?.comisiones025 || 0);
  const display025Premios = isGlobal ? global025Premios : (vendorTotals[selectedVendor]?.premios025 || 0);
  const display025Net = display025Ventas - display025Comisiones - display025Premios;

  // Filtrado según la Modalidad seleccionada (all, 0.20, 0.25)
  let displayGross = baseGross;
  let displayCommission = baseCommission;
  let displayPrizes = basePrizes;
  let displayNet = baseNet;
  let displayActiveCount = baseActiveCount;

  if (selectedModality === '0.20') {
    displayGross = display020Ventas;
    displayCommission = display020Comisiones;
    displayPrizes = display020Premios;
    displayNet = display020Net;
    displayActiveCount = display020Tickets;
  } else if (selectedModality === '0.25') {
    displayGross = display025Ventas;
    displayCommission = display025Comisiones;
    displayPrizes = display025Premios;
    displayNet = display025Net;
    displayActiveCount = display025Tickets;
  }

  const displayCancelledCount = selectedModality === 'all' ? baseCancelledCount : 0;
  const displayCancelledAmount = selectedModality === 'all' ? baseCancelledAmount : 0;
  const displayTotalIssued = displayActiveCount + displayCancelledCount;

  const currentLotteryViles = isGlobal ? lotterySalesViles : (vendorTotals[selectedVendor]?.lotterySalesViles || {});
  const currentLotteryUSD = isGlobal ? lotterySalesUSD : (vendorTotals[selectedVendor]?.lotterySalesUSD || {});
  
  const sortedLotteries = Object.keys(currentLotteryViles)
    .sort((a, b) => (currentLotteryUSD[b] || 0) - (currentLotteryUSD[a] || 0))
    .map(draw => {
       const lotteryConfig = LOTTERY_SCHEDULE.find(l => l.id === draw);
       const name = lotteryConfig ? `${lotteryConfig.name} ${lotteryConfig.hour > 12 ? lotteryConfig.hour - 12 : (lotteryConfig.hour === 0 ? 12 : lotteryConfig.hour)}:${lotteryConfig.minute.toString().padStart(2, '0')} ${lotteryConfig.hour >= 12 ? 'PM' : 'AM'}` : draw;
       return { 
         id: draw, 
         name, 
         viles: currentLotteryViles[draw] || 0, 
         usd: currentLotteryUSD[draw] || 0 
       };
    });

  const handleExportCSV = () => {
     let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
     csvContent += "ID Vendedor;Porcentaje;Cant. Tickets;Venta Bruta;Comision Retenida;Premios Pagados;Neto a Entregar\n";
     
     let sumPrizes = 0;
     let sumTickets = 0;
     Object.entries(vendorTotals).forEach(([vid, totals]) => {
         const net = totals.gross - totals.commission - totals.prizesPaid;
         const perc = commissionMap[vid] !== undefined ? commissionMap[vid] : 0;
         const row = `${vid};${perc}%;${totals.ticketCount};${totals.gross.toFixed(2)};${totals.commission.toFixed(2)};${totals.prizesPaid.toFixed(2)};${net.toFixed(2)}`;
         csvContent += row + "\n";
         sumPrizes += totals.prizesPaid;
         sumTickets += totals.ticketCount;
     });
     
     csvContent += `\nTOTALES;;${sumTickets};${globalGross.toFixed(2)};${globalCommission.toFixed(2)};${sumPrizes.toFixed(2)};${(globalGross - globalCommission - sumPrizes).toFixed(2)}\n`;
     
     const encodedUri = encodeURI(csvContent);
     const link = document.createElement("a");
     link.setAttribute("href", encodedUri);
     link.setAttribute("download", `resumen_contable_${startDate}_al_${endDate}.csv`);
     document.body.appendChild(link);
     link.click();
     try { document.body.removeChild(link); } catch (e) {}
  };

  const handleExportDetailedTicketsCSV = () => {
     let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
     csvContent += "ID Ticket;Fecha / Hora;Vendedor;Cliente;Monto Total ($);Estado;Sorteos y Jugadas\n";

     activeTickets.forEach(t => {
        const rawVid = t.vendor_id?.toString() || 'desconocido';
        const vendor = usernameMap[rawVid] || rawVid;
        const dateStr = new Date(t.created_at).toLocaleString('es-PA');
        const client = (t.client_name || 'General').replace(/;/g, ',');
        const total = parseFloat(t.total_amount || '0').toFixed(2);
        const status = t.status || 'active';
        const playsSummary = (t.ticket_numbers || [])
           .map((tn: any) => `${tn.draw_id}:${tn.number_played}=${tn.amount}v`)
           .join(' | ');

        csvContent += `${t.id};${dateStr};${vendor};${client};${total};${status};"${playsSummary}"\n`;
     });

     const encodedUri = encodeURI(csvContent);
     const link = document.createElement("a");
     link.setAttribute("href", encodedUri);
     link.setAttribute("download", `detalle_boletos_${startDate}_al_${endDate}.csv`);
     document.body.appendChild(link);
     link.click();
     try { document.body.removeChild(link); } catch (e) {}
  };

  return (
    <div className="rpt-root" style={{ padding: '2rem', backgroundColor: '#f4f7f6', minHeight: '100%', color: '#333' }}>
      <style>{`
        @media (max-width: 768px) {
          .rpt-root { padding: 0.75rem !important; padding-bottom: 4rem !important; }
          .rpt-header { flex-direction: column !important; align-items: flex-start !important; gap: 0.75rem !important; }
          .rpt-header-actions { width: 100% !important; flex-wrap: wrap !important; }
          .rpt-filter-bar { flex-direction: column !important; align-items: stretch !important; }
          .rpt-cards-grid { grid-template-columns: 1fr 1fr !important; gap: 0.75rem !important; }
          .rpt-money-grid { grid-template-columns: 1fr !important; gap: 0.75rem !important; }
          .rpt-modal-grid { grid-template-columns: 1fr !important; }
          .rpt-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
          .rpt-table-wrap table { min-width: 600px; }
          .rpt-lottery-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 400px) {
          .rpt-root { padding: 0.5rem !important; padding-bottom: 4rem !important; }
          .rpt-cards-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
      
      {/* HEADER PAGE */}
      <div className="rpt-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: '1rem 1.5rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1.5rem' }}>
         <div>
           <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#17233D', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
             <Activity size={20} color="#3399ff" /> Panel de Utilidades Globales
           </h2>
           <span style={{ fontSize: '0.85rem', color: '#6c757d' }}>Visualiza las ventas y rendimientos de toda tu red de banqueros.</span>
         </div>
         <div className="rpt-header-actions" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
           <button onClick={handleExportCSV} disabled={loading || Object.keys(vendorTotals).length === 0} style={{ backgroundColor: '#10b981', color: '#fff', padding: '0.6rem 1rem', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem', border: 'none', cursor: 'pointer' }}>
             <Download size={16} /> Resumen CSV
           </button>
           <button onClick={handleExportDetailedTicketsCSV} disabled={loading || activeTickets.length === 0} style={{ backgroundColor: '#0284c7', color: '#fff', padding: '0.6rem 1rem', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem', border: 'none', cursor: 'pointer' }}>
             <Download size={16} /> Detalle Boletos CSV
           </button>
           <button onClick={fetchGlobalSales} style={{ backgroundColor: '#3399ff', color: '#fff', padding: '0.6rem 1rem', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem', border: 'none', cursor: 'pointer' }}>
             Actualizar Data
           </button>
         </div>
      </div>

      {/* FILTER BAR */}
      <div className="rpt-filter-bar" style={{ display: 'flex', gap: '1rem', backgroundColor: '#fff', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
         <div style={{ flex: 1, minWidth: '150px' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', color: '#6c757d', marginBottom: '0.5rem' }}>Fecha Inicio</label>
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ padding: '0.8rem', borderRadius: '6px', border: '1px solid #ced4da', width: '100%', fontSize: '0.95rem' }}
            />
         </div>
         <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBottom: '0.8rem', color: '#cbd5e1' }}>
            <ArrowRight size={20} />
         </div>
         <div style={{ flex: 1, minWidth: '150px' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', color: '#6c757d', marginBottom: '0.5rem' }}>Fecha Fin</label>
            <input 
              type="date" 
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ padding: '0.8rem', borderRadius: '6px', border: '1px solid #ced4da', width: '100%', fontSize: '0.95rem' }}
            />
         </div>
         <div style={{ flex: 1, minWidth: '150px' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', color: '#6c757d', marginBottom: '0.5rem' }}>Cajero</label>
            <select 
              value={selectedVendor}
              onChange={(e) => setSelectedVendor(e.target.value)}
              style={{ padding: '0.8rem', borderRadius: '6px', border: '1px solid #ced4da', width: '100%', fontSize: '0.95rem', backgroundColor: '#fff', fontWeight: 'bold' }}
            >
               <option value="all">Todos los Cajeros</option>
               {Object.keys(vendorTotals).map(vid => (
                  <option key={vid} value={vid}>{vid}</option>
               ))}
            </select>
         </div>
         <div style={{ flex: 1, minWidth: '150px' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', color: '#6c757d', marginBottom: '0.5rem' }}>Modalidad</label>
            <select 
              value={selectedModality}
              onChange={(e) => setSelectedModality(e.target.value as any)}
              style={{ padding: '0.8rem', borderRadius: '6px', border: '1px solid #3b82f6', width: '100%', fontSize: '0.95rem', backgroundColor: '#eff6ff', fontWeight: 'bold', color: '#1e40af' }}
            >
               <option value="all">Todas ($0.20 + $0.25)</option>
               <option value="0.20">Solo Modalidad $0.20</option>
               <option value="0.25">Solo Modalidad $0.25</option>
            </select>
         </div>
         <button 
           onClick={fetchGlobalSales}
           disabled={loading}
           style={{ padding: '0.8rem 1.5rem', height: '48px', border: 'none', backgroundColor: '#17233D', color: '#fff', borderRadius: '6px', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
         >
            <Calendar size={18} /> {loading ? 'Calculando...' : 'Filtrar Periodo'}
         </button>
      </div>

      {/* GLOBAL SUMMARY (OPERATIVO) */}
      <div className="rpt-cards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
         <div style={{ backgroundColor: '#fff', padding: '1.4rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.04)', borderLeft: '5px solid #3b82f6' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tickets Emitidos</p>
            <h3 style={{ margin: '0.5rem 0 0 0', fontSize: '2rem', fontWeight: 800, color: '#1e293b' }}>{displayTotalIssued}</h3>
         </div>
         <div style={{ backgroundColor: '#fff', padding: '1.4rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.04)', borderLeft: '5px solid #10b981' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tickets Activos</p>
            <h3 style={{ margin: '0.5rem 0 0 0', fontSize: '2rem', fontWeight: 800, color: '#047857' }}>{displayActiveCount}</h3>
         </div>
         <div style={{ backgroundColor: '#fff', padding: '1.4rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.04)', borderLeft: '5px solid #ef4444' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tickets Anulados</p>
            <h3 style={{ margin: '0.5rem 0 0 0', fontSize: '2rem', fontWeight: 800, color: '#ef4444' }}>{displayCancelledCount} <span style={{fontSize:'1rem', color:'#94a3b8', fontWeight: 600}}>(-${displayCancelledAmount.toFixed(2)})</span></h3>
         </div>
      </div>

      {/* TOP LOTTERIES */}
      {sortedLotteries.length > 0 && (
         <div style={{ backgroundColor: '#fff', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.15rem', color: '#17233D', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold' }}>
               <Activity size={20} color="#f59e0b" /> Sorteos con Mayor Actividad
            </h3>
            <div className="rpt-lottery-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
               {sortedLotteries.slice(0, 5).map((lottery, idx) => (
                  <div key={lottery.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                     <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                           <span style={{ fontSize: '0.85rem', color: '#475569', fontWeight: 900, backgroundColor: '#e2e8f0', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>#{idx + 1}</span>
                           <span style={{ fontSize: '1.05rem', color: '#0f172a', fontWeight: 'bold' }}>{lottery.name}</span>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '600' }}>{lottery.viles.toLocaleString()} viles jugados</div>
                     </div>
                     <span style={{ fontSize: '1.4rem', color: '#15803d', fontWeight: 900 }}>${lottery.usd.toFixed(2)}</span>
                  </div>
               ))}
            </div>
         </div>
      )}

      {/* GLOBAL TICKERS */}
      <div className="rpt-money-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
         <div style={{ backgroundColor: '#fff', padding: '1.6rem', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.04)', borderLeft: '5px solid #3b82f6' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#6c757d', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>
               {selectedModality !== 'all' ? `Venta ($${selectedModality})` : (isGlobal ? "Venta Bruta Global" : "Venta Bruta Cajero")}
            </p>
            <h3 style={{ margin: '0.5rem 0 0 0', fontSize: '2.3rem', fontWeight: 800, color: '#17233D' }}>${displayGross.toFixed(2)}</h3>
         </div>
         <div style={{ backgroundColor: '#fff', padding: '1.6rem', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.04)', borderLeft: '5px solid #f59e0b' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#6c757d', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>
               {isGlobal ? "Comisiones Pagadas" : "Comisiones Cajero"}
            </p>
            <h3 style={{ margin: '0.5rem 0 0 0', fontSize: '2.3rem', fontWeight: 800, color: '#d97706' }}>${displayCommission.toFixed(2)}</h3>
         </div>
         <div style={{ backgroundColor: '#fff', padding: '1.6rem', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.04)', borderLeft: '5px solid #ef4444' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#6c757d', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>
               {isGlobal ? "Premios Pagados" : "Premios Cajero"}
            </p>
            <h3 style={{ margin: '0.5rem 0 0 0', fontSize: '2.3rem', fontWeight: 800, color: '#dc2626' }}>${displayPrizes.toFixed(2)}</h3>
         </div>
         <div style={{ backgroundColor: '#0f172a', padding: '1.6rem', borderRadius: '8px', boxShadow: '0 6px 16px rgba(15,23,42,0.3)', borderLeft: '5px solid #10b981', color: '#fff' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>
               {isGlobal ? "Utilidad Líquida a Recibir" : "Utilidad Líquida Cajero"}
            </p>
            <h3 style={{ margin: '0.5rem 0 0 0', fontSize: '2.5rem', fontWeight: 900, color: '#4ade80', textShadow: '0 0 12px rgba(74,222,128,0.2)' }}>
               ${displayNet.toFixed(2)}
            </h3>
         </div>
      </div>


      {/* ANALYTICS BY MODALITY */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
         {/* 0.20 BLOCK */}
         <div style={{ backgroundColor: '#fff', padding: '1.8rem', borderRadius: '10px', boxShadow: '0 4px 6px rgba(0,0,0,0.04)', borderTop: '5px solid #64748b', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.2rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.8rem' }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <Activity size={22} color="#64748b" />
                  <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 'bold', color: '#1e293b', textTransform: 'uppercase' }}>Modalidad $0.20</h3>
               </div>
               <span style={{ fontSize: '0.85rem', fontWeight: 'bold', backgroundColor: '#f1f5f9', padding: '0.2rem 0.6rem', borderRadius: '12px', color: '#475569' }}>Paga x11</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', fontSize: '1rem' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#64748b', fontWeight: '600' }}>Tickets Vendidos:</span>
                  <span style={{ fontWeight: 800, fontSize: '1.15rem', color: '#1e293b' }}>{display020Tickets}</span>
               </div>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#64748b', fontWeight: '600' }}>Venta Bruta:</span>
                  <span style={{ fontWeight: 800, fontSize: '1.25rem', color: '#2563eb' }}>${display020Ventas.toFixed(2)}</span>
               </div>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#64748b', fontWeight: '600' }}>Premios Pagados:</span>
                  <span style={{ fontWeight: 800, fontSize: '1.25rem', color: '#dc2626' }}>-${display020Premios.toFixed(2)}</span>
               </div>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#64748b', fontWeight: '600' }}>Comisiones (10%):</span>
                  <span style={{ fontWeight: 800, fontSize: '1.25rem', color: '#d97706' }}>-${display020Comisiones.toFixed(2)}</span>
               </div>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.6rem', paddingTop: '0.8rem', borderTop: '2px dashed #cbd5e1' }}>
                  <span style={{ color: '#0f172a', fontWeight: 'bold', fontSize: '1.1rem' }}>GANANCIA NETA:</span>
                  <span style={{ fontWeight: 900, fontSize: '1.5rem', color: (display020Ventas - display020Premios - display020Comisiones) >= 0 ? '#16a34a' : '#ef4444' }}>
                     ${(display020Ventas - display020Premios - display020Comisiones).toFixed(2)}
                  </span>
               </div>
            </div>
         </div>

         {/* 0.25 BLOCK */}
         <div style={{ backgroundColor: '#fff', padding: '1.8rem', borderRadius: '10px', boxShadow: '0 4px 6px rgba(0,0,0,0.04)', borderTop: '5px solid #0284c7', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.2rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.8rem' }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <Activity size={22} color="#0284c7" />
                  <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 'bold', color: '#0369a1', textTransform: 'uppercase' }}>Modalidad $0.25</h3>
               </div>
               <span style={{ fontSize: '0.85rem', fontWeight: 'bold', backgroundColor: '#e0f2fe', padding: '0.2rem 0.6rem', borderRadius: '12px', color: '#0369a1' }}>Paga x14</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', fontSize: '1rem' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#64748b', fontWeight: '600' }}>Tickets Vendidos:</span>
                  <span style={{ fontWeight: 800, fontSize: '1.15rem', color: '#1e293b' }}>{display025Tickets}</span>
               </div>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#64748b', fontWeight: '600' }}>Venta Bruta:</span>
                  <span style={{ fontWeight: 800, fontSize: '1.25rem', color: '#2563eb' }}>${display025Ventas.toFixed(2)}</span>
               </div>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#64748b', fontWeight: '600' }}>Premios Pagados:</span>
                  <span style={{ fontWeight: 800, fontSize: '1.25rem', color: '#dc2626' }}>-${display025Premios.toFixed(2)}</span>
               </div>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#64748b', fontWeight: '600' }}>Comisiones (10%):</span>
                  <span style={{ fontWeight: 800, fontSize: '1.25rem', color: '#d97706' }}>-${display025Comisiones.toFixed(2)}</span>
               </div>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.6rem', paddingTop: '0.8rem', borderTop: '2px dashed #cbd5e1' }}>
                  <span style={{ color: '#0f172a', fontWeight: 'bold', fontSize: '1.1rem' }}>GANANCIA NETA:</span>
                  <span style={{ fontWeight: 900, fontSize: '1.5rem', color: (display025Ventas - display025Premios - display025Comisiones) >= 0 ? '#16a34a' : '#ef4444' }}>
                     ${(display025Ventas - display025Premios - display025Comisiones).toFixed(2)}
                  </span>
               </div>
            </div>
         </div>
      </div>

      {/* PARTNER SPLIT BLOCK */}
      {store.partnerModeActive && (
         <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '1.5rem', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '2rem', border: '1px solid #e2e8f0' }}>
            <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', color: '#17233D', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertCircle size={18} color="#64748b" /> Distribución de Utilidad Neta
            </h4>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
               <div style={{ padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', fontWeight: 'bold' }}>RESPALDO BASE</p>
                  <h3 style={{ margin: '0.5rem 0 0 0', fontSize: '1.4rem', color: '#0f172a' }}>${Number(store.partnerCapital).toFixed(2)}</h3>
               </div>
               
               {store.partnerReinvestPct > 0 && (
                 <div style={{ padding: '1rem', backgroundColor: '#ecfdf5', borderRadius: '8px', border: '1px dashed #6ee7b7' }}>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#15803d', fontWeight: 'bold' }}>CRECIMIENTO BANCA ({store.partnerReinvestPct}%)</p>
                    <h3 style={{ margin: '0.5rem 0 0 0', fontSize: '1.4rem', color: displayNet >= 0 ? '#10b981' : '#dc3545' }}>
                       ${(displayNet * (store.partnerReinvestPct / 100)).toFixed(2)}
                    </h3>
                 </div>
               )}
               
               <div style={{ padding: '1rem', backgroundColor: '#f5f3ff', borderRadius: '8px', border: '1px dashed #c4b5fd' }}>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#8b5cf6', fontWeight: 'bold' }}>SOCIO ({store.partnerSplit}%)</p>
                  <h3 style={{ margin: '0.5rem 0 0 0', fontSize: '1.4rem', color: displayNet >= 0 ? '#8b5cf6' : '#dc3545' }}>
                     ${(displayNet * (store.partnerSplit / 100)).toFixed(2)}
                  </h3>
               </div>
               
               <div style={{ padding: '1rem', backgroundColor: '#eff6ff', borderRadius: '8px', border: '1px dashed #93c5fd' }}>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#3b82f6', fontWeight: 'bold' }}>ADMIN ({100 - store.partnerSplit - (store.partnerReinvestPct || 0)}%)</p>
                  <h3 style={{ margin: '0.5rem 0 0 0', fontSize: '1.4rem', color: displayNet >= 0 ? '#3b82f6' : '#dc3545' }}>
                     ${(displayNet * ((100 - store.partnerSplit - (store.partnerReinvestPct || 0)) / 100)).toFixed(2)}
                  </h3>
               </div>
            </div>
         </div>
      )}

      {/* VENDOR BREAKDOWN TABLE */}
      <div style={{ backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
         <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#17233D' }}>Desglose por Cajero/Usuario</h3>
            <span style={{ fontSize: '0.85rem', color: '#6c757d', backgroundColor: '#f8fafc', padding: '0.2rem 0.6rem', borderRadius: '12px' }}>
              {Object.keys(vendorTotals).length} cajero(s) activos en periodo
            </span>
         </div>
         
         <div className="rpt-table-wrap">
         {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
               Cargando transacciones de cajeros...
            </div>
         ) : Object.keys(vendorTotals).length > 0 ? (
            <table style={{ width: '100%', minWidth: '600px', borderCollapse: 'collapse', textAlign: 'left' }}>
               <thead>
                 <tr style={{ backgroundColor: '#f8fafc', color: '#64748b', fontSize: '0.85rem', textTransform: 'uppercase' }}>
                   <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0' }}>ID Vendedor</th>
                   <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0', textAlign: 'right' }}>% Coms</th>
                   <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0', textAlign: 'right' }}>Cant. Tickets</th>
                   <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0', textAlign: 'right' }}>Venta Bruta</th>
                   <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0', textAlign: 'right' }}>Comisión</th>
                   <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0', textAlign: 'right', color: '#ef4444' }}>Premios Pagados</th>
                   <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 'bold', color: '#17233D' }}>Efectivo a Entregar</th>
                 </tr>
               </thead>
               <tbody>
                  {Object.entries(vendorTotals).sort(([,a],[,b]) => { const netA = a.gross - a.commission - a.prizesPaid; const netB = b.gross - b.commission - b.prizesPaid; return netB - netA; }).map(([vid, totals]) => {
                     const net = totals.gross - totals.commission - totals.prizesPaid;
                     const percentage = commissionMap[vid];
                     const isExpanded = expandedVendor === vid;
                     
                     return (
                       <React.Fragment key={vid}>
                         <tr style={{ borderBottom: isExpanded ? 'none' : '1px solid #f1f5f9', cursor: 'pointer', backgroundColor: isExpanded ? '#f8fafc' : 'transparent' }} onClick={() => setExpandedVendor(isExpanded ? null : vid)}>
                           <td style={{ padding: '1rem 1.5rem', fontWeight: 'bold', color: '#334155' }}>
                             <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                               <div style={{ width: '28px', height: '28px', backgroundColor: '#e0f2fe', color: '#0284c7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>
                                 {vid.charAt(0).toUpperCase()}
                               </div>
                               {vid}
                               {isExpanded ? <ChevronUp size={16} color="#64748b" /> : <ChevronDown size={16} color="#64748b" />}
                             </div>
                           </td>
                           <td style={{ padding: '1rem 1.5rem', textAlign: 'right', color: '#64748b' }}>
                             {percentage !== undefined ? `${percentage}%` : 'N/A'}
                           </td>
                           <td style={{ padding: '1rem 1.5rem', textAlign: 'right', color: '#64748b' }}>
                             {totals.ticketCount}
                           </td>
                           <td style={{ padding: '1rem 1.5rem', textAlign: 'right', color: '#475569' }}>
                             ${totals.gross.toFixed(2)}
                           </td>
                           <td style={{ padding: '1rem 1.5rem', textAlign: 'right', color: '#f59e0b' }}>
                             - ${totals.commission.toFixed(2)}
                           </td>
                           <td style={{ padding: '1rem 1.5rem', textAlign: 'right', color: '#ef4444', fontWeight: 'bold' }}>
                             - ${totals.prizesPaid.toFixed(2)}
                           </td>
                           <td style={{ padding: '1rem 1.5rem', textAlign: 'right', fontWeight: 'bold', color: net >= 0 ? '#10b981' : '#ef4444' }}>
                             ${net.toFixed(2)}
                           </td>
                         </tr>
                         
                         {isExpanded && (
                           <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                             <td colSpan={7} style={{ padding: '0 1.5rem 1.5rem 1.5rem' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', backgroundColor: '#fff', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                   
                                   {/* Desglose de Modalidades */}
                                   <div>
                                      <h4 style={{ margin: '0 0 1rem 0', color: '#334155', fontSize: '0.9rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>Desglose por Modalidad</h4>
                                      <div style={{ display: 'flex', gap: '1rem' }}>
                                         <div style={{ flex: 1, backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '6px' }}>
                                            <p style={{ margin: 0, fontWeight: 'bold', color: '#64748b', fontSize: '0.8rem' }}>Banca $0.20</p>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.85rem' }}><span>Venta:</span> <strong>${totals.ventas020.toFixed(2)}</strong></div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.3rem', fontSize: '0.85rem' }}><span>Premios:</span> <strong style={{color:'#ef4444'}}>-${totals.premios020.toFixed(2)}</strong></div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.3rem', fontSize: '0.85rem', borderTop: '1px dashed #cbd5e1', paddingTop: '0.3rem' }}><span>Neto:</span> <strong>${(totals.ventas020 - totals.premios020 - totals.comisiones020).toFixed(2)}</strong></div>
                                         </div>
                                         <div style={{ flex: 1, backgroundColor: '#f0f9ff', padding: '1rem', borderRadius: '6px' }}>
                                            <p style={{ margin: 0, fontWeight: 'bold', color: '#0284c7', fontSize: '0.8rem' }}>Banca $0.25</p>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.85rem' }}><span>Venta:</span> <strong>${totals.ventas025.toFixed(2)}</strong></div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.3rem', fontSize: '0.85rem' }}><span>Premios:</span> <strong style={{color:'#ef4444'}}>-${totals.premios025.toFixed(2)}</strong></div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.3rem', fontSize: '0.85rem', borderTop: '1px dashed #cbd5e1', paddingTop: '0.3rem' }}><span>Neto:</span> <strong>${(totals.ventas025 - totals.premios025 - totals.comisiones025).toFixed(2)}</strong></div>
                                         </div>
                                      </div>
                                   </div>
                                   
                                   {/* Sorteos más vendidos de este cajero */}
                                   <div>
                                      <h4 style={{ margin: '0 0 1rem 0', color: '#334155', fontSize: '0.9rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>Sorteos Vendidos</h4>
                                      <div style={{ maxHeight: '140px', overflowY: 'auto' }}>
                                        {Object.entries(totals.lotterySalesViles).length > 0 ? (
                                           <table style={{ width: '100%', fontSize: '0.85rem' }}>
                                              <tbody>
                                                 {Object.entries(totals.lotterySalesViles)
                                                    .sort(([, aViles], [, bViles]) => (bViles as number) - (aViles as number))
                                                    .map(([drawId, viles]) => {
                                                       const lotteryConfig = LOTTERY_SCHEDULE.find(l => l.id === drawId);
                                                       const name = lotteryConfig ? `${lotteryConfig.name} ${lotteryConfig.hour > 12 ? lotteryConfig.hour - 12 : (lotteryConfig.hour === 0 ? 12 : lotteryConfig.hour)}:${lotteryConfig.minute.toString().padStart(2, '0')} ${lotteryConfig.hour >= 12 ? 'PM' : 'AM'}` : drawId;
                                                       const usd = totals.lotterySalesUSD[drawId] || 0;
                                                       return (
                                                          <tr key={drawId}>
                                                             <td style={{ padding: '0.3rem 0', color: '#475569' }}>{name}</td>
                                                             <td style={{ padding: '0.3rem 0', textAlign: 'right', fontWeight: 'bold' }}>{viles as number} viles (${usd.toFixed(2)})</td>
                                                          </tr>
                                                       );
                                                    })
                                                 }
                                              </tbody>
                                           </table>
                                        ) : (
                                           <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Sin ventas de sorteos registradas.</p>
                                        )}
                                      </div>
                                   </div>

                                </div>
                             </td>
                           </tr>
                         )}
                       </React.Fragment>
                     );
                  })}
               </tbody>
            </table>
         ) : (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
               <AlertCircle size={32} style={{ opacity: 0.5, marginBottom: '1rem' }} />
               <p style={{ margin: 0 }}>No hay ventas registradas en el rango seleccionado.</p>
            </div>
         )}
         </div>{/* end rpt-table-wrap */}
      </div>

    </div>
  );
}
