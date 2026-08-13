import { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase';
import { useStore } from '../../store/useStore';
import { formatLotteryTime } from '../../utils/lotteryRules';
import { Printer, RefreshCw } from 'lucide-react';
import { getLocalISODate } from '../../utils/dateUtils';
import { Capacitor } from '@capacitor/core';
import { BluetoothSerial } from '@e-is/capacitor-bluetooth-serial';

export default function PastDraws() {
  const store = useStore();
  const [filterDate, setFilterDate] = useState(() => getLocalISODate());
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchResults = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('results')
        .select('*')
        .eq('date', filterDate);
      
      if (!error && data) {
        setResults(data);
      } else {
        console.error("Error fetching results from Supabase:", error);
      }
    } catch (err) {
      console.error("Network error on results fetch:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResults();
  }, [filterDate]);

  // Obtener días del schedule
  const currentDays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const [year, month, day] = filterDate.split('-').map(Number);
  const targetDateObj = new Date(year, month - 1, day);
  const targetDayName = currentDays[targetDateObj.getDay()];

  // Filtrar cuáles sorteos juegan este día de la semana
  const scheduledDraws = store.lotteriesMaster.filter(l => {
     if (l.days && !l.days.includes(targetDayName as any)) return false;
     return true;
  });

  const getDrawResult = (drawId: string) => {
    const res = results.find(r => r.draw_id === drawId);
    if (!res) return null;
    const parts = res.winning_number.split('-');
    return {
      first: parts[0] || '--',
      second: parts[1] || '--',
      third: parts[2] || '--',
      raw: res.winning_number
    };
  };

  const handlePrintResults = async () => {
    const formattedDate = targetDateObj.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    let text = `${store.ticketHeader}\n--------------------------------\nRESULTADOS DEL DÍA: ${formattedDate}\n--------------------------------\n\n`;

    scheduledDraws.forEach(draw => {
       const res = getDrawResult(draw.id);
       const timeStr = formatLotteryTime(draw.hour, draw.minute);
       text += `${draw.name.toUpperCase()} (${timeStr})\n`;
       if (res) {
          text += `1er: ${res.first.padStart(2, '0')}  |  2do: ${res.second.padStart(2, '0')}  |  3er: ${res.third.padStart(2, '0')}\n`;
       } else {
          text += `-- Sin Resultados --\n`;
       }
       text += `--------------------------------\n`;
    });

    text += `\n${store.ticketFooter}\n\n\n\n\n\n`;

    // Envío a impresora
    if (Capacitor.isNativePlatform()) {
       try {
           const targetMac = localStorage.getItem('bt_printer_mac');
           if (!targetMac) {
               alert("¡Impresora no configurada! En el MENÚ LATERAL entra a 'Vincular Impresora' primero.");
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
       // RawBT Intent para Android Web
       window.location.href = 'intent:' + encodeURIComponent(text) + '#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;';
    }
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden" style={{ padding: 'var(--spacing-md)' }}>
      <header className="flex justify-between items-center mb-4 pl-12 md:pl-0">
         <div>
            <h2 className="text-teal-400 font-bold text-xl">Consulta de Sorteos</h2>
            <span className="text-gray-400 text-xs">Números ganadores por día</span>
         </div>
         <button onClick={fetchResults} className="bg-slate-800 border border-slate-700 text-teal-400 p-2 rounded-lg text-xs font-bold hover:bg-slate-700 transition-colors flex items-center gap-1">
            <RefreshCw size={14} /> Refrescar
         </button>
      </header>

      {/* Controles de Filtros */}
      <div className="flex flex-col md:flex-row gap-2 bg-slate-900 p-3 rounded-xl border border-slate-800 mb-4 items-center">
         <div className="flex-1 w-full">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Fecha a Consultar</label>
            <div className="relative">
              <input 
                type="date" 
                value={filterDate}
                onChange={e => setFilterDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-teal-300 font-bold p-2.5 rounded-lg outline-none focus:border-teal-500 font-mono"
              />
            </div>
         </div>
         <button 
           onClick={handlePrintResults}
           disabled={scheduledDraws.length === 0}
           className="w-full md:w-auto bg-teal-600 active:bg-teal-700 text-white font-bold px-4 py-2.5 rounded-lg text-sm mt-5 md:mt-0 flex justify-center items-center gap-2 hover:bg-teal-500 transition-colors shadow-lg disabled:opacity-50"
         >
           <Printer size={18} /> IMPRIMIR HOJA RESULTADOS
         </button>
      </div>

      {/* Grid de Sorteos del Día */}
      <div className="flex-1 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-3 pr-1 no-scrollbar pb-16">
         {loading ? (
            <div className="col-span-full text-center py-12 text-gray-500 font-bold animate-pulse">Cargando resultados...</div>
         ) : scheduledDraws.length === 0 ? (
            <div className="col-span-full text-center py-12 text-gray-500 italic">No hay sorteos programados para los días {targetDayName}.</div>
         ) : (
           scheduledDraws.map(draw => {
              const res = getDrawResult(draw.id);
              return (
                 <div key={draw.id} className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col justify-between shadow-md">
                    <div className="flex justify-between items-start border-b border-slate-800 pb-2 mb-3">
                       <div>
                          <h4 className="font-bold text-white text-base">{draw.name}</h4>
                          <span className="text-xs text-gray-400">Hora: {formatLotteryTime(draw.hour, draw.minute)}</span>
                       </div>
                       <span className={res ? "text-teal-400 bg-teal-950/40 text-[10px] px-2 py-0.5 rounded-full font-bold font-mono" : "text-yellow-500 bg-yellow-950/30 text-[10px] px-2 py-0.5 rounded-full font-bold font-mono"}>
                          {res ? "PUBLICADO" : "PENDIENTE"}
                       </span>
                    </div>

                    {res ? (
                       <div className="flex justify-center items-center gap-3 py-2 bg-slate-950/60 rounded-lg border border-slate-800/40 shadow-inner">
                          <div className="flex flex-col items-center">
                             <span className="text-2xl font-black text-teal-400 font-mono tracking-tighter">{res.first}</span>
                             <span className="text-[9px] text-gray-500 font-bold">1er</span>
                          </div>
                          <div className="text-gray-700 font-bold">|</div>
                          <div className="flex flex-col items-center">
                             <span className="text-2xl font-black text-gray-300 font-mono tracking-tighter">{res.second}</span>
                             <span className="text-[9px] text-gray-500 font-bold">2do</span>
                          </div>
                          <div className="text-gray-700 font-bold">|</div>
                          <div className="flex flex-col items-center">
                             <span className="text-2xl font-black text-gray-400 font-mono tracking-tighter">{res.third}</span>
                             <span className="text-[9px] text-gray-500 font-bold">3er</span>
                          </div>
                       </div>
                    ) : (
                       <div className="text-center py-4 text-gray-600 font-mono text-sm bg-slate-950/30 border border-dashed border-slate-800 rounded-lg">
                          -- Esperando números ganadores --
                       </div>
                    )}
                 </div>
              );
           })
         )}
      </div>
    </div>
  );
}
