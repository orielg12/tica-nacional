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
  const [pendingWinners, setPendingWinners] = useState<PendingWinner[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewingTicketId, setViewingTicketId] = useState<string | null>(null);

  const loadWinners = async () => {
    setIsFetching(true);
    try {
      await store.fetchLotteries();
      const currentUser = store.currentUser;
      const isVendor = currentUser?.role === 'vendor' || currentUser?.role === 'Vendedor';
      const vendorId = isVendor ? currentUser?.username : undefined;
      const winners = await fetchPendingWinners(vendorId);
      setPendingWinners(winners);
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

      setPendingWinners(prev => prev.filter(item => item.ticket_id !== w.ticket_id));
      alert("¡Premio pagado exitosamente!");
    } catch (err: any) {
      alert("Error al pagar premio: " + err.message);
    } finally {
      setPayingId(null);
    }
  };

  const filteredWinners = pendingWinners.filter(w =>
    w.remainingPrize > 0 &&
    (w.ticket_id.split('-')[0].toLowerCase().includes(searchTerm.toLowerCase()) ||
    (w.client || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(w.ticket_number || '').includes(searchTerm))
  );

  return (
    <div className="flex flex-col h-[100dvh] w-full overflow-hidden bg-slate-950">
      {/* Top Header & Search (Fixed) */}
      <div className="flex-none p-4 pb-2">
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
        <p className="text-gray-400 text-xs mb-3">Tickets ganadores pendientes de cobro.</p>

        {/* Barra de Búsqueda Rápida */}
        <div className="p-2.5 rounded-xl border border-teal-900 bg-slate-900 border-opacity-50 flex items-center shadow-lg">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por ID, # ticket o cliente..."
            className="w-full bg-transparent outline-none text-teal-300 font-bold tracking-wider placeholder-slate-600 text-base uppercase"
          />
        </div>
      </div>

      {/* Lista de Premios con Scroll Suave */}
      <div className="flex-1 overflow-y-auto px-4 pt-1 pb-32 space-y-3 touch-pan-y no-scrollbar">
        {isFetching && pendingWinners.length === 0 ? (
          <p className="text-gray-400 text-center mt-8">Cargando premios...</p>
        ) : filteredWinners.map(w => (
          <div key={w.key_id} className="flex flex-col gap-2 bg-slate-900 border border-amber-500/30 ring-1 ring-amber-500/20 p-4 rounded-xl relative shadow-md">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <span className="text-bold text-teal-400 font-mono text-lg">{w.number}</span>
              <div className="flex flex-col items-end">
                {w.alreadyPaid > 0 && (
                  <span className="text-gray-500 font-mono text-xs line-through">${w.grossPrize.toFixed(2)}</span>
                )}
                <span className="text-amber-400 font-mono text-xl font-black">
                  ${w.remainingPrize.toFixed(2)}
                </span>
                {w.alreadyPaid > 0 && (
                  <span className="text-orange-400 font-mono text-xs">(-${w.alreadyPaid.toFixed(2)} ya cobrado)</span>
                )}
              </div>
            </div>

            <div className="flex justify-between items-center text-gray-400 text-xs mt-1">
              <div className="flex flex-col">
                <span className="text-xs">
                  Ticket: <span className="text-white font-mono font-bold">#{w.ticket_number || w.ticket_id.split('-')[0].toUpperCase()}</span>
                </span>
                <span className="text-xs text-sky-400 font-bold mt-0.5">{w.description}</span>
                <span className="text-xs mt-0.5">Cliente: <span className="text-white font-bold">{w.client || 'General'}</span></span>
              </div>
              <span className="text-amber-400 font-bold text-xs bg-amber-950/60 border border-amber-500/40 px-2.5 py-1 rounded-lg">Pendiente</span>
            </div>

            {/* Acciones de Payout */}
            <div className="flex gap-2.5 mt-3.5 pt-2.5 border-t border-slate-800/80">
              <button
                className="flex-1 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-white font-bold py-3 rounded-xl text-sm border border-slate-600 shadow-sm transition-all active:scale-95"
                onClick={() => setViewingTicketId(w.ticket_id)}
              >
                Detalles
              </button>
              <button
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-black py-3 rounded-xl text-sm transition-all shadow-lg border border-emerald-400/50 active:scale-95 flex items-center justify-center gap-1.5"
                onClick={() => handlePay(w)}
                disabled={payingId === w.ticket_id}
              >
                {payingId === w.ticket_id ? (
                  <span className="text-white font-bold">Procesando...</span>
                ) : (
                  <span className="text-white font-black tracking-wide text-sm">💰 PAGAR ${w.remainingPrize.toFixed(2)}</span>
                )}
              </button>
            </div>
          </div>
        ))}
        {!isFetching && filteredWinners.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-400 font-bold text-base">No hay premios pendientes de pago.</p>
          </div>
        )}
      </div>

      {viewingTicketId && <TicketDetailsModal ticketId={viewingTicketId} onClose={() => setViewingTicketId(null)} />}
    </div>
  );
}
