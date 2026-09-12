import { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase';
import { useStore } from '../../store/useStore';
import { formatLotteryTime } from '../../utils/lotteryRules';
import { getLocalISODate } from '../../utils/dateUtils';
import { getDecadeNumbers } from '../../utils/math';
import { Trash2, Save, AlertCircle, Edit, Clipboard, X, CheckCircle, FileText, Plus, Check, Layers } from 'lucide-react';
import { SafeTextInput } from '../../components/shared/SafeTextInput';

interface ManualPlay {
  number: string;
  amount: number;
}

export default function ManualSale() {
  const store = useStore();
  const [selectedLotteryIds, setSelectedLotteryIds] = useState<string[]>([]);
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

  // Edit state
  const [editIdx, setEditIdx] = useState<number | null>(null);

  useEffect(() => {
    store.fetchLotteries();
    store.fetchUsers();
  }, []);

  const allLotteries = store.lotteriesMaster.filter(l => l.isActive);

  // Toggle individual lottery
  const toggleLottery = (id: string) => {
    setSelectedLotteryIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const selectAllLotteries = () => {
    setSelectedLotteryIds(allLotteries.map(l => l.id));
  };

  const clearAllLotteries = () => {
    setSelectedLotteryIds([]);
  };

  const addPlay = () => {
    const num = currentNumber.padStart(2, '0');
    const amt = parseFloat(currentAmount);
    if (!num || num.length < 2 || isNaN(amt) || amt <= 0) {
      alert('Ingresa un número válido de 2 dígitos y una cantidad de viles mayor a 0.');
      return;
    }
    setPlays(prev => [...prev, { number: num, amount: amt }]);
    setCurrentNumber('');
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
  };

  const startEdit = (idx: number) => {
    const play = plays[idx];
    setCurrentNumber(play.number);
    setCurrentAmount(play.amount.toString());
    setEditIdx(idx);
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
      newPlays[editIdx] = { number: num, amount: amt };
      return newPlays;
    });
    setCurrentNumber('');
    setEditIdx(null);
  };

  const cancelEdit = () => {
    setCurrentNumber('');
    setEditIdx(null);
  };

  const removePlay = (idx: number) => {
    setPlays(plays.filter((_, i) => i !== idx));
    if (editIdx === idx) {
      cancelEdit();
    }
  };

  // Import text parser
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

      const clientMatch = line.match(/^(?:cliente|nombre|jugador|name)\s*[:\-=]\s*(.+)$/i);
      if (clientMatch) {
        detectedClient = clientMatch[1].trim();
        continue;
      }

      line = line.replace(/\s*v(?:iles)?\s*$/i, '').trim();

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

      let m = line.match(/^(\d{1,2})\s*[x*X]\s*(\d+(?:\.\d+)?)$/);
      if (m) { num = m[1]; amt = parseFloat(m[2]); matched = true; }

      if (!matched) {
        m = line.match(/^(\d{1,2})\s*[-–—\/]\s*(\d+(?:\.\d+)?)$/);
        if (m) { num = m[1]; amt = parseFloat(m[2]); matched = true; }
      }

      if (!matched) {
        m = line.match(/^(\d{1,2})\s*[:=]\s*(\d+(?:\.\d+)?)$/);
        if (m) { num = m[1]; amt = parseFloat(m[2]); matched = true; }
      }

      if (!matched) {
        m = line.match(/^(\d+(?:\.\d+)?)\s+(?:del|al|de|el)\s+(\d{1,2})$/i);
        if (m) { amt = parseFloat(m[1]); num = m[2]; matched = true; }
      }

      if (!matched) {
        m = line.match(/^(\d{1,2})\s+(?:con|por|de)\s+(\d+(?:\.\d+)?)$/i);
        if (m) { num = m[1]; amt = parseFloat(m[2]); matched = true; }
      }

      if (!matched) {
        m = line.match(/^(\d{1,2})\s*\((\d+(?:\.\d+)?)\)$/);
        if (m) { num = m[1]; amt = parseFloat(m[2]); matched = true; }
      }

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

  const numSelectedLotteries = selectedLotteryIds.length;
  const totalViles = plays.reduce((sum, p) => sum + p.amount, 0);
  const totalUSD = (totalViles * saleMode) * (numSelectedLotteries > 0 ? numSelectedLotteries : 1);

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
    if (selectedLotteryIds.length === 0) {
      alert('Selecciona al menos un sorteo.');
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

      const tnPayload: any[] = [];
      for (const lotteryId of selectedLotteryIds) {
        for (const p of plays) {
          tnPayload.push({
            ticket_id: ticket.id,
            draw_id: lotteryId,
            number_played: p.number,
            amount: p.amount,
            created_at: createdAt
          });
        }
      }

      const { error: tnError } = await supabase
        .from('ticket_numbers')
        .insert(tnPayload);

      if (tnError) throw tnError;

      setResult({
        success: true,
        message: `✅ Venta registrada exitosamente. Ticket: ${ticket.id.split('-')[0].toUpperCase()} (${plays.length} números × ${selectedLotteryIds.length} sorteo(s) = $${totalUSD.toFixed(2)})`
      });
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
    <div className="w-full min-h-full bg-slate-100/70 p-4 sm:p-6 lg:p-8">
      
      {/* Contenedor centralizado para no estirarse a lo infinito */}
      <div className="max-w-5xl mx-auto space-y-5">

        {/* ── HEADER BANNER ── */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700 flex-shrink-0">
              <Save size={22} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 leading-tight">
                Registro de Venta Manual
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Ingresa ventas externas de uno o varios sorteos (WhatsApp o papel).
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            style={{ backgroundColor: '#0d9488', color: '#ffffff' }}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs shadow-sm hover:opacity-90 active:scale-95 transition-all whitespace-nowrap"
          >
            <Clipboard size={16} />
            <span>Pegar Lista de WhatsApp</span>
          </button>
        </div>

        {/* ── ALERTAS DE ESTADO ── */}
        {result && (
          <div className={`p-4 rounded-xl font-bold text-sm flex items-start gap-3 shadow-sm ${result.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {result.success ? <CheckCircle size={20} className="flex-shrink-0 text-emerald-600 mt-0.5" /> : <AlertCircle size={20} className="flex-shrink-0 text-red-600 mt-0.5" />}
            <div className="flex-1">{result.message}</div>
          </div>
        )}

        {savedTicketId && (
          <div className="flex flex-wrap gap-2.5">
            <button onClick={handleHideTicket} className="px-3.5 py-2 rounded-xl border border-sky-600 bg-white text-sky-700 font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all">
              <AlertCircle size={15} /> Ocultar ticket
            </button>
            <button onClick={handleDeleteTicket} className="px-3.5 py-2 rounded-xl border border-red-600 bg-white text-red-700 font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all">
              <Trash2 size={15} /> Eliminar ticket
            </button>
          </div>
        )}

        {/* ── CARD 1: SORTEOS A JUGAR ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Layers size={18} className="text-teal-600" />
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Sorteos a Jugar
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${selectedLotteryIds.length > 0 ? 'bg-teal-50 text-teal-700 border border-teal-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                {selectedLotteryIds.length} seleccionado(s)
              </span>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={selectAllLotteries}
                className="px-3 py-1 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs rounded-lg transition-colors"
              >
                ✓ Seleccionar Todos
              </button>
              <button
                type="button"
                onClick={clearAllLotteries}
                className="px-3 py-1 bg-slate-50 hover:bg-red-50 text-slate-600 hover:text-red-600 border border-slate-200 font-bold text-xs rounded-lg transition-colors"
              >
                ✕ Desmarcar
              </button>
            </div>
          </div>

          {/* Grid compacto de chips de sorteos */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 max-h-44 overflow-y-auto pr-1">
            {allLotteries.map(l => {
              const isSelected = selectedLotteryIds.includes(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => toggleLottery(l.id)}
                  style={isSelected ? { backgroundColor: '#0d9488', borderColor: '#0f766e', color: '#ffffff' } : { backgroundColor: '#f8fafc', borderColor: '#e2e8f0', color: '#334155' }}
                  className={`p-2.5 rounded-xl border text-left flex items-center justify-between gap-1.5 transition-all active:scale-95 shadow-2xs hover:shadow-xs`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-xs truncate leading-tight">{l.name}</div>
                    <div className={`text-[10px] font-mono mt-0.5 ${isSelected ? 'text-teal-100' : 'text-slate-400'}`}>
                      {formatLotteryTime(l.hour, l.minute)}
                    </div>
                  </div>
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-white text-teal-700' : 'border border-slate-300 bg-white'}`}>
                    {isSelected && <Check size={12} strokeWidth={3} />}
                  </div>
                </button>
              );
            })}
          </div>
          {selectedLotteryIds.length === 0 && (
            <p className="text-[11px] text-amber-600 font-bold pt-1 flex items-center gap-1">
              <AlertCircle size={13} />
              Debes marcar al menos un sorteo para realizar la venta.
            </p>
          )}
        </div>

        {/* ── CARD 2: DATOS DE LA VENTA (SIMETRÍA TOTAL EN 4 COLS) ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Vendedor */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1 uppercase tracking-wide">
                Vendedor Responsable *
              </label>
              <select
                value={vendorId}
                onChange={e => setVendorId(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-slate-300 text-slate-800 bg-white font-bold text-sm outline-none focus:border-teal-500 transition-colors"
              >
                <option value="">-- Seleccionar --</option>
                {vendors.map(v => (
                  <option key={v.id} value={v.username}>{v.username}</option>
                ))}
              </select>
            </div>

            {/* Cliente */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1 uppercase tracking-wide">
                Cliente (Opcional)
              </label>
              <SafeTextInput
                value={clientName}
                onChange={setClientName}
                placeholder="Nombre del cliente"
                className="w-full h-11 px-3 rounded-xl border border-slate-300 text-slate-800 bg-white font-bold text-sm outline-none focus:border-teal-500 transition-colors"
              />
            </div>

            {/* Modalidad / Denominación */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1 uppercase tracking-wide">
                Precio por Vil
              </label>
              <div className="flex gap-2 h-11">
                <button
                  type="button"
                  onClick={() => setSaleMode(0.20)}
                  style={saleMode === 0.20 ? { backgroundColor: '#f0fdf4', borderColor: '#16a34a', color: '#15803d' } : { backgroundColor: '#f8fafc', borderColor: '#e2e8f0', color: '#64748b' }}
                  className="flex-1 rounded-xl font-bold text-xs sm:text-sm border-2 transition-all flex items-center justify-center"
                >
                  $0.20 / vil
                </button>
                <button
                  type="button"
                  onClick={() => setSaleMode(0.25)}
                  style={saleMode === 0.25 ? { backgroundColor: '#f0f9ff', borderColor: '#0284c7', color: '#0369a1' } : { backgroundColor: '#f8fafc', borderColor: '#e2e8f0', color: '#64748b' }}
                  className="flex-1 rounded-xl font-bold text-xs sm:text-sm border-2 transition-all flex items-center justify-center"
                >
                  $0.25 / vil
                </button>
              </div>
            </div>

            {/* Fecha */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1 uppercase tracking-wide">
                Fecha de Venta
              </label>
              <input
                type="date"
                value={saleDate}
                onChange={e => setSaleDate(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-slate-300 text-slate-800 bg-white font-bold text-sm outline-none focus:border-teal-500 transition-colors"
              />
            </div>

          </div>
        </div>

        {/* ── CARD 3: ENTRADA DE JUGADAS (SIMÉTRICA CON BOTÓN DESTACADO) ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-3">
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
            Entrada de Jugadas
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
            
            {/* Viles */}
            <div className="sm:col-span-1 lg:col-span-3">
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Viles (Monto)
              </label>
              <input
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                min="1"
                value={currentAmount}
                onChange={e => setCurrentAmount(e.target.value)}
                placeholder="Ej. 5"
                className="w-full h-12 px-3 rounded-xl border-2 border-slate-300 focus:border-teal-500 bg-white text-slate-900 font-bold text-center text-xl outline-none transition-all shadow-2xs"
              />
            </div>

            {/* Número */}
            <div className="sm:col-span-1 lg:col-span-3">
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Número (00-99)
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={2}
                value={currentNumber}
                onChange={e => setCurrentNumber(e.target.value.replace(/\D/g, '').slice(0, 2))}
                onKeyDown={e => { if (e.key === 'Enter') addPlay(); }}
                placeholder="00"
                className="w-full h-12 px-3 rounded-xl border-2 border-slate-300 focus:border-teal-500 bg-white text-slate-900 font-mono font-bold text-center text-xl outline-none transition-all shadow-2xs"
              />
            </div>

            {/* Botón Acción: + Agregar Jugada */}
            <div className="sm:col-span-2 lg:col-span-3">
              {editIdx === null ? (
                <button
                  type="button"
                  onClick={addPlay}
                  style={{ backgroundColor: '#0d9488', color: '#ffffff' }}
                  className="w-full h-12 rounded-xl font-bold text-sm shadow-sm hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <Plus size={20} strokeWidth={2.5} />
                  <span>+ Agregar Jugada</span>
                </button>
              ) : (
                <div className="flex gap-2 h-12">
                  <button
                    type="button"
                    onClick={confirmEdit}
                    style={{ backgroundColor: '#16a34a', color: '#ffffff' }}
                    className="flex-1 rounded-xl font-bold text-xs shadow-sm hover:opacity-90 transition-all flex items-center justify-center gap-1"
                  >
                    <Check size={16} /> Guardar
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all border border-slate-200"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>

            {/* Decenas Rápidas */}
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Decenas Rápidas
              </label>
              <select
                onChange={e => {
                  if (e.target.value !== '') {
                    addDecade(e.target.value);
                    e.target.value = '';
                  }
                }}
                className="w-full h-12 px-3 rounded-xl border-2 border-slate-300 focus:border-teal-500 text-slate-800 bg-white font-bold text-xs outline-none cursor-pointer shadow-2xs transition-all"
              >
                <option value="">+ Agregar Decena (10 Núms)...</option>
                {[...Array(10)].map((_, i) => (
                  <option key={i} value={i}>
                    Decena del {i} ({i}0 al {i}9)
                  </option>
                ))}
              </select>
            </div>

          </div>
        </div>

        {/* ── CARD 4: LISTA DE JUGADAS AGREGADAS ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {plays.length > 0 ? (
            <div>
              <div className="bg-slate-50 px-5 py-3 flex flex-wrap justify-between items-center gap-2 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    {plays.length} Apunte(s)
                  </span>
                  <span className="text-xs font-bold text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full">
                    {totalViles} Viles por sorteo
                  </span>
                  {numSelectedLotteries > 1 && (
                    <span className="text-xs font-bold text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full">
                      × {numSelectedLotteries} sorteos = {totalViles * numSelectedLotteries} viles tot.
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setPlays([])}
                  className="text-xs text-red-600 hover:text-red-700 font-bold flex items-center gap-1 hover:underline"
                >
                  <Trash2 size={14} /> Vaciar lista
                </button>
              </div>

              <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 bg-white">
                {plays.map((p, idx) => (
                  <div key={idx} className="flex justify-between items-center px-5 py-2.5 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono text-slate-400 w-6">#{idx + 1}</span>
                      <span className="px-3 py-1 bg-teal-50 border border-teal-200 text-teal-800 font-mono font-bold rounded-lg text-lg min-w-[48px] text-center shadow-2xs">
                        {p.number}
                      </span>
                      <div className="text-xs">
                        <span className="font-bold text-slate-800">{p.amount} viles</span>
                        <span className="text-slate-400 ml-1.5 font-mono">
                          (${(p.amount * saleMode * Math.max(1, numSelectedLotteries)).toFixed(2)})
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(idx)}
                        className="p-2 text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
                        title="Editar jugada"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removePlay(idx)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Eliminar jugada"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-10 px-4">
              <FileText size={36} className="mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-bold text-slate-600">No hay jugadas agregadas aún</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Ingresa viles y número arriba y presiona "+ Agregar Jugada", o pega un mensaje de WhatsApp.
              </p>
            </div>
          )}

          {/* Footer de la tarjeta con totales y botón finalizar */}
          <div className="bg-slate-50 p-5 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-6 w-full sm:w-auto justify-around sm:justify-start">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider">
                  Total Viles
                </span>
                <span className="text-xl font-bold text-slate-800 font-mono">
                  {totalViles}
                </span>
              </div>

              <div className="h-8 w-px bg-slate-200" />

              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider">
                  Sorteos
                </span>
                <span className="text-xl font-bold text-teal-700 font-mono">
                  {numSelectedLotteries}
                </span>
              </div>

              <div className="h-8 w-px bg-slate-200" />

              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider">
                  Total a Pagar
                </span>
                <span className="text-2xl sm:text-3xl font-bold text-emerald-600 font-mono">
                  ${totalUSD.toFixed(2)}
                </span>
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={saving || plays.length === 0 || numSelectedLotteries === 0 || !vendorId}
              style={{ backgroundColor: (saving || plays.length === 0 || numSelectedLotteries === 0 || !vendorId) ? '#94a3b8' : '#059669', color: '#ffffff' }}
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl font-bold text-base shadow-md hover:opacity-95 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {saving ? (
                <span>Guardando...</span>
              ) : (
                <span>
                  Finalizar Venta ({numSelectedLotteries} {numSelectedLotteries === 1 ? 'Sorteo' : 'Sorteos'}) — ${totalUSD.toFixed(2)}
                </span>
              )}
            </button>
          </div>
        </div>

      </div>

      {/* ── MODAL: PEGAR LISTA DE NÚMEROS / WHATSAPP ── */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border border-slate-200">
            
            <div style={{ backgroundColor: '#0d9488' }} className="text-white p-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Clipboard size={20} />
                <h3 className="font-bold text-base">Pegar Lista de Jugadas (WhatsApp)</h3>
              </div>
              <button onClick={() => setShowImportModal(false)} className="text-white/80 hover:text-white p-1">
                <X size={20} />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4">
              <p className="text-xs text-slate-600">
                Pega directamente el mensaje de WhatsApp. Reconoce formatos automáticos:
              </p>
              
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-[11px] text-slate-600 font-mono space-y-1">
                <div>• <span className="text-teal-700 font-bold">14x5, 27x10, 05x2</span> (por comas o líneas)</div>
                <div>• <span className="text-teal-700 font-bold">14-5</span> o <span className="text-teal-700 font-bold">14 5</span> o <span className="text-teal-700 font-bold">14=5</span></div>
                <div>• <span className="text-teal-700 font-bold">5 del 14</span> o <span className="text-teal-700 font-bold">14 con 5</span></div>
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
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm hover:bg-slate-200 transition-colors border border-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleProcessImport}
                  style={{ backgroundColor: '#0d9488', color: '#ffffff' }}
                  className="flex-1 py-2.5 rounded-xl font-bold text-sm shadow-sm hover:opacity-90 transition-colors"
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
