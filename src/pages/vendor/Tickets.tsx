import { getPanamaLocalISODate, getStartOfPanamaDayUTC, getEndOfPanamaDayUTC } from '../../utils/dateUtils';
import { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase';
import { Printer, XCircle } from 'lucide-react';
import { useStore } from '../../store/useStore';
import TicketDetailsModal from '../../components/TicketDetailsModal';
import { Capacitor } from '@capacitor/core';
import { BluetoothSerial } from '@e-is/capacitor-bluetooth-serial';

export default function Tickets() {
  const store = useStore();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingTicketId, setViewingTicketId] = useState<string | null>(null);
  
  // Filtros
  const [filterDate, setFilterDate] = useState(() => getPanamaLocalISODate());
  const [filterLottery, setFilterLottery] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const [payoutsMap, setPayoutsMap] = useState<Record<string, number>>({});

  const fetchTickets = async () => {
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select('*, ticket_numbers(draw_id, number_played, amount)')
        .eq('vendor_id', store.currentUser?.username || 'vendedor_desconocido')
        .gte('created_at', getStartOfPanamaDayUTC(filterDate))
        .lte('created_at', getEndOfPanamaDayUTC(filterDate))
        .order('created_at', { ascending: false });
      
      if (!error && data) {
        setTickets(data);
        // Fetch payouts for these tickets
        const ticketIds = data.map((t: any) => t.id);
        if (ticketIds.length > 0) {
          const { data: payData } = await supabase
            .from('payouts')
            .select('ticket_id, amount, paid_by')
            .in('ticket_id', ticketIds);
          if (payData) {
            const map: Record<string, number> = {};
            payData.forEach((p: any) => {
              if (p.paid_by !== 'EXTERNAL_BANK_REIMBURSEMENT') {
                map[p.ticket_id] = (map[p.ticket_id] || 0) + (parseFloat(p.amount) || 0);
              }
            });
            setPayoutsMap(map);
          }
        } else {
          setPayoutsMap({});
        }
      } else {
        console.error("Supabase Error:", error);
      }
    } catch (err) {
      console.error("Network error on fetchTickets:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchTickets();
  }, [filterDate]);

  // Refrescar cada 10s automáticamente
  useEffect(() => {
    const interval = setInterval(fetchTickets, 10000);
    return () => clearInterval(interval);
  }, [filterDate]);

  const handleAnular = async (ticket: any) => {
    // 1. Verificar si el ticket es del día de hoy y si alguno de sus sorteos ya cerró
    const ticketDate = new Date(ticket.created_at);
    const now = new Date();

    const isToday = (
      ticketDate.getFullYear() === now.getFullYear() &&
      ticketDate.getMonth() === now.getMonth() &&
      ticketDate.getDate() === now.getDate()
    );

    if (isToday) {
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const totalMinutesNow = currentHour * 60 + currentMinute;

      // Verificar sorteos incluidos en este ticket
      if (ticket.ticket_numbers && ticket.ticket_numbers.length > 0) {
        for (const tn of ticket.ticket_numbers) {
          const drawId = tn.draw_id;
          const lotConfig = store.lotteriesMaster.find(l => l.id === drawId);
          if (lotConfig) {
            const lotteryTotalMinutes = lotConfig.hour * 60 + lotConfig.minute;
            const closingTimeMinutes = lotteryTotalMinutes - (lotConfig.closeMinutes ?? 10);
            
            if (totalMinutesNow >= closingTimeMinutes) {
              const formatTime = (h: number, m: number) => {
                const ampm = h >= 12 ? 'PM' : 'AM';
                const hh = h % 12 || 12;
                const mm = m.toString().padStart(2, '0');
                return `${hh}:${mm} ${ampm}`;
              };
              alert(`⛔ NO SE PUEDE ANULAR: El sorteo "${lotConfig.name}" ya cerró a las ${formatTime(lotConfig.hour, lotConfig.minute)}. Por favor contacte al Administrador.`);
              return;
            }
          }
        }
      }
    }

    // 2. Verificar restricción de anulación a 10 minutos desde su emisión
    const timeDiffMinutes = (now.getTime() - ticketDate.getTime()) / (1000 * 60);
    
    if (timeDiffMinutes > 10) {
       alert('⛔ ERROR: El tiempo límite para anular un ticket es de 10 minutos desde su impresión. Por favor contacte al supervisor.');
       return;
    }
    
    if (!window.confirm('¿Seguro que deseas anular este ticket internamente? Estará sujeto a auditoría.')) return;
    
    try {
      const { error } = await supabase
        .from('tickets')
        .update({ status: 'cancelled' })
        .eq('id', ticket.id);

      if (!error) {
        alert('Ticket anulado formalmente en el servidor.');
        fetchTickets(); // Refresh list immediately
      } else {
         console.warn("DB Failed:", error);
         alert('Error CRÍTICO conectando a la base de datos.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handlePrint = async (ticket: any) => {
    const shortId = ticket.id.split('-')[0].toUpperCase();
    const vendorName = store.currentUser?.username || 'Caja';
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

    if (Capacitor.isNativePlatform()) {
      try {
        const targetMac = localStorage.getItem('bt_printer_mac');
        if (!targetMac) {
          alert('¡Impresora no configurada! Ve al menú lateral → "Vincular Impresora" y selecciona tu impresora primero.');
          return;
        }
        await BluetoothSerial.connect({ address: targetMac });
        await BluetoothSerial.write({ address: targetMac, value: ticketString });
        setTimeout(async () => {
          await BluetoothSerial.disconnect({ address: targetMac });
        }, 1000);
      } catch (e: any) {
        // Fallback a RawBT si falla el Bluetooth directo
        window.location.href = 'intent:' + encodeURIComponent(ticketString) + '#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;';
      }
    } else {
      // En navegador/PC: usar RawBT intent o window.print()
      const printDiv = document.getElementById('print-section');
      if (printDiv) {
        printDiv.innerHTML = `<pre style="font-family:monospace;white-space:pre-wrap;font-size:14px;color:black;text-align:left;">${ticketString}</pre>`;
        setTimeout(() => { window.print(); }, 50);
      } else {
        window.location.href = 'intent:' + encodeURIComponent(ticketString) + '#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;';
      }
    }
  };

  // Filtrado de tickets del lado del cliente para mayor rapidez y simplicidad
  const filteredTickets = tickets.filter(t => {
     const matchesLottery = filterLottery === 'all' || t.ticket_numbers?.some((n: any) => n.draw_id === filterLottery);
     const matchesStatus = filterStatus === 'all' || t.status === filterStatus;
     return matchesLottery && matchesStatus;
  });

  return (
    <div className="flex flex-col h-full w-full overflow-hidden" style={{ padding: 'var(--spacing-md)' }}>
      <header className="flex justify-between items-center mb-4 pl-12 md:pl-0">
         <div>
            <h2 className="text-teal-400 font-bold text-xl">Mis Tickets</h2>
            <span className="text-gray-400 text-xs">Consulta de ventas por fecha y sorteo</span>
         </div>
         <button onClick={fetchTickets} className="bg-slate-800 border border-slate-700 text-teal-400 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-700 transition-colors">
            Refrescar
         </button>
      </header>

      {/* Controles de Filtros */}
      <div className="flex flex-col md:flex-row gap-2 bg-slate-900 p-3 rounded-xl border border-slate-800 mb-4">
         <div className="flex-1">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Fecha</label>
            <input 
              type="date" 
              value={filterDate}
              onChange={e => setFilterDate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-teal-300 font-bold p-2 rounded-lg outline-none focus:border-teal-500"
            />
         </div>
         <div className="flex-1">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Sorteo / Lotería</label>
            <select 
              value={filterLottery}
              onChange={e => setFilterLottery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-teal-300 font-bold p-2 rounded-lg outline-none focus:border-teal-500"
            >
              <option value="all">TODOS LOS SORTEOS</option>
              {store.lotteriesMaster.map(l => {
                 const ampm = l.hour >= 12 ? 'PM' : 'AM';
                 const h = l.hour % 12 || 12;
                 const m = l.minute.toString().padStart(2, '0');
                 return (
                    <option key={l.id} value={l.id}>{l.name} ({h}:{m} {ampm})</option>
                 );
              })}
            </select>
         </div>
         <div className="flex-1">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Estado</label>
            <select 
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-teal-300 font-bold p-2 rounded-lg outline-none focus:border-teal-500"
            >
              <option value="all">TODOS LOS ESTADOS</option>
              <option value="active">ACTIVOS</option>
              <option value="paid">PAGADOS / COBRADOS</option>
              <option value="cancelled">ANULADOS</option>
            </select>
         </div>
      </div>

      {/* Lista de Tickets */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-sm pr-1 no-scrollbar mb-4 mt-2">
        {loading ? (
           <div className="text-center py-8 text-gray-500 font-bold animate-pulse">Sincronizando con Supabase...</div>
        ) : filteredTickets.map(t => (
          <div key={t.id} className="surface flex-col gap-sm bg-slate-900 border border-slate-800 p-4 rounded-xl relative shadow-md" style={{ opacity: t.status === 'cancelled' ? 0.5 : 1 }}>
             <div className="flex justify-between items-center" style={{ borderBottom: '1px solid #1e293b', paddingBottom: '0.5rem' }}>
                <div className="flex items-center gap-2">
                   <span className="text-bold text-teal-400 font-mono text-base">Ticket {t.id.split('-')[0].toUpperCase()}</span>
                   {t.status === 'paid' && (
                      <span className="text-blue-400 bg-blue-950/40 text-[10px] font-bold px-2 py-0.5 rounded font-sans uppercase border border-blue-800/30">
                         Pagado
                      </span>
                   )}
                   {t.status === 'cancelled' && (
                      <span className="text-red-400 bg-red-950/40 text-[10px] font-bold px-2 py-0.5 rounded font-sans uppercase border border-red-800/30">
                         Anulado
                      </span>
                   )}
                   {t.status === 'active' && (
                      <span className="text-slate-400 bg-slate-800 text-[10px] font-bold px-2 py-0.5 rounded font-sans uppercase border border-slate-700">
                         Activo
                      </span>
                   )}
                </div>
                <span className={t.status === 'cancelled' ? 'text-red-500 font-mono font-bold text-xs bg-red-950/40 px-2 py-0.5 rounded' : 'text-teal-400 font-mono text-xs font-bold bg-teal-950/40 px-2 py-0.5 rounded'}>
                  {t.ticket_numbers?.map((n: any) => `${n.number_played} (${n.amount}v)`).join(', ')}
                </span>
             </div>
              <div className="flex justify-between items-center text-gray-400 text-xs mt-1">
                 <span>Cliente: <span className="text-white font-bold">{t.client_name || 'General'}</span></span>
                 <span>{new Date(t.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              </div>

              {/* Monto y comisión del ticket */}
              {t.status !== 'cancelled' && (() => {
                const amt = parseFloat(t.total_amount) || 0;
                const commPct = store.currentUser?.commission || 0;
                const comm = amt * (commPct / 100);
                const prize = payoutsMap[t.id] || 0;
                return (
                  <div className="flex justify-between items-center text-xs mt-1 px-1">
                    <span className="text-gray-500">
                      Total: <span className="text-white font-bold">${amt.toFixed(2)}</span>
                    </span>
                    <span className="text-gray-500">
                      Comisión: <span className="text-yellow-400 font-bold">${comm.toFixed(2)}</span>
                    </span>
                    {prize > 0 && (
                      <span className="text-gray-500">
                        Premio: <span className="text-red-400 font-bold">-${prize.toFixed(2)}</span>
                      </span>
                    )}
                  </div>
                );
              })()}
             {/* Acciones del ticket */}
             <div className="flex justify-between gap-sm mt-3 pt-2 border-t border-slate-800/50">
                {t.status !== 'cancelled' ? (
                  <>
                    <button onClick={() => setViewingTicketId(t.id)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-gray-300 py-1.5 rounded-lg text-xs font-bold transition-colors">
                      Detalles
                    </button>
                    <button onClick={() => handlePrint(t)} className="flex-1 bg-blue-900/50 text-blue-300 hover:bg-blue-900 border border-blue-700/50 py-1.5 rounded-lg text-xs font-bold transition-colors flex justify-center items-center gap-1">
                      <Printer size={14} /> Re-imprimir
                    </button>
                    <button onClick={() => handleAnular(t)} className="flex-1 bg-red-950/40 text-red-400 hover:bg-red-900 hover:text-white border border-red-900/30 py-1.5 rounded-lg text-xs font-bold transition-colors flex justify-center items-center gap-1">
                      <XCircle size={14} /> Anular
                    </button>
                  </>
                ) : (
                  <span className="text-red-500 text-bold text-center w-full text-xs font-mono uppercase bg-red-950/20 py-1 rounded">TICKET ANULADO</span>
                )}
             </div>
          </div>
        ))}
        {!loading && filteredTickets.length === 0 && (
           <p className="text-gray-500 text-center py-10 italic">No hay tickets registrados con los filtros seleccionados.</p>
        )}
      </div>

      {/* Resumen de Ventas de la lista filtrada */}
      {!loading && filteredTickets.length > 0 && (
        <div className="flex-none surface flex-col gap-1 text-white p-3 rounded-xl border border-slate-800 bg-slate-900 shadow-md mb-16">
          <h3 className="text-teal-400 font-bold mb-1 text-[11px] uppercase tracking-wider border-b border-slate-800 pb-1">Resumen del Filtro</h3>
          {(() => {
            const activeTickets = filteredTickets.filter(t => t.status !== 'cancelled');
            const totalVendido = activeTickets.reduce((acc, t) => acc + (parseFloat(t.total_amount) || 0), 0);
            const commPct = store.currentUser?.commission || 0;
            const comision = totalVendido * (commPct / 100);
            const totalPremios = activeTickets.reduce((acc, t) => acc + (payoutsMap[t.id] || 0), 0);
            const totalEntregar = totalVendido - comision - totalPremios;
            return (
              <>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-400">Total Vendido:</span>
                  <span className="font-bold text-white">${totalVendido.toFixed(2)}</span>
                </div>

                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-400">Comisión ({commPct}%):</span>
                  <span className="font-bold text-yellow-500">${comision.toFixed(2)}</span>
                </div>

                {totalPremios > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-400">Premios Pagados:</span>
                    <span className="font-bold text-red-400">-${totalPremios.toFixed(2)}</span>
                  </div>
                )}

                <div className="flex justify-between items-center text-sm mt-1 pt-1 border-t border-slate-800">
                  <span className="text-gray-300 font-bold">Total a Entregar:</span>
                  <span className={`font-bold ${totalEntregar >= 0 ? 'text-teal-400' : 'text-red-400'}`}>${totalEntregar.toFixed(2)}</span>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {viewingTicketId && <TicketDetailsModal ticketId={viewingTicketId} onClose={() => setViewingTicketId(null)} />}

    </div>
  );
}
