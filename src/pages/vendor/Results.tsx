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
      const vendorId = store.currentUser?.username || 'vendedor_desconocido';
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
    w.ticket_id.split('-')[0].toLowerCase().includes(searchTerm.toLowerCase()) ||
    (w.client || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(w.ticket_number || '').includes(searchTerm)
  );

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
      <p className="text-secondary mb-4">Tickets ganadores listos para cobrar.</p>

      {/* Barra de Búsqueda Rápida */}
      <div className="surface p-3 mb-4 rounded-xl border border-teal-900 bg-slate-900 border-opacity-50 flex items-center shadow-lg">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar por ID, # ticket o cliente..."
          className="w-full bg-transparent outline-none text-teal-300 font-bold tracking-widest placeholder-slate-600 text-lg uppercase"
        />
      </div>

      <div className="flex-col gap-sm" style={{ marginTop: 'var(--spacing-md)' }}>
        {isFetching && pendingWinners.length === 0 ? (
          <p className="text-secondary text-center mt-4">Cargando premios...</p>
        ) : filteredWinners.map(w => (
          <div key={w.key_id} className="surface flex-col gap-sm bg-slate-900 border border-slate-800 p-4 rounded-xl relative shadow-md">
            <div className="flex justify-between items-center" style={{ borderBottom: '1px solid #1e293b', paddingBottom: '0.5rem' }}>
              <span className="text-bold text-teal-400 font-mono text-lg">{w.number}</span>
              <div className="flex flex-col items-end">
                {w.alreadyPaid > 0 && (
                  <span className="text-gray-500 font-mono text-xs line-through">${w.grossPrize.toFixed(2)}</span>
                )}
                <span className="text-emerald-400 font-mono text-lg font-black">
                  ${w.remainingPrize.toFixed(2)}
                </span>
                {w.alreadyPaid > 0 && (
                  <span className="text-orange-400 font-mono text-xs">(-${w.alreadyPaid.toFixed(2)} ya cobrado)</span>
                )}
              </div>
            </div>

            <div className="flex justify-between items-center text-gray-400 text-xs mt-1" style={{ fontSize: '0.9rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.75rem' }}>
                  Ticket: <span className="text-white font-mono font-bold">#{w.ticket_number || w.ticket_id.split('-')[0].toUpperCase()}</span>
                </span>
                <span style={{ fontSize: '0.8rem', color: '#0ea5e9', fontWeight: 'bold', marginTop: '0.2rem' }}>{w.description}</span>
                <span style={{ fontSize: '0.75rem', marginTop: '0.2rem' }}>Cliente: <span className="text-white font-bold">{w.client || 'General'}</span></span>
              </div>
              <span className="text-yellow-500 font-bold text-xs bg-yellow-950/30 px-2 py-0.5 rounded">Pendiente</span>
            </div>

            {/* Acciones de Payout */}
            <div className="flex gap-2 mt-4 pt-2 border-t border-slate-800/50">
              <button
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-gray-300 py-2 rounded-lg text-xs font-bold transition-all"
                onClick={() => setViewingTicketId(w.ticket_id)}
              >
                Detalles
              </button>
              <button
                className="flex-1 bg-emerald-900/50 text-emerald-300 hover:bg-emerald-800 border border-emerald-700/50 py-2 rounded-lg text-xs font-bold transition-all"
                onClick={() => handlePay(w)}
                disabled={payingId === w.ticket_id}
              >
                {payingId === w.ticket_id ? 'Procesando...' : `💰 PAGAR $${w.remainingPrize.toFixed(2)}`}
              </button>
            </div>
          </div>
        ))}
        {!isFetching && pendingWinners.length === 0 && (
          <p className="text-secondary text-center" style={{ marginTop: '2rem' }}>No hay premios pendientes de pago.</p>
        )}
      </div>

      {viewingTicketId && <TicketDetailsModal ticketId={viewingTicketId} onClose={() => setViewingTicketId(null)} />}
    </div>
  );
}
