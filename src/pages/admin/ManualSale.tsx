import { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase';
import { useStore } from '../../store/useStore';
import { formatLotteryTime } from '../../utils/lotteryRules';
import { getLocalISODate } from '../../utils/dateUtils';
import { getDecadeNumbers } from '../../utils/math';
import { 
  Trash2, Save, AlertCircle, Edit, Clipboard, X, CheckCircle, 
  FileText, Plus, Check, Layers, User, Calendar, DollarSign, 
  Hash, Sparkles, RefreshCw
} from 'lucide-react';
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
  const [currentAmount, setCurrentAmount] = useState('1');
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
    if (!currentNumber || num.length < 2 || isNaN(amt) || amt <= 0) {
      alert('Ingresa un número válido de 2 dígitos y una cantidad de viles mayor a 0.');
      return;
    }
    setPlays(prev => [...prev, { number: num, amount: amt }]);
    setCurrentNumber('');
  };

  const addDecade = (decadeIdx: number) => {
    const amt = parseFloat(currentAmount);
    if (isNaN(amt) || amt <= 0) {
      alert('Ingresa una cantidad de viles mayor a 0 en la casilla de Viles primero.');
      return;
    }
    const decadeNums = getDecadeNumbers(decadeIdx);
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
    if (!currentNumber || num.length < 2 || isNaN(amt) || amt <= 0) {
      alert('Ingresa un número válido (2 dígitos) y una cantidad de viles mayor a 0.');
      return;
    }
    setPlays(prev => {
      const newPlays = [...prev];
      newPlays[editIdx] = { number: num, amount: amt };
      return newPlays;
    });
    setEditIdx(null);
    setCurrentNumber('');
  };

  const cancelEdit = () => {
    setEditIdx(null);
    setCurrentNumber('');
  };

  const removePlay = (idx: number) => {
    setPlays(prev => prev.filter((_, i) => i !== idx));
    if (editIdx === idx) {
      setEditIdx(null);
      setCurrentNumber('');
    }
  };

  const clearPlays = () => {
    if (plays.length === 0) return;
    if (window.confirm('¿Seguro que deseas vaciar todas las jugadas anotadas?')) {
      setPlays([]);
      setEditIdx(null);
      setCurrentNumber('');
    }
  };

  // Import parser for WhatsApp text
  const handleImportPlays = () => {
    setImportError(null);
    if (!importText.trim()) {
      setImportError('El texto está vacío.');
      return;
    }

    const lines = importText.split('\n');
    const imported: ManualPlay[] = [];

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      const match = trimmed.match(/^(\d{1,2})[\s\-:=xX]+(\d+(?:\.\d+)?)\s*v?$/i);
      if (match) {
        const num = match[1].padStart(2, '0');
        const amt = parseFloat(match[2]);
        if (!isNaN(amt) && amt > 0) {
          imported.push({ number: num, amount: amt });
          return;
        }
      }

      const matchRev = trimmed.match(/^(\d+(?:\.\d+)?)\s*v?[\s\-:=xX]+(\d{1,2})$/i);
      if (matchRev) {
        const amt = parseFloat(matchRev[1]);
        const num = matchRev[2].padStart(2, '0');
        if (!isNaN(amt) && amt > 0) {
          imported.push({ number: num, amount: amt });
        }
      }
    });

    if (imported.length === 0) {
      setImportError('No se encontraron jugadas válidas. Formato esperado: "45 10v", "45-10" o "10x45".');
      return;
    }

    setPlays(prev => [...prev, ...imported]);
    setShowImportModal(false);
    setImportText('');
  };

  // Final sale calculations
  const numSelectedLotteries = selectedLotteryIds.length;
  const totalVilesPerLottery = plays.reduce((acc, p) => acc + p.amount, 0);
  const totalVilesAllLotteries = totalVilesPerLottery * numSelectedLotteries;
  const totalDollarsAllLotteries = totalVilesAllLotteries * saleMode;

  const handleSaveSale = async () => {
    if (!vendorId) {
      alert('Debes seleccionar el Vendedor Responsable.');
      return;
    }
    if (selectedLotteryIds.length === 0) {
      alert('Debes seleccionar al menos un Sorteo a jugar.');
      return;
    }
    if (plays.length === 0) {
      alert('Debes ingresar al menos una jugada.');
      return;
    }

    const confirmMsg = `¿Confirmas el registro de esta VENTA MANUAL?\n\n` +
      `• Sorteos: ${numSelectedLotteries}\n` +
      `• Jugadas: ${plays.length}\n` +
      `• Viles Totales: ${totalVilesAllLotteries}\n` +
      `• TOTAL A COBRAR: $${totalDollarsAllLotteries.toFixed(2)}\n` +
      `• Vendedor: ${vendorId}\n` +
      `• Fecha: ${saleDate}`;

    if (!window.confirm(confirmMsg)) return;

    setSaving(true);
    setResult(null);

    try {
      const createdTickets: string[] = [];

      for (const lotteryId of selectedLotteryIds) {
        const lotteryTotalAmount = totalVilesPerLottery * saleMode;

        const { data: ticketData, error: ticketErr } = await supabase
          .from('tickets')
          .insert({
            vendor_id: vendorId,
            total_amount: lotteryTotalAmount,
            status: 'active',
            client_name: clientName.trim() || 'General',
            created_at: new Date(saleDate + 'T12:00:00Z').toISOString()
          })
          .select('id')
          .single();

        if (ticketErr || !ticketData) {
          throw new Error(`Error creando ticket para la lotería: ${ticketErr?.message}`);
        }

        createdTickets.push(ticketData.id);

        const ticketNumbersToInsert = plays.map(p => ({
          ticket_id: ticketData.id,
          draw_id: lotteryId,
          number_played: p.number,
          amount: p.amount
        }));

        const { error: numbersErr } = await supabase
          .from('ticket_numbers')
          .insert(ticketNumbersToInsert);

        if (numbersErr) {
          throw new Error(`Error guardando números del ticket: ${numbersErr.message}`);
        }
      }

      setSavedTicketId(createdTickets[0]);
      setResult({
        success: true,
        message: `¡Venta manual guardada con éxito! Se generaron ${createdTickets.length} ticket(s) con un monto total de $${totalDollarsAllLotteries.toFixed(2)}.`
      });

      setPlays([]);
      setCurrentNumber('');
      setCurrentAmount('1');
    } catch (err: any) {
      setResult({
        success: false,
        message: err.message || 'Error desconocido al guardar la venta manual.'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleHideTicket = () => {
    setSavedTicketId(null);
    setResult(null);
  };

  const handleDeleteTicket = async () => {
    if (!savedTicketId) return;
    if (!window.confirm('¿Estás seguro de ELIMINAR el último ticket guardado? Esta acción es irreversible.')) return;

    try {
      await supabase.from('ticket_numbers').delete().eq('ticket_id', savedTicketId);
      await supabase.from('tickets').delete().eq('id', savedTicketId);
      setSavedTicketId(null);
      setResult({ success: true, message: 'Ticket eliminado correctamente.' });
    } catch (err: any) {
      alert('Error eliminando ticket: ' + err.message);
    }
  };

  const vendors = store.users.filter(u => u.role === 'Vendedor' || u.role === 'vendor');

  return (
    <div className="w-full bg-[#f8fafc] min-h-screen p-3 sm:p-5 lg:p-7">
      <div className="max-w-6xl mx-auto space-y-5">

        {/* ── HEADER PRINCIPAL FINTECH ── */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-500/25 flex-shrink-0">
              <Save size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Registro de Venta Manual
                </h1>
                <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  Panel Admin
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Emisión centralizada de tickets con soporte para múltiples sorteos en paralelo.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-sm transition-all active:scale-95 whitespace-nowrap"
          >
            <Clipboard size={16} />
            <span>Pegar Lista de WhatsApp</span>
          </button>
        </div>

        {/* ── ALERTA DE RESULTADO ── */}
        {result && (
          <div className={`p-4 rounded-xl font-bold text-sm flex items-start gap-3 shadow-sm ${result.success ? 'bg-emerald-50 text-emerald-900 border border-emerald-300' : 'bg-red-50 text-red-900 border border-red-300'}`}>
            {result.success ? <CheckCircle size={22} className="text-emerald-600 flex-shrink-0 mt-0.5" /> : <AlertCircle size={22} className="text-red-600 flex-shrink-0 mt-0.5" />}
            <div className="flex-1 leading-relaxed">{result.message}</div>
          </div>
        )}

        {savedTicketId && (
          <div className="flex flex-wrap gap-2.5">
            <button onClick={handleHideTicket} className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 font-bold text-xs flex items-center gap-1.5 shadow-xs hover:bg-slate-50">
              <Check size={15} /> Aceptar y Ocultar
            </button>
            <button onClick={handleDeleteTicket} className="px-4 py-2 rounded-xl border border-red-300 bg-red-50 text-red-700 font-bold text-xs flex items-center gap-1.5 shadow-xs hover:bg-red-100">
              <Trash2 size={15} /> Anular / Eliminar este ticket
            </button>
          </div>
        )}

        {/* ── KPI MINI-METRIC CARDS (EN VIVO) ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div className="flex justify-between items-center text-slate-500">
              <span className="text-xs font-bold uppercase tracking-wider">Jugadas</span>
              <Hash size={16} className="text-blue-600" />
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl sm:text-3xl font-black font-mono text-slate-900">{plays.length}</span>
              <span className="text-xs text-slate-400">líneas</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div className="flex justify-between items-center text-slate-500">
              <span className="text-xs font-bold uppercase tracking-wider">Viles / Sorteo</span>
              <Sparkles size={16} className="text-indigo-600" />
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl sm:text-3xl font-black font-mono text-indigo-700">{totalVilesPerLottery}</span>
              <span className="text-xs text-slate-400">totales</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div className="flex justify-between items-center text-slate-500">
              <span className="text-xs font-bold uppercase tracking-wider">Sorteos</span>
              <Layers size={16} className={numSelectedLotteries > 0 ? "text-blue-600" : "text-amber-500"} />
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className={`text-2xl sm:text-3xl font-black font-mono ${numSelectedLotteries > 0 ? 'text-blue-700' : 'text-amber-600'}`}>{numSelectedLotteries}</span>
              <span className="text-xs text-slate-400">loterías</span>
            </div>
          </div>

          <div className="bg-emerald-50/80 p-4 rounded-2xl border-2 border-emerald-300 shadow-xs flex flex-col justify-between">
            <div className="flex justify-between items-center text-emerald-800">
              <span className="text-xs font-black uppercase tracking-wider">TOTAL A COBRAR</span>
              <DollarSign size={18} className="text-emerald-700" />
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-700">${totalDollarsAllLotteries.toFixed(2)}</span>
            </div>
          </div>

        </div>

        {/* ── CARD 1: SELECTOR DE SORTEOS DESTINO ── */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <Layers size={20} className="text-blue-600" />
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Sorteos a Jugar
                </h3>
                <span className="text-xs text-slate-500">
                  Puedes seleccionar un solo sorteo o múltiples sorteos simultáneamente.
                </span>
              </div>
              <span className={`ml-2 px-2.5 py-0.5 rounded-full text-xs font-bold ${numSelectedLotteries > 0 ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                {numSelectedLotteries} seleccionado(s)
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAllLotteries}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors active:scale-95"
              >
                ✓ Seleccionar Todos
              </button>
              <button
                type="button"
                onClick={clearAllLotteries}
                className="px-3 py-1.5 bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-700 font-bold text-xs rounded-xl transition-colors active:scale-95"
              >
                ✕ Desmarcar
              </button>
            </div>
          </div>

          {/* Grid de Chips de Sorteos */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 max-h-52 overflow-y-auto pr-1">
            {allLotteries.map(l => {
              const isSelected = selectedLotteryIds.includes(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => toggleLottery(l.id)}
                  className={`p-3 rounded-xl border text-left flex items-center justify-between gap-2 transition-all active:scale-95 shadow-xs ${
                    isSelected 
                      ? 'bg-blue-600 border-blue-700 text-white shadow-md ring-2 ring-blue-200' 
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-xs truncate leading-tight">{l.name}</div>
                    <div className={`text-[10px] font-mono mt-0.5 ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>
                      {formatLotteryTime(l.hour, l.minute)}
                    </div>
                  </div>
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${isSelected ? 'bg-white text-blue-700' : 'border border-slate-300 bg-slate-50'}`}>
                    {isSelected && '✓'}
                  </div>
                </button>
              );
            })}
          </div>
          {allLotteries.length === 0 && (
            <p className="text-center py-4 text-xs text-slate-400 italic">No hay sorteos activos configurados en el sistema.</p>
          )}
        </div>

        {/* ── CARD 2: DATOS DE LA VENTA (4 COLUMNAS SIMÉTRICAS) ── */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Vendedor */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1 uppercase tracking-wide flex items-center gap-1">
                <User size={14} className="text-blue-600" /> Vendedor Responsable *
              </label>
              <select
                value={vendorId}
                onChange={e => setVendorId(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-slate-300 text-slate-800 bg-white font-bold text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-colors"
              >
                <option value="">-- Seleccionar Vendedor --</option>
                {vendors.map(v => (
                  <option key={v.id} value={v.username}>{v.username} ({v.name || 'Sin nombre'})</option>
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
                className="w-full h-11 px-3 rounded-xl border border-slate-300 text-slate-800 bg-white font-bold text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-colors"
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
                  className={`flex-1 rounded-xl font-bold text-xs sm:text-sm border-2 transition-all flex items-center justify-center ${
                    saleMode === 0.20 
                      ? 'bg-blue-50 border-blue-600 text-blue-700 shadow-xs' 
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  $0.20 / vil
                </button>
                <button
                  type="button"
                  onClick={() => setSaleMode(0.25)}
                  className={`flex-1 rounded-xl font-bold text-xs sm:text-sm border-2 transition-all flex items-center justify-center ${
                    saleMode === 0.25 
                      ? 'bg-blue-50 border-blue-600 text-blue-700 shadow-xs' 
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  $0.25 / vil
                </button>
              </div>
            </div>

            {/* Fecha */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1 uppercase tracking-wide flex items-center gap-1">
                <Calendar size={14} className="text-blue-600" /> Fecha de Emisión
              </label>
              <input
                type="date"
                value={saleDate}
                onChange={e => setSaleDate(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-slate-300 text-slate-800 bg-white font-bold text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-colors"
              />
            </div>

          </div>
        </div>

        {/* ── CARD 3: ENTRADA DE JUGADAS (SIMÉTRICA Y ÁGIL) ── */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              {editIdx !== null ? `✏️ Editando Jugada #${editIdx + 1}` : 'Entrada de Jugadas'}
            </h3>
            {editIdx !== null && (
              <button
                type="button"
                onClick={cancelEdit}
                className="text-xs text-slate-500 hover:text-slate-800 font-bold"
              >
                Cancelar Edición
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            
            {/* Viles */}
            <div className="sm:col-span-4">
              <div className="flex justify-between items-center mb-1">
                <label className="text-[11px] font-bold text-slate-600 uppercase">
                  Viles (Monto)
                </label>
                <div className="flex gap-1">
                  {[1, 5, 10].map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setCurrentAmount(v.toString())}
                      className="px-2 py-0.5 text-[10px] font-bold rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                    >
                      +{v}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                min="1"
                value={currentAmount}
                onChange={e => setCurrentAmount(e.target.value)}
                placeholder="1"
                className="w-full h-12 px-3 rounded-xl border-2 border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900 font-mono text-xl font-bold outline-none transition-colors"
              />
            </div>

            {/* Número */}
            <div className="sm:col-span-4">
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Número (00 al 99)
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={2}
                value={currentNumber}
                onChange={e => setCurrentNumber(e.target.value.replace(/\D/g, '').slice(0, 2))}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (editIdx !== null) confirmEdit();
                    else addPlay();
                  }
                }}
                placeholder="Ej. 45"
                className="w-full h-12 px-3 rounded-xl border-2 border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900 font-mono text-xl font-black text-center outline-none transition-colors"
              />
            </div>

            {/* Botón Acción */}
            <div className="sm:col-span-4">
              {editIdx !== null ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={confirmEdit}
                    className="flex-1 h-12 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl font-black text-sm shadow-md transition-all flex items-center justify-center gap-1.5"
                  >
                    ✓ Guardar Cambio
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="h-12 px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-sm"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={addPlay}
                  className="w-full h-12 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl font-black text-sm shadow-md shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center gap-1.5"
                >
                  <Plus size={18} />
                  <span>AGREGAR JUGADA</span>
                </button>
              )}
            </div>

          </div>

          {/* Selector de Decenas Rápidas */}
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                Cargar Decena Completa (10 números con {currentAmount || 1} viles):
              </span>
            </div>
            <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => addDecade(d)}
                  className="py-2 px-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 font-mono font-bold text-xs text-slate-700 transition-colors text-center active:scale-95"
                >
                  {d}0 - {d}9
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── CARD 4: TABLA DE APUNTES REGISTRADOS ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <FileText size={18} className="text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Apuntes en Lista
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                {plays.length}
              </span>
            </div>

            {plays.length > 0 && (
              <button
                type="button"
                onClick={clearPlays}
                className="text-xs font-bold text-red-600 hover:text-red-700 flex items-center gap-1 py-1 px-2.5 rounded-lg hover:bg-red-50 transition-colors"
              >
                <Trash2 size={14} /> Vaciar Todo
              </button>
            )}
          </div>

          {plays.length === 0 ? (
            <div className="p-10 text-center text-slate-400">
              <FileText size={36} className="mx-auto mb-2 opacity-30 text-slate-400" />
              <p className="font-bold text-sm text-slate-600">No hay jugadas registradas aún</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Ingresa los números arriba o utiliza el botón de importar desde WhatsApp para cargar listas rápidamente.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase">
                    <th className="py-3 px-4 w-12 text-center">#</th>
                    <th className="py-3 px-4">Número</th>
                    <th className="py-3 px-4 text-center">Viles</th>
                    <th className="py-3 px-4 text-center">Subtotal/Sorteo</th>
                    <th className="py-3 px-4 text-right">Total ({numSelectedLotteries} sort.)</th>
                    <th className="py-3 px-4 text-center w-24">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {plays.map((p, idx) => {
                    const subtotal = p.amount * saleMode;
                    const totalPlay = subtotal * (numSelectedLotteries || 1);
                    return (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-4 text-center text-xs text-slate-400 font-sans">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-4 font-sans">
                          <span className="inline-block px-3 py-1 bg-blue-50 border border-blue-200 text-blue-700 font-black font-mono text-base rounded-lg">
                            {p.number}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-center font-bold text-slate-700">
                          {p.amount} <span className="text-[10px] text-slate-400 font-sans">v</span>
                        </td>
                        <td className="py-2.5 px-4 text-center text-slate-600 font-bold">
                          ${subtotal.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-black text-slate-900">
                          ${totalPlay.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1 font-sans">
                            <button
                              type="button"
                              onClick={() => startEdit(idx)}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Editar"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => removePlay(idx)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── CARD 5: RESUMEN Y BOTÓN FINAL DE GUARDAR ── */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-center sm:text-left">
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Resumen Final:</div>
            <div className="text-sm font-bold text-slate-800 mt-0.5">
              {plays.length} jugadas × {totalVilesPerLottery} viles × {numSelectedLotteries} sorteo(s)
            </div>
            <div className="text-2xl sm:text-3xl font-black text-emerald-700 font-mono mt-1">
              ${totalDollarsAllLotteries.toFixed(2)}
            </div>
          </div>

          <button
            type="button"
            onClick={handleSaveSale}
            disabled={saving || plays.length === 0 || numSelectedLotteries === 0}
            className="w-full sm:w-auto px-8 py-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-black text-base rounded-2xl shadow-lg shadow-emerald-600/20 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <RefreshCw size={20} className="animate-spin" />
                <span>GUARDANDO...</span>
              </>
            ) : (
              <>
                <Save size={20} />
                <span>GUARDAR Y EMITIR VENTA</span>
              </>
            )}
          </button>
        </div>

      </div>

      {/* ── MODAL DE IMPORTAR DESDE WHATSAPP ── */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 border border-slate-200 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Clipboard size={20} className="text-blue-600" />
                <h3 className="font-bold text-base text-slate-900">Importar Jugadas desde WhatsApp</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Pega la lista de jugadas tal cual la recibiste. Se reconocen formatos como:
              <br />
              <strong className="text-slate-700">45 10v</strong>, <strong className="text-slate-700">45-10</strong>, <strong className="text-slate-700">10x45</strong> o <strong className="text-slate-700">45=10</strong>.
            </p>

            <textarea
              rows={8}
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder={`Ejemplo:\n45 10v\n22-5\n10x33\n00 20v`}
              className="w-full p-3 rounded-xl border border-slate-300 font-mono text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            />

            {importError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-xl flex items-center gap-2">
                <AlertCircle size={16} />
                <span>{importError}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleImportPlays}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20"
              >
                Procesar e Importar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
