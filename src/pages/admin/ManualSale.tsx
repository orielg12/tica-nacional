import { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase';
import { useStore } from '../../store/useStore';
import { formatLotteryTime } from '../../utils/lotteryRules';
import { getLocalISODate } from '../../utils/dateUtils';
import { getDecadeNumbers } from '../../utils/math';
import { Trash2, Save, AlertCircle, Edit } from 'lucide-react';

interface ManualPlay {
  number: string;
  amount: number;
}

export default function ManualSale() {
  const store = useStore();
  const [selectedLotteryId, setSelectedLotteryId] = useState('');
  const [plays, setPlays] = useState<ManualPlay[]>([]);
  const [currentNumber, setCurrentNumber] = useState('');
  const [currentAmount, setCurrentAmount] = useState('');
  const [saleMode, setSaleMode] = useState<number>(store.saleMode || 0.20);
  const [clientName, setClientName] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [saleDate, setSaleDate] = useState(getLocalISODate());
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [savedTicketId, setSavedTicketId] = useState<string | null>(null);
  const [, setIsAdmin] = useState(false);

  useEffect(() => {
    const fetchRole = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();
      if (!error && data) {
        setIsAdmin(data.role === 'Admin');
      }
    };
    fetchRole();
  }, []);

  const allLotteries = store.lotteriesMaster.filter(l => l.isActive);

  const addPlay = () => {
    const num = currentNumber.padStart(2, '0');
    const amt = parseFloat(currentAmount);
    if (!num || num.length < 2 || isNaN(amt) || amt <= 0) {
      alert('Ingresa un número válido (2 dígitos) y una cantidad de viles mayor a 0.');
      return;
    }
    setPlays(prev => [...prev, { number: num, amount: amt }]);
    setCurrentNumber('');
    setCurrentAmount('');
  };

  const addDecade = (decadeIdxStr: string) => {
    const dIdx = parseInt(decadeIdxStr, 10);
    const amt = parseFloat(currentAmount);
    if (isNaN(dIdx) || dIdx < 0 || dIdx > 9) return;
    if (isNaN(amt) || amt <= 0) {
      alert('Ingresa una cantidad de viles mayor a 0 en la casilla de Viles primero.');
      return;
    }
    const decadeNums = getDecadeNumbers(dIdx);
    const newPlays = decadeNums.map(num => ({ number: num, amount: amt }));
    setPlays(prev => [...prev, ...newPlays]);
    setCurrentAmount('');
  };

  const [editIdx, setEditIdx] = useState<number | null>(null);

  const startEdit = (idx: number) => {
    const play = plays[idx];
    setCurrentNumber(play.number);
    setCurrentAmount(play.amount.toString());
    setEditIdx(idx);
    setPlays(prev => prev.filter((_, i) => i !== idx));
  };

  const confirmEdit = () => {
    if (editIdx === null) return;
    const num = currentNumber.padStart(2, '0');
    const amt = parseFloat(currentAmount);
    if (!num || num.length < 2 || isNaN(amt) || amt <= 0) {
      alert('Ingresa un número válido (2 dígitos) y una cantidad de viles mayor a 0.');
      return;
    }
    setPlays(prev => {
      const newPlays = [...prev];
      newPlays.splice(editIdx, 0, { number: num, amount: amt });
      return newPlays;
    });
    setCurrentNumber('');
    setCurrentAmount('');
    setEditIdx(null);
  };

  const cancelEdit = () => {
    setCurrentNumber('');
    setCurrentAmount('');
    setEditIdx(null);
  };

  const removePlay = (idx: number) => {
    setPlays(plays.filter((_, i) => i !== idx));
  };



  const totalViles = plays.reduce((sum, p) => sum + p.amount, 0);
  const totalUSD = totalViles * saleMode;

  const handleDeleteTicket = async () => {
    if (!savedTicketId) return;
    if (!window.confirm('¿Estás seguro de eliminar este ticket? Esta acción es irreversible.')) return;
    try {
      const { error: tnError } = await supabase
        .from('ticket_numbers')
        .delete()
        .eq('ticket_id', savedTicketId);
      if (tnError) throw tnError;
      const { error: ticketError } = await supabase
        .from('tickets')
        .delete()
        .eq('id', savedTicketId);
      if (ticketError) throw ticketError;
      setResult({ success: true, message: '✅ Ticket eliminado correctamente.' });
      setSavedTicketId(null);
    } catch (err: any) {
      console.error('Error eliminando ticket:', err);
      setResult({ success: false, message: `❌ Error al eliminar ticket: ${err.message || err}` });
    }
  };

  const handleSave = async () => {
    if (!selectedLotteryId) {
      alert('Selecciona un sorteo.');
      return;
    }
    if (plays.length === 0) {
      alert('Agrega al menos una jugada.');
      return;
    }
    if (!vendorId) {
      alert('Selecciona el vendedor que realizó la venta.');
      return;
    }

    setSaving(true);
    setResult(null);

    try {
      const now = new Date();
      const [year, month, day] = saleDate.split('-').map(Number);
      const createdAt = new Date(year, month - 1, day, now.getHours(), now.getMinutes(), now.getSeconds()).toISOString();

      const { data: ticket, error: ticketError } = await supabase
        .from('tickets')
        .insert({
          vendor_id: vendorId,
          client_name: clientName || 'Venta Manual',
          total_amount: totalUSD,
          status: 'active',
          created_at: createdAt
        })
        .select('id')
        .single();

      if (ticketError) throw ticketError;

      const tnPayload = plays.map(p => ({
        ticket_id: ticket.id,
        draw_id: selectedLotteryId,
        number_played: p.number,
        amount: p.amount,
        created_at: createdAt
      }));

      const { error: tnError } = await supabase
        .from('ticket_numbers')
        .insert(tnPayload);

      if (tnError) throw tnError;

      setResult({ success: true, message: `✅ Venta registrada exitosamente. Ticket ID: ${ticket.id.split('-')[0].toUpperCase()} (${plays.length} jugadas - $${totalUSD.toFixed(2)})` });
      setSavedTicketId(ticket.id);
      
      setPlays([]);
      setClientName('');
      setCurrentNumber('');
      setCurrentAmount('');

    } catch (err: any) {
      console.error('Error registrando venta manual:', err);
      setResult({ success: false, message: `❌ Error: ${err.message || JSON.stringify(err)}` });
    } finally {
      setSaving(false);
    }
  };

  const handleHideTicket = async () => {
    if (!savedTicketId) return;
    try {
      const { error } = await supabase
        .from('tickets')
        .update({ is_bank_prize: true })
        .eq('id', savedTicketId);
      if (error) throw error;
      setResult({ success: true, message: '✅ Ticket ocultado de la vista.' });
      setSavedTicketId(null);
    } catch (err: any) {
      console.error('Error ocultando ticket:', err);
      setResult({ success: false, message: `❌ Error al ocultar ticket: ${err.message || err}` });
    }
  };

  const vendors = store.users.filter(u => u.role === 'Vendedor' || u.role === 'Admin');

  return (
    <div style={{ padding: '2rem', backgroundColor: '#f4f7f6', minHeight: '100%', color: '#333' }}>
      <style>{`
        @media (max-width: 768px) {
          .ms-root { padding: 0.75rem !important; }
          .ms-form-row { flex-direction: column !important; }
          .ms-form-row > div { width: 100% !important; min-width: 0 !important; }
        }
      `}</style>

      <div style={{ backgroundColor: '#fff', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#17233D', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Save size={20} color="#3399ff" /> Registro de Venta Manual
        </h2>
        <p style={{ fontSize: '0.85rem', color: '#6c757d', margin: '0.5rem 0 0 0' }}>
          Registra ventas que se realizaron fuera del sistema (WhatsApp, por teléfono, o cuando el sorteo ya estaba cerrado). Aparecerán en los reportes como ventas normales.
        </p>
      </div>

      {result && (
        <div style={{
          padding: '1rem 1.5rem',
          borderRadius: '8px',
          marginBottom: '1.5rem',
          backgroundColor: result.success ? '#ecfdf5' : '#fef2f2',
          color: result.success ? '#065f46' : '#991b1b',
          border: `1px solid ${result.success ? '#a7f3d0' : '#fecaca'}`,
          fontWeight: 'bold'
        }}>
          {result.message}
        </div>
      )}

      {savedTicketId && (
        <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
          <button onClick={handleHideTicket} style={{ padding: '0.55rem 0.8rem', borderRadius: '6px', border: '1px solid #0284c7', backgroundColor: '#fff', color: '#0284c7', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <AlertCircle size={16} /> Ocultar ticket
          </button>
          <button onClick={handleDeleteTicket} style={{
            padding: '0.55rem 0.8rem',
            borderRadius: '6px',
            border: '1px solid #ef4444',
            backgroundColor: '#fff',
            color: '#ef4444',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem'
          }}>
            <Trash2 size={16} /> Eliminar ticket (error)
          </button>
        </div>
      )}

      <div style={{ backgroundColor: '#fff', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1.5rem' }}>
        <div className="ms-form-row" style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#6c757d', marginBottom: '0.5rem' }}>Sorteo</label>
            <select
              value={selectedLotteryId}
              onChange={e => setSelectedLotteryId(e.target.value)}
              style={{ padding: '0.8rem', borderRadius: '6px', border: '1px solid #ced4da', width: '100%', fontSize: '0.95rem', backgroundColor: '#fff' }}
            >
              <option value="">-- Selecciona Sorteo --</option>
              {allLotteries.map(l => (
                <option key={l.id} value={l.id}>
                  {l.name} - {formatLotteryTime(l.hour, l.minute)}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#6c757d', marginBottom: '0.5rem' }}>Vendedor</label>
            <select
              value={vendorId}
              onChange={e => setVendorId(e.target.value)}
              style={{ padding: '0.8rem', borderRadius: '6px', border: '1px solid #ced4da', width: '100%', fontSize: '0.95rem', backgroundColor: '#fff' }}
            >
              <option value="">-- Selecciona Vendedor --</option>
              {vendors.map(v => (
                <option key={v.id} value={v.username}>{v.username}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="ms-form-row" style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#6c757d', marginBottom: '0.5rem' }}>Denominación</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" onClick={() => setSaleMode(0.20)} style={{ flex: 1, padding: '0.75rem', borderRadius: '6px', border: `2px solid ${saleMode === 0.20 ? '#0d9488' : '#e2e8f0'}`, backgroundColor: saleMode === 0.20 ? '#f0fdfa' : '#fff', color: saleMode === 0.20 ? '#0d9488' : '#64748b', fontWeight: 'bold', cursor: 'pointer' }}>$0.20 / vil</button>
              <button type="button" onClick={() => setSaleMode(0.25)} style={{ flex: 1, padding: '0.75rem', borderRadius: '6px', border: `2px solid ${saleMode === 0.25 ? '#0284c7' : '#e2e8f0'}`, backgroundColor: saleMode === 0.25 ? '#f0f9ff' : '#fff', color: saleMode === 0.25 ? '#0284c7' : '#64748b', fontWeight: 'bold', cursor: 'pointer' }}>$0.25 / vil</button>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#6c757d', marginBottom: '0.5rem' }}>Cliente (opcional)</label>
            <input type="text" value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Nombre" style={{ padding: '0.8rem', borderRadius: '6px', border: '1px solid #ced4da', width: '100%', fontSize: '0.95rem' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#6c757d', marginBottom: '0.5rem' }}>Fecha</label>
            <input type="date" value={saleDate} onChange={e => setSaleDate(e.target.value)} style={{ padding: '0.8rem', borderRadius: '6px', border: '1px solid #ced4da', width: '100%', fontSize: '0.95rem', backgroundColor: '#fff' }} />
          </div>
        </div>

        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1.2rem', marginBottom: '1.2rem' }}>
          <div className="ms-form-row" style={{ display: 'flex', gap: '0.8rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ width: '120px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#64748b', marginBottom: '0.3rem' }}>Viles</label>
              <input type="number" value={currentAmount} onChange={e => setCurrentAmount(e.target.value)} placeholder="0" min={1} style={{ padding: '0.75rem', borderRadius: '6px', border: '2px solid #3b82f6', width: '100%', fontSize: '1.1rem', textAlign: 'center', fontWeight: 'bold', backgroundColor: '#f0f9ff' }} />
            </div>
            <div style={{ flex: '1 1 200px', display: 'flex', gap: '0.4rem', alignItems: 'flex-end', backgroundColor: '#f8fafc', padding: '0.6rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ width: '90px' }}>
                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 'bold', color: '#64748b', marginBottom: '0.2rem' }}>Número</label>
                <input type="text" value={currentNumber} onChange={e => setCurrentNumber(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="00" maxLength={2} onKeyDown={e => { if (e.key === 'Enter') addPlay(); }} style={{ padding: '0.65rem', borderRadius: '6px', border: '1px solid #ced4da', width: '100%', fontSize: '1.1rem', textAlign: 'center', fontWeight: 'bold' }} />
              </div>
              {editIdx === null ? (
                <button type="button" onClick={addPlay} style={{ padding: '0.65rem 1rem', borderRadius: '6px', border: 'none', backgroundColor: '#3b82f6', color: '#fff', cursor: 'pointer', fontWeight: 'bold', height: '42px' }}>+ Número</button>
              ) : (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" onClick={confirmEdit} style={{ padding: '0.55rem 0.8rem', borderRadius: '6px', border: 'none', backgroundColor: '#10b981', color: '#fff', cursor: 'pointer', fontWeight: 'bold' }}>Guardar</button>
                  <button type="button" onClick={cancelEdit} style={{ padding: '0.55rem 0.8rem', borderRadius: '6px', border: '1px solid #ef4444', backgroundColor: '#fff', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold' }}>Cancelar</button>
                </div>
              )}
            </div>
            <div style={{ flex: '1 1 260px', display: 'flex', gap: '0.4rem', alignItems: 'flex-end', backgroundColor: '#f0fdf4', padding: '0.6rem', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
              <select onChange={e => { if (e.target.value !== '') { addDecade(e.target.value); e.target.value = ''; } }} style={{ padding: '0.65rem', borderRadius: '6px', border: '1px solid #86efac', width: '100%', cursor: 'pointer' }}>
                <option value="">+ Seleccionar Decena</option>
                {[...Array(10)].map((_, i) => <option key={i} value={i}>Decena del {i} ({i}0 a {i}9)</option>)}
              </select>
            </div>
          </div>
        </div>

        {plays.length > 0 && (
          <div style={{ maxHeight: '250px', overflowY: 'auto', marginBottom: '1rem', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {plays.map((p, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.6rem' }}>{p.number}</td>
                    <td style={{ padding: '0.6rem' }}>{p.amount} viles</td>
                    <td style={{ padding: '0.6rem', textAlign: 'right' }}>
                      <button onClick={() => startEdit(idx)} style={{ color: '#0284c7', border: 'none', background: 'none' }}><Edit size={16} /></button>
                      <button onClick={() => removePlay(idx)} style={{ color: '#ef4444', border: 'none', background: 'none' }}><Trash2 size={16} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button onClick={handleSave} disabled={saving} style={{ width: '100%', padding: '1rem', borderRadius: '6px', border: 'none', backgroundColor: '#10b981', color: '#fff', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer' }}>
          {saving ? 'Registrando...' : 'Finalizar Venta'}
        </button>
      </div>
    </div>
  );
}

