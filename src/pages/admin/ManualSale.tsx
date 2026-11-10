import { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase';
import { useStore } from '../../store/useStore';
import { formatLotteryTime } from '../../utils/lotteryRules';
import { getLocalISODate } from '../../utils/dateUtils';
import { getDecadeNumbers } from '../../utils/math';
import { 
  Trash2, Save, AlertCircle, Edit, Clipboard, X, CheckCircle, 
  FileText, Plus, Layers, User, Calendar, DollarSign, 
  Hash, Sparkles, RefreshCw, Eye, Zap
} from 'lucide-react';
import { SafeTextInput } from '../../components/shared/SafeTextInput';
import { parseImportText } from '../../utils/textImportParser';
import TicketDetailsModal from '../../components/TicketDetailsModal';

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
  const [showTicketModal, setShowTicketModal] = useState(false);

  // Import Text Modal State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  // Live preview of import
  const importPreview = importText.trim() ? parseImportText(importText) : null;

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

    const { plays: imported, clientName: detectedClient } = parseImportText(importText);

    if (imported.length === 0) {
      setImportError('No se encontraron jugadas válidas. Se soporta "2 31 2 29", "45 10v", "45-10", "10x45", "10 del 45", etc.');
      return;
    }

    if (detectedClient && !clientName) {
      setClientName(detectedClient);
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
      const now = new Date();
      const todayStr = getLocalISODate();
      let createdAtISO: string;
      if (saleDate === todayStr) {
        createdAtISO = now.toISOString();
      } else {
        const [y, m, d] = saleDate.split('-').map(Number);
        const targetDate = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
        createdAtISO = targetDate.toISOString();
      }

      // 1. Crear UN solo ticket cabecera con el total acumulado de todos los sorteos
      const { data: ticketData, error: ticketErr } = await supabase
        .from('tickets')
        .insert({
          vendor_id: vendorId,
          total_amount: totalDollarsAllLotteries,
          status: 'active',
          client_name: clientName.trim() || 'General',
          created_at: createdAtISO
        })
        .select('id')
        .single();

      if (ticketErr || !ticketData) {
        throw new Error(`Error creando ticket: ${ticketErr?.message}`);
      }

      const ticketId = ticketData.id;

      // 2. Insertar todas las jugadas agrupadas por sorteo asociadas a este único ticket
      const ticketNumbersToInsert: any[] = [];
      for (const lotteryId of selectedLotteryIds) {
        for (const p of plays) {
          ticketNumbersToInsert.push({
            ticket_id: ticketId,
            draw_id: lotteryId,
            number_played: p.number,
            amount: p.amount
          });
        }
      }

      const { error: numbersErr } = await supabase
        .from('ticket_numbers')
        .insert(ticketNumbersToInsert);

      if (numbersErr) {
        throw new Error(`Error guardando números del ticket: ${numbersErr.message}`);
      }

      setSavedTicketId(ticketId);
      setResult({
        success: true,
        message: `¡Venta emitida con éxito! Se generó el Ticket #${ticketId.slice(0, 8)} (${selectedLotteryIds.length} sorteos) por un monto total de $${totalDollarsAllLotteries.toFixed(2)}.`
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

  const vendors = store.users.filter(u => u.role === 'Vendedor' || u.role === 'vendor' || u.role === 'Admin');

  return (
    <div className="w-full min-h-screen px-3 sm:px-6 lg:px-8 py-5 bg-[#f1f5f9]">
      <div className="w-full max-w-[1680px] mx-auto space-y-5">

        {/* ── HEADER TERMINAL FINTECH DE ALTO NIVEL ── */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 rounded-2xl p-5 sm:p-6 text-white border border-slate-700/80 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="w-13 h-13 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/30 flex-shrink-0">
              <Zap size={28} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                  Terminal de Venta Manual
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  Consola Admin
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">
                  Multi-Sorteo Paralelo
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 mt-1">
                Emisión rápida de tickets centralizada con soporte para múltiples loterías, pegado desde WhatsApp y control de viles.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowImportModal(true)}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-black text-xs sm:text-sm bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 text-white shadow-lg shadow-emerald-900/40 transition-all cursor-pointer whitespace-nowrap"
            >
              <Clipboard size={18} />
              <span>Pegar Lista de WhatsApp</span>
            </button>
          </div>
        </div>

        {/* ── ALERTA DE RESULTADO CON ACCIONES DIRECTAS ── */}
        {result && (
          <div className={`p-4 sm:p-5 rounded-2xl font-bold text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md border ${result.success ? 'bg-emerald-50/90 text-emerald-950 border-emerald-300' : 'bg-red-50/90 text-red-950 border-red-300'}`}>
            <div className="flex items-start gap-3">
              {result.success ? <CheckCircle size={24} className="text-emerald-600 flex-shrink-0 mt-0.5" /> : <AlertCircle size={24} className="text-red-600 flex-shrink-0 mt-0.5" />}
              <div className="leading-relaxed">{result.message}</div>
            </div>

            {savedTicketId && (
              <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0">
                <button
                  type="button"
                  onClick={() => setShowTicketModal(true)}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                >
                  <Eye size={15} /> Ver / Imprimir Ticket
                </button>
                <button
                  type="button"
                  onClick={handleHideTicket}
                  className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors"
                >
                  ✕ Cerrar
                </button>
                <button
                  type="button"
                  onClick={handleDeleteTicket}
                  className="px-3.5 py-2 rounded-xl border border-red-300 bg-red-50 text-red-700 font-bold text-xs hover:bg-red-100 transition-colors flex items-center gap-1"
                >
                  <Trash2 size={13} /> Anular
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── LAYOUT RESPONSIVO DE DOS COLUMNAS PRINCIPALES ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">

          {/* COLUMNA IZQUIERDA: CONFIGURACIÓN Y CONSOLA DE APUNTES */}
          <div className="lg:col-span-7 space-y-5">

            {/* CARD 1: SELECTOR DE SORTEOS DESTINO */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <Layers size={20} className="text-indigo-600" />
                  <div>
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                      Sorteos a Jugar
                    </h3>
                    <span className="text-xs text-slate-500">
                      Selecciona las loterías donde se registrarán las jugadas en paralelo.
                    </span>
                  </div>
                  <span className={`ml-2 px-2.5 py-0.5 rounded-full text-xs font-black ${numSelectedLotteries > 0 ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                    {numSelectedLotteries} activo(s)
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAllLotteries}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors active:scale-95 cursor-pointer"
                  >
                    ✓ Todos
                  </button>
                  <button
                    type="button"
                    onClick={clearAllLotteries}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-700 font-bold text-xs rounded-xl transition-colors active:scale-95 cursor-pointer"
                  >
                    ✕ Ninguno
                  </button>
                </div>
              </div>

              {/* Grid de Chips de Sorteos */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-56 overflow-y-auto pr-1">
                {allLotteries.map(l => {
                  const isSelected = selectedLotteryIds.includes(l.id);
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => toggleLottery(l.id)}
                      className={`p-3 rounded-xl border text-left flex items-center justify-between gap-2 transition-all active:scale-95 cursor-pointer shadow-xs ${
                        isSelected 
                          ? 'bg-gradient-to-r from-indigo-600 to-blue-600 border-indigo-600 text-white shadow-md shadow-indigo-500/25 ring-2 ring-indigo-200' 
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-black text-xs truncate leading-tight">{l.name}</div>
                        <div className={`text-[10px] font-mono mt-0.5 ${isSelected ? 'text-indigo-100' : 'text-slate-400'}`}>
                          {formatLotteryTime(l.hour, l.minute)}
                        </div>
                      </div>
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-black ${isSelected ? 'bg-white text-indigo-700' : 'border border-slate-300 bg-slate-50'}`}>
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

            {/* CARD 2: DATOS DE LA VENTA */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Vendedor */}
                <div>
                  <label className="block text-[11px] font-black text-slate-600 mb-1.5 uppercase tracking-wide flex items-center gap-1">
                    <User size={14} className="text-indigo-600" /> Vendedor Responsable *
                  </label>
                  <select
                    value={vendorId}
                    onChange={e => setVendorId(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-slate-300 text-slate-800 bg-white font-bold text-sm outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 transition-colors"
                  >
                    <option value="">-- Seleccionar Vendedor --</option>
                    {vendors.map(v => (
                      <option key={v.id} value={v.username}>{v.username} ({v.name || 'Sin nombre'})</option>
                    ))}
                  </select>
                </div>

                {/* Cliente */}
                <div>
                  <label className="block text-[11px] font-black text-slate-600 mb-1.5 uppercase tracking-wide">
                    Cliente (Opcional)
                  </label>
                  <SafeTextInput
                    value={clientName}
                    onChange={setClientName}
                    placeholder="Nombre del cliente"
                    className="w-full h-11 px-3 rounded-xl border border-slate-300 text-slate-800 bg-white font-bold text-sm outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 transition-colors"
                  />
                </div>

                {/* Modalidad / Denominación con selector visual */}
                <div>
                  <label className="block text-[11px] font-black text-slate-600 mb-1.5 uppercase tracking-wide">
                    Modalidad de Pago por Vil
                  </label>
                  <div className="flex gap-2 h-11">
                    <button
                      type="button"
                      onClick={() => setSaleMode(0.20)}
                      className={`flex-1 rounded-xl font-black text-xs sm:text-sm border-2 transition-all flex flex-col items-center justify-center cursor-pointer ${
                        saleMode === 0.20 
                          ? 'bg-blue-50 border-blue-600 text-blue-700 shadow-sm' 
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span>$0.20 / vil</span>
                      <span className="text-[10px] font-bold opacity-80">Paga x11</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSaleMode(0.25)}
                      className={`flex-1 rounded-xl font-black text-xs sm:text-sm border-2 transition-all flex flex-col items-center justify-center cursor-pointer ${
                        saleMode === 0.25 
                          ? 'bg-purple-50 border-purple-600 text-purple-700 shadow-sm' 
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span>$0.25 / vil</span>
                      <span className="text-[10px] font-bold opacity-80">Paga x14</span>
                    </button>
                  </div>
                </div>

                {/* Fecha */}
                <div>
                  <label className="block text-[11px] font-black text-slate-600 mb-1.5 uppercase tracking-wide flex items-center gap-1">
                    <Calendar size={14} className="text-indigo-600" /> Fecha de Emisión
                  </label>
                  <input
                    type="date"
                    value={saleDate}
                    onChange={e => setSaleDate(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-slate-300 text-slate-800 bg-white font-bold text-sm outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 transition-colors"
                  />
                </div>

              </div>
            </div>

            {/* CARD 3: CONSOLA DE ENTRADA DE JUGADAS */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Sparkles size={18} className="text-amber-500" />
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                    {editIdx !== null ? `✏️ Editando Jugada #${editIdx + 1}` : 'Consola de Apuntes'}
                  </h3>
                </div>
                {editIdx !== null && (
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="text-xs text-slate-500 hover:text-slate-800 font-bold cursor-pointer"
                  >
                    Cancelar Edición
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                
                {/* Viles */}
                <div className="sm:col-span-4">
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[11px] font-black text-slate-600 uppercase">
                      Viles (Monto)
                    </label>
                    <div className="flex gap-1">
                      {[1, 5, 10, 20].map(v => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setCurrentAmount(v.toString())}
                          className="px-1.5 py-0.5 text-[10px] font-black rounded bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
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
                    className="w-full h-12 px-3 rounded-xl border-2 border-slate-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-slate-900 font-mono text-xl font-black outline-none transition-colors"
                  />
                </div>

                {/* Número */}
                <div className="sm:col-span-4">
                  <label className="block text-[11px] font-black text-slate-600 uppercase mb-1">
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
                    className="w-full h-12 px-3 rounded-xl border-2 border-slate-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 text-slate-900 font-mono text-2xl font-black text-center outline-none transition-colors"
                  />
                </div>

                {/* Botón Acción */}
                <div className="sm:col-span-4">
                  {editIdx !== null ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={confirmEdit}
                        className="flex-1 h-12 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl font-black text-sm shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        ✓ Guardar
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="h-12 px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-sm cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={addPlay}
                      className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl font-black text-sm shadow-md shadow-indigo-500/25 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Plus size={18} />
                      <span>AGREGAR JUGADA</span>
                    </button>
                  )}
                </div>

              </div>

              {/* Selector de Decenas Rápidas */}
              <div className="pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-black text-slate-500 uppercase tracking-wide">
                    Cargar Decena Completa (10 números con {currentAmount || 1} viles):
                  </span>
                </div>
                <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => addDecade(d)}
                      className="py-2 px-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 font-mono font-black text-xs text-slate-700 transition-colors text-center active:scale-95 cursor-pointer"
                    >
                      {d}0 - {d}9
                    </button>
                  ))}
                </div>
              </div>
            </div>

          </div>

          {/* COLUMNA DERECHA: TICKET SIMULATOR (STICKY) */}
          <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-5">

            {/* KPI MINI-METRIC CARDS (EN VIVO) */}
            <div className="grid grid-cols-2 gap-2.5">
              
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <div className="flex justify-between items-center text-slate-500">
                  <span className="text-[11px] font-black uppercase tracking-wider">Jugadas</span>
                  <Hash size={15} className="text-indigo-600" />
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl font-black font-mono text-slate-900">{plays.length}</span>
                  <span className="text-[11px] text-slate-400">líneas</span>
                </div>
              </div>

              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <div className="flex justify-between items-center text-slate-500">
                  <span className="text-[11px] font-black uppercase tracking-wider">Viles / Sorteo</span>
                  <Sparkles size={15} className="text-indigo-600" />
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl font-black font-mono text-indigo-700">{totalVilesPerLottery}</span>
                  <span className="text-[11px] text-slate-400">viles</span>
                </div>
              </div>

              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <div className="flex justify-between items-center text-slate-500">
                  <span className="text-[11px] font-black uppercase tracking-wider">Sorteos</span>
                  <Layers size={15} className={numSelectedLotteries > 0 ? "text-indigo-600" : "text-amber-500"} />
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className={`text-2xl font-black font-mono ${numSelectedLotteries > 0 ? 'text-indigo-700' : 'text-amber-600'}`}>{numSelectedLotteries}</span>
                  <span className="text-[11px] text-slate-400">sel.</span>
                </div>
              </div>

              <div className="bg-gradient-to-br from-emerald-50 to-teal-50 p-3.5 rounded-2xl border-2 border-emerald-400 shadow-sm flex flex-col justify-between">
                <div className="flex justify-between items-center text-emerald-800">
                  <span className="text-[11px] font-black uppercase tracking-wider">TOTAL A COBRAR</span>
                  <DollarSign size={16} className="text-emerald-700" />
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-700">${totalDollarsAllLotteries.toFixed(2)}</span>
                </div>
              </div>

            </div>

            {/* CARD ESTILO TICKET DIGITAL */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-md overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/70">
                <div className="flex items-center gap-2">
                  <FileText size={18} className="text-indigo-600" />
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                    Apuntes del Ticket ({plays.length})
                  </h3>
                </div>

                {plays.length > 0 && (
                  <button
                    type="button"
                    onClick={clearPlays}
                    className="text-xs font-bold text-red-600 hover:text-red-700 flex items-center gap-1 py-1 px-2.5 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                  >
                    <Trash2 size={13} /> Vaciar Todo
                  </button>
                )}
              </div>

              {plays.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <FileText size={36} className="mx-auto mb-2 opacity-30 text-slate-400" />
                  <p className="font-black text-xs text-slate-600">Ticket vacío</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Ingresa números a la izquierda o utiliza el botón para pegar de WhatsApp.
                  </p>
                </div>
              ) : (
                <div className="overflow-y-auto max-h-[380px] divide-y divide-slate-100">
                  {plays.map((p, idx) => {
                    const subtotal = p.amount * saleMode;
                    const totalPlay = subtotal * (numSelectedLotteries || 1);
                    return (
                      <div key={idx} className="p-2.5 sm:p-3 hover:bg-slate-50 transition-colors flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-[10px] text-slate-400 w-4 text-center font-mono">
                            {idx + 1}
                          </span>
                          <span className="px-2.5 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 font-black font-mono text-base rounded-lg">
                            {p.number}
                          </span>
                          <div>
                            <span className="font-black text-slate-800 font-mono text-sm">{p.amount} viles</span>
                            <div className="text-[10px] text-slate-400">
                              ${subtotal.toFixed(2)}/sorteo
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <span className="font-black text-slate-900 font-mono text-sm">
                              ${totalPlay.toFixed(2)}
                            </span>
                            <div className="text-[9px] text-slate-400 uppercase">
                              {numSelectedLotteries} sort.
                            </div>
                          </div>
                          <div className="flex items-center">
                            <button
                              type="button"
                              onClick={() => startEdit(idx)}
                              className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                              title="Editar"
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => removePlay(idx)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="Eliminar"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* BOTÓN FINAL DE GUARDAR / EMITIR TICKET */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-md space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-black uppercase tracking-wider">Total a Cobrar:</span>
                <span className="text-2xl sm:text-3xl font-black text-emerald-700 font-mono">
                  ${totalDollarsAllLotteries.toFixed(2)}
                </span>
              </div>

              <button
                type="button"
                onClick={handleSaveSale}
                disabled={saving || plays.length === 0 || numSelectedLotteries === 0}
                className="w-full py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-sm sm:text-base rounded-xl shadow-lg shadow-emerald-900/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {saving ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" />
                    <span>GUARDANDO VENTA...</span>
                  </>
                ) : (
                  <>
                    <Save size={18} />
                    <span>EMITIR Y GUARDAR TICKET</span>
                  </>
                )}
              </button>
            </div>

          </div>

        </div>

      </div>

      {/* ── MODAL DE IMPORTAR DESDE WHATSAPP ── */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 border border-slate-200 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Clipboard size={20} className="text-indigo-600" />
                <h3 className="font-black text-base text-slate-900">Importar Jugadas desde WhatsApp</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600">
              <div className="font-black text-slate-700 mb-1">📋 Formatos Soportados:</div>
              <div className="grid grid-cols-2 gap-1 font-mono">
                <div><span className="bg-white px-1 rounded border text-indigo-700">2 31 2 29 1 05</span></div>
                <div><span className="bg-white px-1 rounded border text-indigo-700">45-10</span> (núm-viles)</div>
                <div><span className="bg-white px-1 rounded border text-indigo-700">10x45</span> (viles x núm)</div>
                <div><span className="bg-white px-1 rounded border text-indigo-700">10 del 45</span></div>
              </div>
            </div>

            <textarea
              rows={6}
              value={importText}
              onChange={e => { setImportText(e.target.value); setImportError(null); }}
              placeholder={`Ejemplo:\n2 31 2 29 2 17 2 05 2 35\n1 01 1 02 1 03 1 04 1 06\n1 08 1 09 1 53 1 45 1 54`}
              className="w-full p-3 rounded-xl border border-slate-300 font-mono text-sm outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100"
            />

            {/* Live Preview */}
            {importPreview && importPreview.plays.length > 0 && (
              <div className="border border-green-200 bg-green-50 rounded-xl p-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-black text-green-700">✅ Vista previa — {importPreview.plays.length} jugadas detectadas</span>
                  {importPreview.clientName && (
                    <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">👤 {importPreview.clientName}</span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-1 max-h-32 overflow-y-auto">
                  {importPreview.plays.map((p, i) => (
                    <div key={i} className="bg-white border border-green-200 rounded px-2 py-1 text-xs font-mono text-center">
                      <span className="font-black text-slate-900">{p.number}</span>
                      <span className="text-green-600 ml-1 font-bold">{p.amount}v</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {importText.trim() && importPreview && importPreview.plays.length === 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold rounded-xl flex items-center gap-2">
                <AlertCircle size={16} />
                <span>No se detectaron jugadas. Revisa el formato del texto pegado.</span>
              </div>
            )}

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
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleImportPlays}
                disabled={!importPreview || importPreview.plays.length === 0}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-black shadow-md shadow-indigo-500/20 cursor-pointer"
              >
                {importPreview && importPreview.plays.length > 0 ? `Importar ${importPreview.plays.length} Jugadas` : 'Procesar e Importar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DE DETALLES / IMPRESIÓN DEL TICKET EMITIDO ── */}
      {showTicketModal && savedTicketId && (
        <TicketDetailsModal
          ticketId={savedTicketId}
          onClose={() => setShowTicketModal(false)}
        />
      )}
    </div>
  );
}