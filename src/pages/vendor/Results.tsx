import { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase';
import { useStore } from '../../store/useStore';
import TicketDetailsModal from '../../components/TicketDetailsModal';
import { fetchPendingWinners, type PendingWinner } from '../../services/prizeService';
import { RefreshCw } from 'lucide-react';

export default function Results() {
  const store = useStore();
  const [isFetching, setIsFetching] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [allWinners, setAllWinners] = useState<PendingWinner[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusTab, setStatusTab] = useState<'pending' | 'paid' | 'all'>('pending');
  const [selectedVendorFilter, setSelectedVendorFilter] = useState<string>('all');
  const [viewingTicketId, setViewingTicketId] = useState<string | null>(null);

  const isAdmin = store.currentUser?.role === 'admin' && !store.currentUser?.isSubAdmin;
  const isSubAdmin = store.currentUser?.isSubAdmin;

  const loadWinners = async () => {
    setIsFetching(true);
    try {
      await Promise.all([
        store.fetchLotteries(),
        store.fetchUsers()
      ]);
      const vendorId = store.currentUser?.username || 'vendedor_desconocido';
      const winners = await fetchPendingWinners(vendorId, true);
      setAllWinners(winners);
    } catch (e: any) {
      console.error("Error cargando premios:", e);
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    loadWinners();
  }, []);

  const handlePay = async (w: PendingWinner) => {
    const shortId = w.ticket_id.split('-')[0].toUpperCase();
    const remaining = w.remainingPrize;
    if (!window.confirm(`⚠️ ¿Confirmas el PAGO del ticket #${w.ticket_number || shortId}?\n\nSaldo a Entregar: $${remaining.toFixed(2)}\n\nEsta acción registrará el premio como cobrado en el sistema.`)) {
      return;
    }

    try {
      setPayingId(w.ticket_id);
      const vendorId = store.currentUser?.id || '00000000-0000-0000-0000-000000000000';

      const { error: payoutError } = await supabase.from('payouts').insert({
        ticket_id: w.ticket_id,
        amount: remaining,
        paid_by: vendorId.toString()
      });

      if (!payoutError) {
        // Mark ticket as paid since we're paying the full remaining balance
        await supabase.from('tickets').update({ status: 'paid' }).eq('id', w.ticket_id);

        // Register external reimbursement if applicable
        if (w.reimbursement > 0) {
          await supabase.from('payouts').insert({
            ticket_id: w.ticket_id,
            amount: -w.reimbursement,
            paid_by: 'EXTERNAL_BANK_REIMBURSEMENT'
          });
        }
      } else {
        console.error("Error inserting payout:", payoutError);
        alert("Error conectando con la Nube de Pagos.");
        return;
      }

      await loadWinners();
      alert("¡Premio pagado exitosamente!");
    } catch (err: any) {
      alert("Error al pagar premio: " + err.message);
    } finally {
      setPayingId(null);
    }
  };

  // Distinct vendors for filter
  const vendorList = [...new Set(allWinners.map(w => w.vendor_id).filter(Boolean))] as string[];

  // Counts and totals
  const pendingCount = allWinners.filter(w => w.remainingPrize > 0).length;
  const paidCount = allWinners.filter(w => w.remainingPrize === 0).length;
  const pendingSum = allWinners.filter(w => w.remainingPrize > 0).reduce((sum, w) => sum + w.remainingPrize, 0);

  const filteredWinners = allWinners.filter(w => {
    // Status tab filter
    if (statusTab === 'pending' && w.remainingPrize <= 0) return false;
    if (statusTab === 'paid' && w.remainingPrize > 0) return false;

    // Vendor filter (Admin / Subadmin)
    if (selectedVendorFilter !== 'all' && w.vendor_id !== selectedVendorFilter) return false;

    // Search term
    const matchesSearch =
      w.ticket_id.split('-')[0].toLowerCase().includes(searchTerm.toLowerCase()) ||
      (w.client || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (w.vendor_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(w.ticket_number || '').includes(searchTerm);

    return matchesSearch;
  });

  return (
    <div className="container" style={{ padding: 'var(--spacing-md)' }}>
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-xl font-bold text-teal-400">Resultados y Premios</h2>
        <button
          onClick={loadWinners}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-teal-300 border border-slate-700 active:bg-slate-700 font-bold text-sm transition-colors"
          title="Refrescar Lista de Premios"
        >
          <RefreshCw size={18} className={isFetching ? 'animate-spin text-teal-400' : ''} />
          <span>Refrescar</span>
        </button>
      </div>

      {/* Pestañas de Estado */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <button
          type="button"
          onClick={() => setStatusTab('pending')}
          className={`py-2 px-1 rounded-xl font-bold text-xs flex flex-col items-center justify-center transition-all ${
            statusTab === 'pending'
              ? 'bg-amber-500 text-slate-950 shadow-lg ring-2 ring-amber-400'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          <span className="uppercase tracking-wider">Pendientes</span>
          <span className="text-[10px] font-mono">({pendingCount}) • ${pendingSum.toFixed(2)}</span>
        </button>

        <button
          type="button"
          onClick={() => setStatusTab('paid')}
          className={`py-2 px-1 rounded-xl font-bold text-xs flex flex-col items-center justify-center transition-all ${
            statusTab === 'paid'
              ? 'bg-emerald-600 text-white shadow-lg ring-2 ring-emerald-400'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          <span className="uppercase tracking-wider">Cobrados</span>
          <span className="text-[10px] font-mono">({paidCount})</span>
        </button>

        <button
          type="button"
          onClick={() => setStatusTab('all')}
          className={`py-2 px-1 rounded-xl font-bold text-xs flex flex-col items-center justify-center transition-all ${
            statusTab === 'all'
              ? 'bg-sky-600 text-white shadow-lg ring-2 ring-sky-400'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          <span className="uppercase tracking-wider">Todos</span>
          <span className="text-[10px] font-mono">({allWinners.length})</span>
        </button>
      </div>

      {/* Filtro por Cajero para Admin / Sub-Admin */}
      {(isAdmin || isSubAdmin) && vendorList.length > 1 && (
        <div className="mb-3 flex items-center gap-2 bg-slate-900 border border-slate-800 p-2 rounded-xl">
          <span className="text-xs text-gray-400 font-bold uppercase">Cajero:</span>
          <select
            value={selectedVendorFilter}
            onChange={(e) => setSelectedVendorFilter(e.target.value)}
            className="flex-1 bg-slate-800 border border-slate-700 text-white text-xs rounded-lg p-1.5 outline-none font-bold"
          >
            <option value="all">Todos los cajeros ({allWinners.length})</option>
            {vendorList.map(v => (
              <option key={v} value={v}>
                {v} ({allWinners.filter(w => w.vendor_id === v).length})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Barra de Búsqueda Rápida */}
      <div className="surface p-3 mb-4 rounded-xl border border-teal-900 bg-slate-900 border-opacity-50 flex items-center shadow-lg">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar por ID, # ticket, cliente o cajero..."
          className="w-full bg-transparent outline-none text-teal-300 font-bold tracking-widest placeholder-slate-600 text-base uppercase"
        />
      </div>

      {/* Lista de Ganadores */}
      <div className="flex flex-col gap-3" style={{ marginTop: 'var(--spacing-md)' }}>
        {isFetching && allWinners.length === 0 ? (
          <p className="text-secondary text-center mt-4">Cargando premios...</p>
        ) : filteredWinners.map(w => {
          const isPending = w.remainingPrize > 0;
          return (
            <div key={w.key_id} className={`surface flex flex-col gap-2 bg-slate-900 border p-4 rounded-xl relative shadow-md ${
              isPending ? 'border-amber-500/40 ring-1 ring-amber-500/20' : 'border-slate-800 opacity-80'
            }`}>
              <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                <span className="text-bold text-teal-400 font-mono text-lg">{w.number}</span>
                <div className="flex flex-col items-end">
                  {w.alreadyPaid > 0 && !isPending && (
                    <span className="text-emerald-400 font-mono text-lg font-black">
                      ${w.alreadyPaid.toFixed(2)}
                    </span>
                  )}
                  {w.alreadyPaid > 0 && isPending && (
                    <span className="text-gray-500 font-mono text-xs line-through">${w.grossPrize.toFixed(2)}</span>
                  )}
                  {isPending && (
                    <span className="text-emerald-400 font-mono text-xl font-black text-amber-400">
                      ${w.remainingPrize.toFixed(2)}
                    </span>
                  )}
                  {w.alreadyPaid > 0 && isPending && (
                    <span className="text-orange-400 font-mono text-xs">(-${w.alreadyPaid.toFixed(2)} cobrado)</span>
                  )}
                </div>
              </div>

              <div className="flex justify-between items-start text-gray-400 text-xs mt-1">
                <div className="flex flex-col gap-0.5">
                  <span>
                    Ticket: <span className="text-white font-mono font-bold">#{w.ticket_number || w.ticket_id.split('-')[0].toUpperCase()}</span>
                    {w.ticket_date && <span className="text-gray-500 ml-1.5 font-mono">({w.ticket_date})</span>}
                  </span>
                  <span className="text-sky-400 font-bold mt-0.5">{w.description}</span>
                  <span>Cliente: <span className="text-white font-bold">{w.client || 'General'}</span></span>
                  {(isAdmin || isSubAdmin) && w.vendor_id && (
                    <span className="text-teal-300 font-bold text-[11px]">Cajero: {w.vendor_id}</span>
                  )}
                </div>
                <span className={`font-bold text-xs px-2 py-0.5 rounded ${
                  isPending ? 'text-amber-400 bg-amber-950/50 border border-amber-500/30' : 'text-emerald-400 bg-emerald-950/50 border border-emerald-500/30'
                }`}>
                  {isPending ? 'Pendiente' : '✓ Cobrado'}
                </span>
              </div>

              {/* Acciones */}
              <div className="flex gap-2 mt-2 pt-2 border-t border-slate-800/50">
                <button
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-gray-300 py-2 rounded-lg text-xs font-bold transition-all"
                  onClick={() => setViewingTicketId(w.ticket_id)}
                >
                  Detalles
                </button>
                {isPending && (
                  <button
                    className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-2 rounded-lg text-xs transition-all shadow-md active:scale-95"
                    onClick={() => handlePay(w)}
                    disabled={payingId === w.ticket_id}
                  >
                    {payingId === w.ticket_id ? 'Procesando...' : `💰 PAGAR $${w.remainingPrize.toFixed(2)}`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {!isFetching && filteredWinners.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            <p className="font-bold text-base">No hay premios en esta sección.</p>
            <p className="text-xs text-gray-500 mt-1">Prueba cambiando de pestaña o buscando por número de ticket.</p>
          </div>
        )}
      </div>

      {viewingTicketId && <TicketDetailsModal ticketId={viewingTicketId} onClose={() => setViewingTicketId(null)} />}
    </div>
  );
}
