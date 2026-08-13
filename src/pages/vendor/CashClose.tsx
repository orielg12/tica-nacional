import { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase';
import { useStore } from '../../store/useStore';
import { getLocalISODate, getStartOfDayUTC, getEndOfDayUTC } from '../../utils/dateUtils';
import { Printer, Calendar, Banknote } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { BluetoothSerial } from '@e-is/capacitor-bluetooth-serial';

export default function CashClose() {
  const store = useStore();
  const [loading, setLoading] = useState(true);
  
  // Data State
  const [totalSales, setTotalSales] = useState(0);
  const [totalPayouts, setTotalPayouts] = useState(0);
  
  const commissionPerc = store.currentUser?.commission || 0;
  const targetDate = getLocalISODate();

  const fetchCloseData = async () => {
    setLoading(true);
    try {
      const vendorId = store.currentUser?.username || 'vendedor_desconocido';

      // 1. Fetch Sales for Today
      const { data: tickets, error: tErr } = await supabase
        .from('tickets')
        .select('id, total_amount, status')
        .eq('vendor_id', vendorId)
        .gte('created_at', getStartOfDayUTC(targetDate))
        .lte('created_at', getEndOfDayUTC(targetDate));

      let salesCalc = 0;
      if (!tErr && tickets) {
        tickets.forEach(t => {
           if (t.status !== 'cancelled') salesCalc += parseFloat(t.total_amount) || 0;
        });
      }
      setTotalSales(salesCalc);

      // 2. Fetch Payouts for Today's Tickets
      const vendorDbId = store.currentUser?.id || '00000000-0000-0000-0000-000000000000';
      let payoutsCalc = 0;
      if (tickets && tickets.length > 0) {
         const ticketIds = tickets.map(t => t.id);
         const { data: payouts, error: pErr } = await supabase
            .from('payouts')
            .select('amount')
            .eq('paid_by', String(vendorDbId))
            .in('ticket_id', ticketIds);

         if (!pErr && payouts) {
            payouts.forEach(p => payoutsCalc += parseFloat(p.amount) || 0);
         }
      }
      setTotalPayouts(payoutsCalc);

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCloseData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalCommission = totalSales * (commissionPerc / 100);
  const totalNet = totalSales - totalCommission - totalPayouts;

  const handlePrintZ = async () => {
     const text = `${store.ticketHeader}
--------------------------------
CIERRE DE CAJA "Z"
Fecha: ${targetDate}
Cajero: ${store.currentUser?.name || 'Vendedor'}
--------------------------------
Total Vendido: $${totalSales.toFixed(2)}
Comision (${commissionPerc}%): -$${totalCommission.toFixed(2)}
Premios Pagados: -$${totalPayouts.toFixed(2)}
--------------------------------
NETO A ENTREGAR: $${totalNet.toFixed(2)}
--------------------------------
REPORTE OFICIAL DEL TURNO
${store.ticketFooter}

`;
     if (Capacitor.isNativePlatform()) {
         try {
             const targetMac = localStorage.getItem('bt_printer_mac');
             if (!targetMac) {
                 alert("¡Impresora no configurada! Vaya al menú lateral 'Agregar Impresora' primero.");
                 return;
             }
             
             await BluetoothSerial.connect({ address: targetMac });
             await BluetoothSerial.write({ address: targetMac, value: text });
             setTimeout(async () => {
                await BluetoothSerial.disconnect({ address: targetMac });
             }, 1000);
         } catch (e: any) {
             alert("Error Bluetooth Nativo: " + (e.message || JSON.stringify(e)));
             window.location.href = 'intent:' + encodeURIComponent(text) + '#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;';
         }
     } else {
         const printDiv = document.getElementById('print-section');
         if (printDiv) {
           printDiv.innerHTML = `<pre style="font-family:monospace;white-space:pre-wrap;font-size:14px;color:black;">${text}</pre>`;
           setTimeout(() => window.print(), 50);
         } else {
           window.location.href = 'intent:' + encodeURIComponent(text) + '#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;';
         }
     }
  };

  if (loading) {
     return <div className="p-6 text-center text-white">Preparando cálculo de caja...</div>;
  }

  return (
    <div className="flex flex-col h-full w-full overflow-y-auto no-scrollbar" style={{ padding: 'var(--spacing-md)' }}>
      <header style={{ marginBottom: 'var(--spacing-md)', paddingLeft: '3rem' }}>
         <h2 className="text-active">Cierre de Caja "Z"</h2>
         <span className="text-secondary" style={{ fontSize: '0.9rem' }}>Cuadre financiero del turno</span>
      </header>

      <div className="surface rounded-xl p-6 border border-slate-700 bg-slate-900 shadow-xl mb-6">
         <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
            <span className="text-gray-400 font-bold uppercase text-xs flex items-center gap-2">
               <Calendar size={16} /> {targetDate}
            </span>
            <span className="text-teal-400 font-bold bg-teal-900/30 px-3 py-1 rounded-full text-xs">
               Turno Activo
            </span>
         </div>

         <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center bg-slate-800/50 p-4 rounded-lg">
               <span className="text-gray-300">Ventas Brutas:</span>
               <span className="text-white font-bold text-lg">${totalSales.toFixed(2)}</span>
            </div>

            <div className="flex justify-between items-center bg-slate-800/50 p-4 rounded-lg">
               <span className="text-gray-300 flex flex-col">
                 <span>Comisión Retenida:</span>
                 <span className="text-xs text-yellow-500 font-bold">{commissionPerc}% del total</span>
               </span>
               <span className="text-yellow-500 font-bold text-lg">-$${totalCommission.toFixed(2)}</span>
            </div>

            <div className="flex justify-between items-center bg-slate-800/50 p-4 rounded-lg">
               <span className="text-gray-300">Premios Pagados Físicamente:</span>
               <span className="text-red-400 font-bold text-lg">-$${totalPayouts.toFixed(2)}</span>
            </div>
         </div>

         <div className="mt-6 border-t-[3px] border-dashed border-slate-700 pt-6">
            <div className="flex flex-col items-center justify-center bg-teal-900/20 py-6 rounded-xl border border-teal-800/50">
               <span className="text-gray-400 uppercase tracking-widest text-xs font-bold mb-2">Efectivo Físico a Entregar</span>
               <span className="text-5xl font-black text-teal-400 drop-shadow-md">
                 ${Math.max(0, totalNet).toFixed(2)}
               </span>
               {totalNet < 0 && (
                 <span className="text-red-400 text-xs mt-2 font-bold bg-red-900/30 px-3 py-1 rounded-full">
                   (La banca te debe a ti: $${Math.abs(totalNet).toFixed(2)})
                 </span>
               )}
            </div>
         </div>
      </div>

      <button 
         onClick={handlePrintZ}
         className="w-full bg-blue-600 active:bg-blue-700 text-white font-bold p-4 rounded-xl flex justify-center items-center gap-3 shadow-lg"
      >
         <Printer size={22} /> Imprimir Comprobante "Z"
      </button>

      <div className="mt-4 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
         <h4 className="text-sm font-bold text-gray-300 mb-2 flex items-center gap-2">
            <Banknote size={16} className="text-green-400" /> Instrucciones:
         </h4>
         <p className="text-xs text-gray-400 leading-relaxed">
            Este reporte agrupa matemáticamente todo lo que procesaste hoy desde tu dispositivo local. Verifica que el dinero en tus bolsillos coincida con el <strong>Efectivo Físico a Entregar</strong> antes de imprimir y entregárselo al supervisor de la agencia.
         </p>
      </div>

    </div>
  );
}
