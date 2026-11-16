import { getLocalISODate, getStartOfDayUTC, getEndOfDayUTC } from '../../utils/dateUtils';
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../utils/supabase';
import { Search, RotateCcw, Undo2, Edit3 } from 'lucide-react';
import { useStore } from '../../store/useStore';
import TicketDetailsModal from '../../components/TicketDetailsModal';
import { isGranjitaLottery } from '../../utils/lotteryRules';
import { formatAnimalDisplay } from '../../utils/granjitaAnimals';

export default function TicketsManager() {
  const store = useStore();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<any[]>([]);
  const [payoutsMap, setPayoutsMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [filterDate, setFilterDate] = useState(() => getLocalISODate());
  const [filterVendor, setFilterVendor] = useState<string>('all');
  const [filterModality, setFilterModality] = useState<'all' | 'regular' | 'granjita'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'cancelled' | 'paid'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [vendors, setVendors] = useState<string[]>([]);
  const [viewingTicketId, setViewingTicketId] = useState<string | null>(null);

  const currentUser = store.currentUser;
  const isSubAdmin = currentUser?.isSubAdmin;
  const subAdminVendorIds = isSubAdmin
    ? store.users
        .filter(u => u.parentAdminId === currentUser?.username)
        .map(u => u.username)
        .concat(currentUser?.username || '')
    : null;

  useEffect(() => {
    // Populate vendors dropdown based on users in the system and existing tickets
    const fetchVendors = async () => {
      const vSet = new Set<string>();
      store.users
        .filter(u => u.role === 'Vendedor' || u.role === 'Admin')
        .filter(u => !isSubAdmin || u.parentAdminId === currentUser?.username || u.username === currentUser?.username)
        .forEach(u => {
          if (u.username) vSet.add(u.username);
        });
      
      let query = supabase.from('tickets').select('vendor_id').gte('created_at', getStartOfDayUTC(filterDate)).lte('created_at', getEndOfDayUTC(filterDate));
      if (subAdminVendorIds && subAdminVendorIds.length > 0) {
        query = query.in('vendor_id', subAdminVendorIds);
      }
      const { data } = await query;
      if (data) {
        data.forEach(t => {
           if (t.vendor_id) {
             if (!isSubAdmin || subAdminVendorIds?.includes(t.vendor_id)) {
               vSet.add(t.vendor_id);
             }
           }
        });
      }
      setVendors(Array.from(vSet));
    };
    fetchVendors();
  }, [filterDate, store.users, isSubAdmin]);

  const loadTickets = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('tickets')
        .select('*, ticket_numbers(draw_id, number_played, amount)')
        .gte('created_at', getStartOfDayUTC(filterDate))
        .lte('created_at', getEndOfDayUTC(filterDate))
        .eq('is_bank_prize', false)
        .order('created_at', { ascending: false });
        
      if (filterVendor !== 'all') {
         query = query.eq('vendor_id', filterVendor);
      } else if (subAdminVendorIds && subAdminVendorIds.length > 0) {
         query = query.in('vendor_id', subAdminVendorIds);
      }

      const { data, error } = await query;
      if (!error && data) {
         setTickets(data);

         // Fetch payouts for these tickets
         const tIds = data.map(t => t.id);
         if (tIds.length > 0) {
           const pMap: Record<string, number> = {};
           const chunks: string[][] = [];
           for (let i = 0; i < tIds.length; i += 30) {
             chunks.push(tIds.slice(i, i + 30));
           }
           const pBatches = await Promise.all(
             chunks.map(chunk => supabase.from('payouts').select('ticket_id, amount').in('ticket_id', chunk))
           );
           pBatches.forEach(({ data: pRows }) => {
             pRows?.forEach((p: any) => {
               pMap[p.ticket_id] = (pMap[p.ticket_id] || 0) + (parseFloat(p.amount) || 0);
             });
           });
           setPayoutsMap(pMap);
         } else {
           setPayoutsMap({});
         }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadTickets();

    const channel = supabase
      .channel('tickets-manager-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tickets' },
        () => {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            loadTickets();
          }, 600);
        }
      )
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [filterDate, filterVendor]);

  const handleAnular = async (ticket: any) => {
    const shortId = ticket.id.split('-')[0].toUpperCase();
    const reason = window.prompt(
      `¿Confirmas anular administrativamente el ticket #${shortId} ($${parseFloat(ticket.total_amount).toFixed(2)})?\n\nIngresa el motivo (ej. Error de número / Venta equivocada):`,
      'Error de digitación'
    );
    if (reason === null) return; // User cancelled prompt

    try {
      setLoading(true);
      const { error } = await supabase
        .from('tickets')
        .update({ status: 'cancelled' })
        .eq('id', ticket.id);

      if (!error) {
         await loadTickets();
         alert(`Ticket #${shortId} ANULADO correctamente.`);
      } else {
         alert('Error al anular: ' + error.message);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleReactivar = async (ticket: any) => {
    const shortId = ticket.id.split('-')[0].toUpperCase();
    if (!window.confirm(`¿Confirmas que deseas REACTIVAR el ticket #${shortId} ($${parseFloat(ticket.total_amount).toFixed(2)})?\n\nVolverá a ser una venta activa y válida en la banca.`)) return;

    try {
      setLoading(true);
      const { error } = await supabase
        .from('tickets')
        .update({ status: 'active' })
        .eq('id', ticket.id);

      if (!error) {
        await loadTickets();
        alert(`Ticket #${shortId} REACTIVADO exitosamente.`);
      } else {
        alert('Error al reactivar: ' + error.message);
      }
    } catch (err: any) {
      console.error(err);
      alert('Error al reactivar ticket: ' + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  const handleRevertirPago = async (ticket: any) => {
    const shortId = ticket.id.split('-')[0].toUpperCase();
    const paidAmt = payoutsMap[ticket.id] || 0;
    const msg = `⚠️ ¿Confirmas que deseas REVERTIR EL PAGO DE PREMIO del ticket #${shortId}?\n\n` +
      `• Monto pagado registrado: $${paidAmt.toFixed(2)}\n` +
      `• El registro de desembolso se eliminará de 'payouts'.\n` +
      `• El vendedor ya no tendrá ese dinero descontado de su cuadre.\n` +
      `• El ticket volverá a estado 'Activo' (no pagado).`;

    if (!window.confirm(msg)) return;

    try {
      setLoading(true);
      const { error: pErr } = await supabase.from('payouts').delete().eq('ticket_id', ticket.id);
      if (pErr) throw pErr;

      const { error: tErr } = await supabase.from('tickets').update({ status: 'active' }).eq('id', ticket.id);
      if (tErr) throw tErr;

      await loadTickets();
      alert(`Pago de premio del ticket #${shortId} revertido con éxito.`);
    } catch (err: any) {
      console.error(err);
      alert('Error al revertir premio: ' + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  const handleCorregirJugada = (ticket: any) => {
    const lotIds = Array.from(new Set(ticket.ticket_numbers?.map((tn: any) => tn.draw_id) || []));
    const plays = ticket.ticket_numbers?.map((tn: any) => ({
      number: String(tn.number_played),
      amount: parseFloat(tn.amount) || 1
    })) || [];

    const draft = {
      sourceTicketId: ticket.id,
      clientName: ticket.client_name || '',
      vendorId: ticket.vendor_id || '',
      selectedLotteryIds: lotIds,
      plays
    };

    localStorage.setItem('manual_sale_correction_draft', JSON.stringify(draft));
    navigate('/admin/manual-sale?correction=true');
  };

  const handlePrint = async (ticket: any) => {
    try {
      const newCount = (ticket.reprint_count || 0) + 1;
      await supabase.from('tickets').update({ reprint_count: newCount }).eq('id', ticket.id);
      loadTickets();
    } catch (e) {
      console.warn("Could not update reprint count:", e);
    }

    const shortId = ticket.id.split('-')[0].toUpperCase();
    const vendorName = ticket.vendor_id || 'Caja';
    const header = `${store.ticketHeader}\n--------------------------------\nFecha: ${new Date(ticket.created_at).toLocaleString('es-ES')}\nTicket ID: ${shortId}\nCajero: ${vendorName.toUpperCase()}\n\n`;
    
    let itemsStr = "";
    const grouped: Record<string, { name: string, hour: number, minute: number, items: any[] }> = {};
    
    ticket.ticket_numbers?.forEach((item: any) => {
       const lot = store.lotteriesMaster.find(l => l.id === item.draw_id);
       const lotName = lot?.name || item.draw_id;
       const lotHour = lot?.hour || 0;
       const lotMinute = lot?.minute || 0;
       
       if (!grouped[item.draw_id]) {
          grouped[item.draw_id] = { name: lotName, hour: lotHour, minute: lotMinute, items: [] };
       }
       grouped[item.draw_id].items.push(item);
    });

    // Inferred saleMode based on ticket total vs viles count
    const totalViles = ticket.ticket_numbers?.reduce((sum: number, tn: any) => sum + parseFloat(tn.amount || '0'), 0) || 1;
    const inferredMode = (ticket.total_amount / totalViles) >= 0.24 ? 0.25 : 0.20;

    if (Object.keys(grouped).length === 0) {
       itemsStr += "GENERAL\n----------------------\nNUM / VILES / VALOR\n";
       ticket.ticket_numbers?.forEach((item: any) => {
          itemsStr += `${item.number_played.padEnd(4)} / ${item.amount.toString().padStart(3)} v / $${(item.amount * inferredMode).toFixed(2)}\n`;
       });
       itemsStr += "----------------------\n\n";
    } else {
       Object.values(grouped).forEach(group => {
          const ampm = group.hour >= 12 ? 'PM' : 'AM';
          const h = group.hour % 12 || 12;
          const m = group.minute.toString().padStart(2, '0');
          const timeStr = `${h}:${m} ${ampm}`;
          
          itemsStr += `${group.name.toUpperCase()} (${timeStr})\n----------------------\nNUM / VILES / VALOR\n`;
          group.items.forEach(item => {
             itemsStr += `${item.number_played.padEnd(4)} / ${item.amount.toString().padStart(3)} v / $${(item.amount * inferredMode).toFixed(2)}\n`;
          });
          itemsStr += "----------------------\n\n";
       });
    }

    const footerText = `TOTAL A PAGAR: $${parseFloat(ticket.total_amount).toFixed(2)}\n\n----------------------\nID DE COBRO: ${shortId}\n----------------------\n${store.ticketFooter}\n\n\n\n\n\n`;
    const ticketString = header + itemsStr + footerText;
    
    let printDiv = document.getElementById('print-section');
    if (!printDiv) {
      printDiv = document.createElement('div');
      printDiv.id = 'print-section';
      printDiv.className = 'print-only';
      document.body.appendChild(printDiv);
    }
    
    printDiv.innerHTML = `<pre style="font-family:monospace;white-space:pre-wrap;font-size:14px;color:black;text-align:left;">${ticketString}</pre>`;
    setTimeout(() => {
       window.print();
    }, 50);
  };

  // Filter tickets by modality, status and search query
  const filteredTickets = tickets.filter(t => {
    // Modality
    const hasGranjita = t.ticket_numbers?.some((tn: any) => isGranjitaLottery(tn.draw_id));
    if (filterModality === 'granjita' && !hasGranjita) return false;
    if (filterModality === 'regular' && hasGranjita) return false;

    // Status filter
    const isCancelled = t.status === 'cancelled';
    const hasPayout = (payoutsMap[t.id] && payoutsMap[t.id] > 0) || t.status === 'paid';

    if (filterStatus === 'cancelled' && !isCancelled) return false;
    if (filterStatus === 'active' && isCancelled) return false;
    if (filterStatus === 'paid' && !hasPayout) return false;

    // Search query (by ticket id, client name, or vendor)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const matchId = t.id.toLowerCase().includes(q);
      const matchClient = (t.client_name || '').toLowerCase().includes(q);
      const matchVendor = (t.vendor_id || '').toLowerCase().includes(q);
      if (!matchId && !matchClient && !matchVendor) return false;
    }

    return true;
  });

  // Metrics
  const validTickets = filteredTickets.filter(t => t.status !== 'cancelled');
  const totalSales = validTickets.reduce((sum, t) => sum + parseFloat(t.total_amount), 0);
  const cancelledTickets = filteredTickets.filter(t => t.status === 'cancelled');
  const reprintedTickets = filteredTickets.filter(t => (t.reprint_count || 0) > 0);
  const totalReprintCount = filteredTickets.reduce((sum, t) => sum + (t.reprint_count || 0), 0);
  const paidTicketsCount = filteredTickets.filter(t => (payoutsMap[t.id] && payoutsMap[t.id] > 0) || t.status === 'paid').length;

  return (
    <div style={{ padding: '2rem' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.8rem', color: '#17233D', margin: 0, fontWeight: 800 }}>Control y Auditoría de Tickets</h1>
        <p style={{ color: '#5b6b84', margin: '0.4rem 0 0' }}>
          Anulación, reversión de premios, reactivación y corrección rápida de jugadas.
        </p>
      </header>

      {/* Control Panel */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', background: 'white', padding: '1.2rem', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 180px' }}>
          <label style={{ display: 'block', textTransform: 'uppercase', fontSize: '0.72rem', fontWeight: 800, color: '#64748b', marginBottom: '0.4rem' }}>Fecha de Operación</label>
          <input 
            type="date" 
            value={filterDate}
            onChange={e => setFilterDate(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontWeight: 'bold', background: '#f8fafc' }}
          />
        </div>

        <div style={{ flex: '1 1 200px' }}>
          <label style={{ display: 'block', textTransform: 'uppercase', fontSize: '0.72rem', fontWeight: 800, color: '#64748b', marginBottom: '0.4rem' }}>Listar por Vendedor</label>
          <select 
            value={filterVendor}
            onChange={e => setFilterVendor(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontWeight: 'bold', background: '#f8fafc' }}
          >
            <option value="all">TODOS LOS VENDEDORES</option>
            {vendors.map(v => (
               <option key={v} value={v}>{v.toUpperCase()}</option>
            ))}
          </select>
        </div>

        <div style={{ flex: '1 1 180px' }}>
          <label style={{ display: 'block', textTransform: 'uppercase', fontSize: '0.72rem', fontWeight: 800, color: '#64748b', marginBottom: '0.4rem' }}>Modalidad / Lotería</label>
          <select 
            value={filterModality}
            onChange={e => setFilterModality(e.target.value as any)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontWeight: 'bold', color: '#1e293b', background: '#f8fafc' }}
          >
            <option value="all">TODAS LAS MODALIDADES</option>
            <option value="regular">🎲 TIEMPOS / TRADICIONAL</option>
            <option value="granjita">🚜 LA GRANJITA</option>
          </select>
        </div>

        <div style={{ flex: '1 1 180px' }}>
          <label style={{ display: 'block', textTransform: 'uppercase', fontSize: '0.72rem', fontWeight: 800, color: '#64748b', marginBottom: '0.4rem' }}>Estado del Ticket</label>
          <select 
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as any)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontWeight: 'bold', color: '#1e293b', background: '#f8fafc' }}
          >
            <option value="all">TODOS LOS ESTADOS</option>
            <option value="active">🟢 ACTIVOS / VÁLIDOS</option>
            <option value="cancelled">🔴 ANULADOS</option>
            <option value="paid">🏆 PAGADOS / PREMIADOS</option>
          </select>
        </div>

        <div style={{ flex: '1 1 200px' }}>
          <label style={{ display: 'block', textTransform: 'uppercase', fontSize: '0.72rem', fontWeight: 800, color: '#64748b', marginBottom: '0.4rem' }}>Buscar Ticket o Cliente</label>
          <div style={{ position: 'relative' }}>
            <input 
              type="text" 
              placeholder="Ej. 6966AF o Nombre..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', padding: '0.75rem 0.75rem 0.75rem 2.2rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontWeight: 'bold', background: '#f8fafc' }}
            />
            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button onClick={loadTickets} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: '#3b82f6', color: 'white', padding: '0.75rem 1.4rem', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(59,130,246,0.2)' }}>
             <Search size={16} /> Refrescar
          </button>
        </div>
      </div>

      {/* Tarjetas de Metricas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.2rem', marginBottom: '2rem' }}>
         <div style={{ background: '#15803d', color: 'white', padding: '1.2rem', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', opacity: 0.85, fontWeight: 800 }}>Ventas Válidas Totales</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 900 }}>${totalSales.toFixed(2)}</div>
            <span style={{ fontSize: '0.75rem', opacity: 0.9 }}>{validTickets.length} tickets activos</span>
         </div>
         <div style={{ background: 'white', padding: '1.2rem', borderRadius: '12px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b', fontWeight: 800 }}>Tickets Filtrados</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#17233D' }}>{filteredTickets.length}</div>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>De {tickets.length} transacciones del día</span>
         </div>
         <div style={{ background: '#fef2f2', padding: '1.2rem', borderRadius: '12px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)', border: '1px solid #fecaca' }}>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#dc2626', fontWeight: 800 }}>Anulaciones Detectadas</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#dc2626' }}>{cancelledTickets.length}</div>
            <span style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: 'bold' }}>Anulados: ${cancelledTickets.reduce((acc, t) => acc + parseFloat(t.total_amount), 0).toFixed(2)}</span>
         </div>
         <div style={{ background: '#eff6ff', padding: '1.2rem', borderRadius: '12px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)', border: '1px solid #bfdbfe' }}>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#1d4ed8', fontWeight: 800 }}>Premios Pagados</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#1d4ed8' }}>{paidTicketsCount}</div>
            <span style={{ fontSize: '0.75rem', color: '#1e40af', fontWeight: 'bold' }}>{reprintedTickets.length} reimpresos ({totalReprintCount} copias)</span>
         </div>
      </div>

      {/* Tabla */}
      <div style={{ background: 'white', borderRadius: '12px', overflowX: 'auto', WebkitOverflowScrolling: 'touch', boxShadow: '0 4px 10px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0' }}>
        <table style={{ width: '100%', minWidth: '850px', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ background: '#f8fafc', color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            <tr>
              <th style={{ padding: '1rem', borderBottom: '2px solid #e2e8f0' }}>Hora</th>
              <th style={{ padding: '1rem', borderBottom: '2px solid #e2e8f0' }}>Ticket ID</th>
              <th style={{ padding: '1rem', borderBottom: '2px solid #e2e8f0' }}>Vendedor</th>
              <th style={{ padding: '1rem', borderBottom: '2px solid #e2e8f0' }}>Cliente</th>
              <th style={{ padding: '1rem', borderBottom: '2px solid #e2e8f0', textAlign: 'right' }}>Monto</th>
              <th style={{ padding: '1rem', borderBottom: '2px solid #e2e8f0' }}>Detalle de Apuntes</th>
              <th style={{ padding: '1rem', borderBottom: '2px solid #e2e8f0', textAlign: 'center' }}>Estado</th>
              <th style={{ padding: '1rem', borderBottom: '2px solid #e2e8f0', textAlign: 'center' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
               <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: '#8b9bb4', fontWeight: 'bold' }}>Cargando datos del servidor...</td></tr>
            ) : filteredTickets.length === 0 ? (
               <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: '#8b9bb4', fontWeight: 'bold' }}>No hay transacciones que coincidan con estos filtros.</td></tr>
            ) : (
              filteredTickets.map(t => {
                const isGranjita = t.ticket_numbers?.some((tn: any) => isGranjitaLottery(tn.draw_id));
                const reprintCount = t.reprint_count || 0;
                const isCancelled = t.status === 'cancelled';
                const paidAmt = payoutsMap[t.id] || 0;
                const isPaid = paidAmt > 0 || t.status === 'paid';

                return (
                <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9', background: isCancelled ? '#fef2f2' : (isPaid ? '#f0fdf4' : 'white'), opacity: isCancelled ? 0.85 : 1 }}>
                  <td style={{ padding: '0.9rem', color: '#1e293b', fontSize: '0.85rem' }}>{new Date(t.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</td>
                  <td style={{ padding: '0.9rem', fontFamily: 'monospace', color: '#0284c7', fontWeight: 'bold' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                      <span>{t.id.split('-')[0].toUpperCase()}</span>
                      {isGranjita ? (
                        <span style={{ background: '#ecfdf5', color: '#0f766e', border: '1px solid #99f6e4', padding: '0.1rem 0.35rem', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 'bold' }}>
                          🚜 GRANJITA
                        </span>
                      ) : (
                        <span style={{ background: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd', padding: '0.1rem 0.35rem', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 'bold' }}>
                          🎲 TIEMPOS
                        </span>
                      )}
                      {reprintCount > 0 && (
                        <span style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #ffedd5', padding: '0.1rem 0.35rem', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 'bold' }}>
                          🖨️ {reprintCount}x
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '0.9rem', color: '#1e293b', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '0.85rem' }}>{t.vendor_id || 'Anónimo'}</td>
                  <td style={{ padding: '0.9rem', color: '#64748b', fontSize: '0.85rem' }}>{t.client_name || '—'}</td>
                  <td style={{ padding: '0.9rem', textAlign: 'right', fontWeight: 'bold', color: isCancelled ? '#dc2626' : '#10b981', fontSize: '0.95rem' }}>
                    ${parseFloat(t.total_amount || '0').toFixed(2)}
                  </td>
                  <td style={{ padding: '0.9rem', color: isCancelled ? '#dc2626' : (isGranjita ? '#0d9488' : '#3399ff'), fontWeight: 'bold', fontSize: '0.85rem' }}>
                    {isGranjita
                      ? t.ticket_numbers?.map((n: any) => `${formatAnimalDisplay(n.number_played)} (${n.amount}v)`).join(', ')
                      : t.ticket_numbers?.map((n: any) => `${n.number_played} (${n.amount}t)`).join(', ')
                    }
                  </td>
                  
                  {/* ESTADO */}
                  <td style={{ padding: '0.9rem', textAlign: 'center' }}>
                     {isCancelled ? (
                        <span style={{ background: '#fee2e2', color: '#dc2626', padding: '0.25rem 0.6rem', borderRadius: '1rem', fontSize: '0.72rem', fontWeight: 800 }}>
                          🔴 ANULADO
                        </span>
                     ) : isPaid ? (
                        <div>
                          <span style={{ background: '#dcfce7', color: '#15803d', padding: '0.25rem 0.6rem', borderRadius: '1rem', fontSize: '0.72rem', fontWeight: 800 }}>
                            🏆 PAGADO
                          </span>
                          {paidAmt > 0 && (
                            <div style={{ fontSize: '0.7rem', color: '#166534', fontWeight: 'bold', marginTop: '0.15rem' }}>
                              ${paidAmt.toFixed(2)}
                            </div>
                          )}
                        </div>
                     ) : (
                        <span style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', padding: '0.25rem 0.6rem', borderRadius: '1rem', fontSize: '0.72rem', fontWeight: 800 }}>
                          🟢 ACTIVO
                        </span>
                     )}
                  </td>

                  {/* ACCIONES */}
                  <td style={{ padding: '0.9rem', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                      <button 
                        onClick={() => setViewingTicketId(t.id)}
                        style={{ background: '#f8fafc', border: '1px solid #cbd5e1', color: '#475569', padding: '0.35rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 'bold' }}
                        title="Ver comprobante y desglose"
                      >
                        DETALLES
                      </button>

                      <button 
                        onClick={() => handlePrint(t)}
                        style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#2563eb', padding: '0.35rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 'bold' }}
                        title="Reimprimir ticket oficial"
                      >
                        RE-IMPRIMIR
                      </button>

                      {/* Si está cancelado: botón para REACTIVAR */}
                      {isCancelled ? (
                        <button 
                          onClick={() => handleReactivar(t)}
                          style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#15803d', padding: '0.35rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                          title="Restaurar este ticket como venta activa"
                        >
                          <Undo2 size={13} /> REACTIVAR
                        </button>
                      ) : (
                        <>
                          {/* Si está pagado: botón para REVERTIR PAGO DE PREMIO */}
                          {isPaid && (
                            <button 
                              onClick={() => handleRevertirPago(t)}
                              style={{ background: '#fff7ed', border: '1px solid #fdba74', color: '#c2410c', padding: '0.35rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                              title="Cancelar pago de premio y devolver a estado pendiente"
                            >
                              <RotateCcw size={13} /> REVERTIR PAGO
                            </button>
                          )}

                          {/* Botón para CORREGIR / CLONAR JUGADA */}
                          <button 
                            onClick={() => handleCorregirJugada(t)}
                            style={{ background: '#f0fdf4', border: '1px solid #a7f3d0', color: '#047857', padding: '0.35rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                            title="Modificar números en Venta Manual y anular original"
                          >
                            <Edit3 size={13} /> CORREGIR
                          </button>

                          {/* Botón para ANULAR */}
                          <button 
                            onClick={() => handleAnular(t)}
                            style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#dc2626', padding: '0.35rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 800 }}
                            title="Anular ticket administrativamente"
                          >
                            ANULAR
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ); })
            )}
          </tbody>
        </table>
      </div>
      
      {viewingTicketId && <TicketDetailsModal ticketId={viewingTicketId} onClose={() => setViewingTicketId(null)} />}
    </div>
  );
}
