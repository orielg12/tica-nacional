import { getLocalISODate, getStartOfDayUTC, getEndOfDayUTC } from '../../utils/dateUtils';
import { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase';
import { useStore } from '../../store/useStore';
import {  Search } from 'lucide-react';

export default function Sales() {
  const store = useStore();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Rango de fechas por defecto: Hoy
  const [startDate, setStartDate] = useState(getLocalISODate());
  const [endDate, setEndDate] = useState(getLocalISODate());

  const fetchSales = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .eq('vendor_id', store.currentUser?.username || 'vendedor_desconocido')
        .gte('created_at', getStartOfDayUTC(startDate))
        .lte('created_at', getEndOfDayUTC(endDate))
        .order('created_at', { ascending: false });
      
      if (!error && data) {
        setTickets(data);
      } else {
        console.error("Supabase Error:", error);
      }
    } catch (err) {
      console.error("Network error on fetchSales:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSales();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalSales = tickets.filter(t => t.status !== 'cancelled').reduce((acc, t) => acc + (parseFloat(t.total_amount) || 0), 0);
  const commissionPerc = store.currentUser?.commission || 0;
  const commissionCalculated = totalSales * (commissionPerc / 100);
  const totalNet = totalSales - commissionCalculated;

  return (
    <div className="flex flex-col h-full w-full overflow-hidden" style={{ padding: 'var(--spacing-md)' }}>
      <header style={{ marginBottom: 'var(--spacing-md)', paddingLeft: '3rem' }}>
         <h2 className="text-active">Reporte de Ventas</h2>
         <span className="text-secondary" style={{ fontSize: '0.9rem' }}>Consulta tu histórico de tickets</span>
      </header>

      {/* Controladores de Fechas */}
      <div className="surface flex-col gap-sm p-4 rounded-xl shadow-md border border-slate-800 bg-slate-900 mb-4">
         <div className="flex justify-between items-center gap-2">
            <div className="flex-col w-full">
               <label className="text-gray-400 text-xs uppercase font-bold mb-1">Desde</label>
               <input 
                 type="date" 
                 value={startDate} 
                 onChange={e => setStartDate(e.target.value)}
                 className="w-full bg-slate-800 text-white rounded-lg p-2 border border-slate-700 outline-none"
               />
            </div>
            <div className="flex-col w-full">
               <label className="text-gray-400 text-xs uppercase font-bold mb-1">Hasta</label>
               <input 
                 type="date" 
                 value={endDate} 
                 onChange={e => setEndDate(e.target.value)}
                 className="w-full bg-slate-800 text-white rounded-lg p-2 border border-slate-700 outline-none"
               />
            </div>
         </div>
         <button 
           onClick={fetchSales}
           className="w-full bg-teal-600 active:bg-teal-500 text-white font-bold p-3 rounded-lg flex justify-center items-center gap-2 mt-2"
         >
           <Search size={18} /> Consultar
         </button>
      </div>

      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center' }} className="text-white">Calculando...</div>
      ) : (
        <>
          {/* TABLA DE RESULTADOS */}
          <div className="surface flex-col gap-1 text-white p-3 rounded-lg border border-slate-700 bg-slate-900 shadow-md">
            <h3 className="text-teal-400 font-bold mb-1 text-xs uppercase tracking-wide border-b border-slate-700 pb-1">Resultados Consolidado</h3>
            
            <div className="flex justify-between items-center text-sm">
               <span className="text-gray-300">Total Vendido:</span>
               <span className="font-bold text-white">${totalSales.toFixed(2)}</span>
            </div>

            <div className="flex justify-between items-center text-sm">
               <span className="text-gray-300">Comisión ({commissionPerc}%):</span>
               <span className="font-bold text-yellow-500">${commissionCalculated.toFixed(2)}</span>
            </div>

            <div className="flex justify-between items-center text-base mt-1 pt-1 border-t border-slate-700">
               <span className="text-gray-300 font-bold">Total a Entregar:</span>
               <span className="font-bold text-teal-400">${totalNet.toFixed(2)}</span>
            </div>
          </div>
          
          <div className="flex-1 flex flex-col mt-4 min-h-0">
              <h4 className="text-white opacity-50 mb-2 flex-none">Histórico de Movimientos</h4>
              <div className="flex-1 overflow-y-auto flex flex-col gap-sm pb-24 no-scrollbar">
                {tickets.map(t => (
                  <div key={t.id} className="surface flex-col gap-sm" style={{ padding: 'var(--spacing-md)', opacity: t.status === 'cancelled' ? 0.6 : 1, backgroundColor: '#1e293b', borderRadius: '8px' }}>
                     <div className="flex justify-between items-center" style={{ borderBottom: '1px solid #334155', paddingBottom: '0.5rem' }}>
                        <span className="text-bold text-white" style={{ fontSize: '0.9rem' }}>{t.id.split('-')[0] || t.id}</span>
                        <span className={t.status === 'cancelled' ? 'text-red-400 font-bold' : 'text-teal-400 font-bold'}>
                          ${parseFloat(t.total_amount).toFixed(2)}
                        </span>
                     </div>
                     <div className="flex justify-between items-center text-gray-400" style={{ fontSize: '0.8rem' }}>
                        <span>{(t.created_at).replace('T', ' ').slice(0, 16)}</span>
                        <span>{t.status === 'cancelled' ? 'Anulado' : 'Válido'}</span>
                     </div>
                  </div>
                ))}
                {tickets.length === 0 && <p className="text-secondary text-center mt-4">No hay ventas registradas en las fechas indicadas.</p>}
              </div>
          </div>
        </>
      )}

    </div>
  );
}
