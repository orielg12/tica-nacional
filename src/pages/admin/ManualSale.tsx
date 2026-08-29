import { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase';
import { useStore } from '../../store/useStore';
import { formatLotteryTime } from '../../utils/lotteryRules';
import { getLocalISODate } from '../../utils/dateUtils';
import { getDecadeNumbers } from '../../utils/math';
import { Trash2, Save, AlertCircle, Edit, Clipboard, X, CheckCircle, FileText } from 'lucide-react';

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

  // Import Text Modal State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    store.fetchLotteries();
    store.fetchUsers();
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

  // --- PARSEADOR DE TEXTO / IMPORTACIÓN RÁPIDA ---
  const handleProcessImport = () => {
    setImportError(null);
    if (!importText.trim()) {
      setImportError('Por favor pega o escribe la lista de jugadas.');
      return;
    }

    const rawLines = importText.split(/[\n,;]+/).map(l => l.trim()).filter(Boolean);
    const parsedPlays: ManualPlay[] = [];
    let detectedClient = '';

    for (const raw of rawLines) {
      let line = raw.trim();
      if (!line) continue;

      // Detectar si es cabecera de cliente
      const clientMatch = line.match(/^(?:cliente|nombre|jugador|name)\s*[:\-=]\s*(.+)$/i);
      if (clientMatch) {
        detectedClient = clientMatch[1].trim();
        continue;
      }

      // Limpiar viles / v al final
      line = line.replace(/\s*v(?:iles)?\s*$/i, '').trim();

      // Formato Decena: D3x5 o D3-5 o Decena 3 con 5
      const decadeMatch = line.match(/^(?:d|decena)\s*(\d)\s*[-x*=:\s]\s*(\d+)$/i);
      if (decadeMatch) {
        const dNum = parseInt(decadeMatch[1], 10);
        const amt = parseFloat(decadeMatch[2]);
        if (dNum >= 0 && dNum <= 9 && amt > 0) {
          getDecadeNumbers(dNum).forEach(n => parsedPlays.push({ number: n, amount: amt }));
          continue;
        }
      }

      let num = '';
      let amt = 0;
      let matched = false;

      // 1. "25x10" / "25*10" / "25 x 10"
      let m = line.match(/^(\d{1,2})\s*[x*X]\s*(\d+(?:\.\d+)?)$/);
      if (m) { num = m[1]; amt = parseFloat(m[2]); matched = true; }

      // 2. "25-10" / "25/10"
      if (!matched) {
        m = line.match(/^(\d{1,2})\s*[-–—\/]\s*(\d+(?:\.\d+)?)$/);
        if (m) { num = m[1]; amt = parseFloat(m[2]); matched = true; }
      }

      // 3. "25=10" / "25:10"
      if (!matched) {
        m = line.match(/^(\d{1,2})\s*[:=]\s*(\d+(?:\.\d+)?)$/);
        if (m) { num = m[1]; amt = parseFloat(m[2]); matched = true; }
      }

      // 4. "10 del 25" / "10 al 25" (monto primero, número después)
      if (!matched) {
        m = line.match(/^(\d+(?:\.\d+)?)\s+(?:del|al|de|el)\s+(\d{1,2})$/i);
        if (m) { amt = parseFloat(m[1]); num = m[2]; matched = true; }
      }

      // 5. "25 con 10" / "25 por 10"
      if (!matched) {
        m = line.match(/^(\d{1,2})\s+(?:con|por|de)\s+(\d+(?:\.\d+)?)$/i);
        if (m) { num = m[1]; amt = parseFloat(m[2]); matched = true; }
      }

      // 6. "25(10)" / "25 (10)"
      if (!matched) {
        m = line.match(/^(\d{1,2})\s*\((\d+(?:\.\d+)?)\)$/);
        if (m) { num = m[1]; amt = parseFloat(m[2]); matched = true; }
      }

      // 7. "25 10" (espacio simple)
      if (!matched) {
        m = line.match(/^(\d{1,2})\s+(\d+(?:\.\d+)?)$/);
        if (m) { num = m[1]; amt = parseFloat(m[2]); matched = true; }
      }

      if (matched && !isNaN(amt) && amt > 0) {
        parsedPlays.push({
          number: num.padStart(2, '0'),
          amount: amt
        });
      }
    }

    if (parsedPlays.length === 0) {
      setImportError('No se reconocieron jugadas válidas. Revisa los formatos aceptados.');
      return;
    }

    setPlays(prev => [...prev, ...parsedPlays]);
    if (detectedClient && !clientName) {
      setClientName(detectedClient);
    }
    setImportText('');
    setShowImportModal(false);
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
    <div className="p-4 md:p-8 bg-slate-50 min-h-screen text-slate-800">
      {/* Header Banner */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Save size={22} className="text-teal-600" /> Registro de Venta Manual
          </h2>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Ingresa ventas fuera del sistema (WhatsApp, papel o sorteos cerrados). Aparecerán en los reportes contables.
          </p>
        </div>

        {/* Botón Pegar Lista */}
        <button
          type="button"
          onClick={() => setShowImportModal(true)}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold text-sm shadow-sm transition-all active:scale-95"
        >
          <Clipboard size={18} />
          <span>Pegar Lista de Números</span>
        </button>
      </div>

      {result && (
        <div className={`p-4 rounded-xl mb-6 font-bold text-sm flex items-center gap-2 ${result.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {result.success ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <span>{result.message}</span>
        </div>
      )}

      {savedTicketId && (
        <div className="mb-6 flex flex-wrap gap-2">
          <button onClick={handleHideTicket} className="px-3 py-2 rounded-lg border border-sky-600 bg-white text-sky-700 font-bold text-xs flex items-center gap-1.5 shadow-sm">
            <AlertCircle size={15} /> Ocultar ticket
          </button>
          <button onClick={handleDeleteTicket} className="px-3 py-2 rounded-lg border border-red-600 bg-white text-red-700 font-bold text-xs flex items-center gap-1.5 shadow-sm">
            <Trash2 size={15} /> Eliminar ticket
          </button>
        </div>
      )}

      {/* Main Card Container */}
      <div className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-slate-200/80 mb-6 space-y-5">
        
        {/* Row 1: Sorteo & Vendedor */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Sorteo *</label>
            <select
              value={selectedLotteryId}
              onChange={e => setSelectedLotteryId(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-300 text-slate-800 bg-slate-50 font-bold text-sm outline-none focus:border-teal-500 focus:bg-white transition-colors"
            >
              <option value="">-- Selecciona Sorteo --</option>
              {allLotteries.map(l => (
                <option key={l.id} value={l.id}>
                  {l.name} - {formatLotteryTime(l.hour, l.minute)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Vendedor *</label>
            <select
              value={vendorId}
              onChange={e => setVendorId(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-300 text-slate-800 bg-slate-50 font-bold text-sm outline-none focus:border-teal-500 focus:bg-white transition-colors"
            >
              <option value="">-- Selecciona Vendedor --</option>
              {vendors.map(v => (
                <option key={v.id} value={v.username}>{v.username}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 2: Modalidad, Cliente, Fecha */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Denominación</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSaleMode(0.20)}
                className={`flex-1 py-2.5 px-3 rounded-xl font-black text-sm border-2 transition-all ${saleMode === 0.20 ? 'border-teal-600 bg-teal-50 text-teal-700 shadow-sm' : 'border-slate-200 bg-slate-50 text-slate-500'}`}
              >
                $0.20 / vil
              </button>
              <button
                type="button"
                onClick={() => setSaleMode(0.25)}
                className={`flex-1 py-2.5 px-3 rounded-xl font-black text-sm border-2 transition-all ${saleMode === 0.25 ? 'border-sky-600 bg-sky-50 text-sky-700 shadow-sm' : 'border-slate-200 bg-slate-50 text-slate-500'}`}
              >
                $0.25 / vil
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Cliente (Opcional)</label>
            <input
              type="text"
              value={clientName}
              onChange={e => setClientName(e.target.value)}
              placeholder="Nombre del cliente"
              className="w-full p-3 rounded-xl border border-slate-300 text-slate-800 bg-slate-50 font-bold text-sm outline-none focus:border-teal-500 focus:bg-white transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Fecha de Venta</label>
            <input
              type="date"
              value={saleDate}
              onChange={e => setSaleDate(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-300 text-slate-800 bg-slate-50 font-bold text-sm outline-none focus:border-teal-500 focus:bg-white transition-colors"
            />
          </div>
        </div>

        {/* Input Bar: Viles, Número, Decena */}
        <div className="pt-4 border-t border-slate-100">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            
            {/* Viles */}
            <div className="sm:col-span-3">
              <label className="block text-xs font-bold text-slate-600 mb-1">Viles (Cantidad)</label>
              <input
                type="number"
                value={currentAmount}
                onChange={e => setCurrentAmount(e.target.value)}
                placeholder="Ej. 5"
                min={1}
                className="w-full p-3 rounded-xl border-2 border-teal-500 bg-teal-50/50 text-slate-900 font-black text-center text-lg outline-none focus:bg-white transition-colors"
              />
            </div>

            {/* Número individual */}
            <div className="sm:col-span-5 bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex gap-2 items-center">
              <div className="w-24">
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Número</label>
                <input
                  type="text"
                  value={currentNumber}
                  onChange={e => setCurrentNumber(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  placeholder="00"
                  maxLength={2}
                  onKeyDown={e => { if (e.key === 'Enter') addPlay(); }}
                  className="w-full p-2 rounded-lg border border-slate-300 text-slate-900 font-mono font-black text-center text-lg outline-none bg-white"
                />
              </div>

              {editIdx === null ? (
                <button
                  type="button"
                  onClick={addPlay}
                  className="flex-1 py-3 px-3 bg-teal-600 hover:bg-teal-700 active:scale-95 text-white font-bold text-sm rounded-lg transition-all"
                >
                  + Agregar
                </button>
              ) : (
                <div className="flex-1 flex gap-1.5">
                  <button type="button" onClick={confirmEdit} className="flex-1 py-2 bg-emerald-600 text-white font-bold text-xs rounded-lg">Guardar</button>
                  <button type="button" onClick={cancelEdit} className="flex-1 py-2 bg-slate-200 text-slate-700 font-bold text-xs rounded-lg">Cancelar</button>
                </div>
              )}
            </div>

            {/* Decenas Rápidas */}
            <div className="sm:col-span-4 bg-emerald-50/50 p-2.5 rounded-xl border border-emerald-200">
              <label className="block text-[10px] font-bold text-emerald-800 uppercase mb-1">Rápido por Decenas</label>
              <select
                onChange={e => { if (e.target.value !== '') { addDecade(e.target.value); e.target.value = ''; } }}
                className="w-full p-2.5 rounded-lg border border-emerald-300 text-emerald-900 bg-white font-bold text-xs outline-none cursor-pointer"
              >
                <option value="">+ Seleccionar Decena...</option>
                {[...Array(10)].map((_, i) => (
                  <option key={i} value={i}>Decena del {i} ({i}0 al {i}9)</option>
                ))}
              </select>
            </div>

          </div>
        </div>

        {/* Plays Table / Chips */}
        {plays.length > 0 ? (
          <div className="border border-slate-200 rounded-xl overflow-hidden mt-4">
            <div className="bg-slate-100 px-4 py-2.5 flex justify-between items-center border-b border-slate-200">
              <span className="text-xs font-bold text-slate-700 uppercase">
                {plays.length} Jugadas Agregadas ({totalViles} Viles)
              </span>
              <button
                type="button"
                onClick={() => setPlays([])}
                className="text-xs text-red-600 hover:text-red-700 font-bold"
              >
                Vaciar lista
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
              {plays.map((p, idx) => (
                <div key={idx} className="flex justify-between items-center px-4 py-2.5 hover:bg-slate-50">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-slate-400">#{idx + 1}</span>
                    <span className="px-2.5 py-1 bg-teal-50 border border-teal-200 text-teal-800 font-mono font-black rounded-lg text-base">
                      {p.number}
                    </span>
                    <span className="text-xs font-bold text-slate-600">
                      {p.amount} viles (${(p.amount * saleMode).toFixed(2)})
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => startEdit(idx)} className="p-1.5 text-sky-600 hover:bg-sky-50 rounded-lg"><Edit size={16} /></button>
                    <button type="button" onClick={() => removePlay(idx)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl">
            <FileText size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-bold text-slate-500">No hay jugadas agregadas aún</p>
            <p className="text-xs text-slate-400 mt-1">Ingresa números arriba o haz clic en "Pegar Lista de Números".</p>
          </div>
        )}

        {/* Submit Bar */}
        <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase block">Total Viles</span>
              <span className="text-xl font-black text-slate-800 font-mono">{totalViles}</span>
            </div>
            <div className="h-8 w-px bg-slate-200" />
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase block">Total a Pagar</span>
              <span className="text-2xl font-black text-emerald-600 font-mono">${totalUSD.toFixed(2)}</span>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving || plays.length === 0}
            className="w-full sm:w-auto px-8 py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-base rounded-xl shadow-lg transition-all active:scale-95"
          >
            {saving ? 'Guardando en Base de Datos...' : `Finalizar Venta ($${totalUSD.toFixed(2)})`}
          </button>
        </div>

      </div>

      {/* ── MODAL: PEGAR LISTA DE NÚMEROS ── */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border border-slate-200 animate-slideUp">
            
            <div className="bg-teal-700 text-white p-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Clipboard size={20} />
                <h3 className="font-bold text-base">Pegar Lista de Jugadas</h3>
              </div>
              <button onClick={() => setShowImportModal(false)} className="text-white/80 hover:text-white"><X size={20} /></button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-600">
                Pega directamente el mensaje de WhatsApp o lista de números. Acepta cualquier formato común:
              </p>
              
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-[11px] text-slate-500 font-mono space-y-1">
                <div>• <span className="text-teal-700 font-bold">14x5, 27x10, 05x2</span> (con comas o renglón)</div>
                <div>• <span className="text-teal-700 font-bold">14-5</span> ó <span className="text-teal-700 font-bold">14 5</span> ó <span className="text-teal-700 font-bold">14=5</span> ó <span className="text-teal-700 font-bold">14(5)</span></div>
                <div>• <span className="text-teal-700 font-bold">5 del 14</span> ó <span className="text-teal-700 font-bold">14 con 5</span></div>
                <div>• <span className="text-teal-700 font-bold">D3x5</span> (Decena del 3 a 5 viles)</div>
              </div>

              <textarea
                value={importText}
                onChange={e => setImportText(e.target.value)}
                placeholder="Pega aquí el texto... Ej:&#10;Cliente: Carlos&#10;14x5&#10;27x10&#10;05x2&#10;D4x5"
                rows={7}
                className="w-full p-3 rounded-xl border border-slate-300 font-mono text-sm outline-none focus:border-teal-500 transition-colors resize-none bg-slate-50"
                autoFocus
              />

              {importError && (
                <div className="p-3 bg-red-50 text-red-700 rounded-lg text-xs font-bold flex items-center gap-1.5">
                  <AlertCircle size={16} />
                  <span>{importError}</span>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm hover:bg-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleProcessImport}
                  className="flex-1 py-3 rounded-xl bg-teal-600 text-white font-bold text-sm hover:bg-teal-700 shadow-md"
                >
                  Importar Jugadas
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

}

