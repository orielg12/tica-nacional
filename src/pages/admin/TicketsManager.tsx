import { getLocalISODate, getStartOfDayUTC, getEndOfDayUTC } from '../../utils/dateUtils';
import { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase';
import { Search } from 'lucide-react';
import { useStore } from '../../store/useStore';
import TicketDetailsModal from '../../components/TicketDetailsModal';

export default function TicketsManager() {
  const store = useStore();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterDate, setFilterDate] = useState(() => getLocalISODate());
  const [filterVendor, setFilterVendor] = useState<string>('all');
  const [vendors, setVendors] = useState<string[]>([]);
  const [viewingTicketId, setViewingTicketId] = useState<string | null>(null);

  useEffect(() => {
    // Populate vendors dropdown based on users in the system and existing tickets
    const fetchVendors = async () => {
      const vSet = new Set<string>();
      store.users.filter(u => u.role === 'Vendedor' || u.role === 'Admin').forEach(u => {
          if (u.username) vSet.add(u.username);
      });
      
      const { data } = await supabase.from('tickets').select('vendor_id').gte('created_at', getStartOfDayUTC(filterDate)).lte('created_at', getEndOfDayUTC(filterDate));
      if (data) {
        data.forEach(t => {
           if (t.vendor_id) vSet.add(t.vendor_id);
        });
      }
      setVendors(Array.from(vSet));
    };
    fetchVendors();
  }, [filterDate, store.users]);

  const loadTickets = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('tickets')
        .select('*, ticket_numbers(number_played, amount)')
        .gte('created_at', getStartOfDayUTC(filterDate))
        .lte('created_at', getEndOfDayUTC(filterDate))
        .eq('is_bank_prize', false)
        .order('created_at', { ascending: false });
        
      if (filterVendor !== 'all') {
         query = query.eq('vendor_id', filterVendor);
      }

      const { data, error } = await query;
      if (!error && data) {
         setTickets(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, [filterDate, filterVendor]);

  const handleAnular = async (id: string) => {
    if (!window.confirm('¿Confirmas que deseas anular este ticket administrativamente?')) return;
    try {
      const { error } = await supabase.from('tickets').update({ status: 'cancelled' }).eq('id', id);
      if (!error) {
         loadTickets();
      } else {
         alert('Error al anular: ' + error.message);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handlePrint = (ticket: any) => {
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

  // Metrics
  const validTickets = tickets.filter(t => t.status !== 'cancelled');
  const totalSales = validTickets.reduce((sum, t) => sum + parseFloat(t.total_amount), 0);
  const cancelledTickets = tickets.filter(t => t.status === 'cancelled');

  return (
    <div style={{ padding: '2rem' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.8rem', color: '#17233D', margin: 0 }}>Gestión de Tickets</h1>
        <p style={{ color: '#5b6b84', margin: '0.5rem 0 0' }}>Auditoría y control de comprobantes en calle.</p>
      </header>

      {/* Control Panel */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', background: 'white', padding: '1.5rem', borderRadius: '10px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 'bold', color: '#8b9bb4', marginBottom: '0.5rem' }}>Fecha de Operación</label>
          <input 
            type="date" 
            value={filterDate}
            onChange={e => setFilterDate(e.target.value)}
            style={{ width: '100%', padding: '0.8rem', borderRadius: '6px', border: '1px solid #e2e8f0', outline: 'none' }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 'bold', color: '#8b9bb4', marginBottom: '0.5rem' }}>Listar por Vendedor</label>
          <select 
            value={filterVendor}
            onChange={e => setFilterVendor(e.target.value)}
            style={{ width: '100%', padding: '0.8rem', borderRadius: '6px', border: '1px solid #e2e8f0', outline: 'none' }}
          >
            <option value="all">TODOS LOS VENDEDORES</option>
            {vendors.map(v => (
               <option key={v} value={v}>{v.toUpperCase()}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button onClick={loadTickets} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: '#3399ff', color: 'white', padding: '0.8rem 1.5rem', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
             <Search size={18} /> Refrescar
          </button>
        </div>
      </div>

      {/* Tarjetas de Metricas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
         <div style={{ background: '#10b981', color: 'white', padding: '1.5rem', borderRadius: '10px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.8 }}>Ventas Válidas Totales</div>
            <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>${totalSales.toFixed(2)}</div>
         </div>
         <div style={{ background: 'white', padding: '1.5rem', borderRadius: '10px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px', color: '#5b6b84' }}>Tickets Procesados</div>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#17233D' }}>{validTickets.length}</div>
         </div>
         <div style={{ background: '#fef2f2', padding: '1.5rem', borderRadius: '10px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', border: '1px solid #fecaca' }}>
            <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px', color: '#dc2626' }}>Anulaciones Detectadas</div>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#dc2626' }}>{cancelledTickets.length}</div>
            <span style={{ fontSize: '0.8rem', color: '#dc2626', fontWeight: 'bold' }}>Dinero no ingresado: ${cancelledTickets.reduce((acc, t) => acc + parseFloat(t.total_amount), 0).toFixed(2)}</span>
         </div>
      </div>

      {/* Tabla */}
      <div style={{ background: 'white', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ background: '#f8fafc', color: '#5b6b84', fontSize: '0.85rem' }}>
            <tr>
              <th style={{ padding: '1rem', borderBottom: '2px solid #e2e8f0' }}>Hora</th>
              <th style={{ padding: '1rem', borderBottom: '2px solid #e2e8f0' }}>Ticket ID</th>
              <th style={{ padding: '1rem', borderBottom: '2px solid #e2e8f0' }}>Vendedor</th>
              <th style={{ padding: '1rem', borderBottom: '2px solid #e2e8f0' }}>Detalle de Apuntes</th>
              <th style={{ padding: '1rem', borderBottom: '2px solid #e2e8f0' }}>Estado</th>
              <th style={{ padding: '1rem', borderBottom: '2px solid #e2e8f0', textAlign: 'right' }}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
               <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#8b9bb4' }}>Cargando datos del servidor...</td></tr>
            ) : tickets.length === 0 ? (
               <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#8b9bb4' }}>No hay transacciones guardadas.</td></tr>
            ) : (
              tickets.map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9', background: t.status === 'cancelled' ? '#fef2f2' : 'white', opacity: t.status === 'cancelled' ? 0.8 : 1 }}>
                  <td style={{ padding: '1rem', color: '#1e293b' }}>{new Date(t.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</td>
                  <td style={{ padding: '1rem', fontFamily: 'monospace', color: '#3399ff', fontWeight: 'bold' }}>{t.id.split('-')[0].toUpperCase()}</td>
                  <td style={{ padding: '1rem', color: '#1e293b', fontWeight: 'bold', textTransform: 'uppercase' }}>{t.vendor_id || 'Anónimo'}</td>
                  <td style={{ padding: '1rem', color: t.status === 'cancelled' ? '#dc2626' : '#3399ff', fontWeight: 'bold', fontSize: '0.85rem' }}>
                    {t.ticket_numbers?.map((n: any) => `${n.number_played} (${n.amount}t)`).join(', ')}
                  </td>
                  <td style={{ padding: '1rem' }}>
                     {t.status === 'cancelled' ? (
                        <span style={{ background: '#fee2e2', color: '#dc2626', padding: '0.2rem 0.6rem', borderRadius: '1rem', fontSize: '0.75rem', fontWeight: 'bold' }}>ANULADO</span>
                     ) : (
                        <span style={{ background: '#dcfce7', color: '#16a34a', padding: '0.2rem 0.6rem', borderRadius: '1rem', fontSize: '0.75rem', fontWeight: 'bold' }}>ACTIVO</span>
                     )}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                    <button 
                      onClick={() => setViewingTicketId(t.id)}
                      style={{ background: 'transparent', border: '1px solid #94a3b8', color: '#64748b', padding: '0.4rem 0.8rem', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      DETALLES
                    </button>
                    {t.status !== 'cancelled' && (
                       <>
                         <button 
                           onClick={() => handlePrint(t)}
                           style={{ background: 'transparent', border: '1px solid #3b82f6', color: '#3b82f6', padding: '0.4rem 0.8rem', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 'bold' }}
                         >
                           RE-IMPRIMIR
                         </button>
                         <button 
                           onClick={() => handleAnular(t.id)}
                           style={{ background: 'transparent', border: '1px solid #dc2626', color: '#dc2626', padding: '0.4rem 0.8rem', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 'bold' }}
                         >
                           ANULAR
                         </button>
                       </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      {viewingTicketId && <TicketDetailsModal ticketId={viewingTicketId} onClose={() => setViewingTicketId(null)} />}
    </div>
  );
}
