import { useState, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { getAvailableLotteries, formatLotteryTime, isGranjitaLottery, type LotteryConfig } from '../../utils/lotteryRules';
import { GRANJITA_ANIMALS, getAnimalByNumber, formatAnimalDisplay } from '../../utils/granjitaAnimals';
import { processSale } from '../../services/saleService';
import { Trash2, X, ArrowRight, MessageCircle, Printer, Plus } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { BluetoothSerial } from '@e-is/capacitor-bluetooth-serial';
import { useTheme } from '../../context/ThemeContext';

export default function GranjitaPOS() {
  const store = useStore();
  const { tc } = useTheme();

  const bgBase       = tc('bg-gray-900',  'bg-white');
  const bgPanel      = tc('bg-gray-800',  'bg-[#0d9488]');
  const bgCart       = tc('bg-[#0f172a]', 'bg-white');
  const bgNumpad     = tc('bg-[#111827]', 'bg-white');
  const borderPanel  = tc('border-gray-700', 'border-slate-200');
  const textPrimary  = tc('text-white',    'text-slate-900');
  const textPanelLabel = tc('text-gray-400', 'text-white font-black');
  const selectBg     = tc('bg-gray-900 border-gray-600 text-teal-400', 'bg-white border-2 border-slate-300 text-[#0d9488] font-bold');

  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);
  const [lotteries, setLotteries] = useState<LotteryConfig[]>([]);
  const [ticketDate, setTicketDate] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  });

  const [numpadMode, setNumpadMode] = useState<'num' | 'amount'>('num');
  const [numpadNumber, setNumpadNumber] = useState('');     // número de 2 dígitos para añadir
  const [currentAmount, setCurrentAmount] = useState('');   // viles (vacío por defecto)
  const [clientName, setClientName] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  // Modales
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [printedTicket, setPrintedTicket] = useState<string | null>(null);
  const [confirmationMessage, setConfirmationMessage] = useState<string | null>(null);

  useEffect(() => {
    const checkSize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', checkSize);
    store.fetchLotteries();
    const nonGranjita = store.selectedLotteries.filter(l => !isGranjitaLottery(l));
    if (nonGranjita.length > 0) {
      store.clearLotteries();
    }
    return () => window.removeEventListener('resize', checkSize);
  }, []);

  // Al cambiar fecha se recalculan sorteos disponibles
  useEffect(() => {
    const updateAvailable = () => {
      const available = getAvailableLotteries(ticketDate, store.lotteriesMaster)
        .filter(l => isGranjitaLottery(l));
      setLotteries(available);
      
      const validSelected = store.selectedLotteries.filter(sl => available.some(a => a.id === sl.id));
      if (validSelected.length !== store.selectedLotteries.length) {
        validSelected.forEach(l => {
          if (!available.some(a => a.id === l.id)) store.toggleLottery(l);
        });
      }
    };

    updateAvailable();
    const interval = setInterval(async () => {
      await store.fetchLotteries();
      updateAvailable();
    }, 10000);

    return () => clearInterval(interval);
  }, [store.lotteriesMaster, ticketDate]);

  const granjitaCart = store.cart.filter(item => item.isGranjita);
  const clearGranjitaCart = () => {
    granjitaCart.forEach(item => store.removeNumber(item.id));
  };

  const calculateTotal = () => {
    return granjitaCart.reduce((sum, item) => sum + (item.amount * (item.lotteries?.length || 1)), 0) * store.saleMode;
  };

  const handleAddAnimal = (numStr: string) => {
    if (store.selectedLotteries.length === 0) {
      alert('⚠️ Selecciona al menos un sorteo de La Granjita antes de agregar.');
      return;
    }
    const viles = parseFloat(currentAmount);
    if (isNaN(viles) || viles <= 0) {
      alert('⚠️ Ingresa una cantidad de viles válida.');
      return;
    }
    store.addNumber(numStr, viles, true);
    setNumpadNumber('');
    setNumpadMode('num');
    setCurrentAmount('');
  };

  // Numpad press handler
  const handleNumpadPress = (val: string) => {
    if (numpadMode === 'num') {
      if (val === 'DEL') {
        setNumpadNumber(prev => prev.slice(0, -1));
      } else if (numpadNumber.length < 2) {
        const next = numpadNumber + val;
        setNumpadNumber(next);
        if (next.length === 2) {
          setNumpadMode('amount');
        }
      }
    } else {
      if (val === 'DEL') {
        setCurrentAmount(prev => prev.length > 1 ? prev.slice(0, -1) : '');
      } else {
        setCurrentAmount(prev => (prev === '0' || prev === '') ? val : prev + val);
      }
    }
  };

  const generateTicketText = (saleId: string) => {
    const shortId = saleId.split('-')[0].toUpperCase();
    const vendorName = store.currentUser?.username || 'Caja';
    const header = `${store.ticketHeader}\n--------------------------------\nFecha: ${new Date().toLocaleString('es-ES')}\nTicket ID: ${shortId}\nCajero: ${vendorName.toUpperCase()}\n`;
    const clientStr = clientName ? `Cliente: ${clientName.toUpperCase()}\n` : '';

    let itemsStr = "\n";
    const grouped: Record<string, { lottery: LotteryConfig, items: typeof granjitaCart }> = {};

    granjitaCart.forEach(item => {
       const lotteriesList = item.lotteries || [];
       lotteriesList.forEach(lot => {
          if (!grouped[lot.id]) grouped[lot.id] = { lottery: lot, items: [] };
          grouped[lot.id].items.push(item);
       });
    });

    if (Object.keys(grouped).length === 0) {
       itemsStr += "LA GRANJITA\n----------------------\nANIMAL         /VLS/ VALOR\n";
       granjitaCart.forEach(item => {
         const numLabel = formatAnimalDisplay(item.number);
         itemsStr += `${numLabel.padEnd(15)} / ${item.amount.toString().padStart(2)} / $${(item.amount * store.saleMode).toFixed(2)}\n`;
       });
       itemsStr += "----------------------\n\n";
    } else {
       Object.values(grouped).forEach(group => {
          itemsStr += `${group.lottery.name.toUpperCase()} (${formatLotteryTime(group.lottery.hour, group.lottery.minute)})\n----------------------\nANIMAL         /VLS/ VALOR\n`;
          group.items.forEach(item => {
             const numLabel = formatAnimalDisplay(item.number);
             itemsStr += `${numLabel.padEnd(15)} / ${item.amount.toString().padStart(2)} / $${(item.amount * store.saleMode).toFixed(2)}\n`;
          });
          itemsStr += "----------------------\n\n";
       });
    }

    const total = `TOTAL A PAGAR: $${calculateTotal().toFixed(2)}\n\n----------------------\nID DE COBRO: ${shortId}\n----------------------\nREVISE SU TICKET\nSIN TICKET NO SE PAGA\nVALIDO POR 3 DIAS\n* GRACIAS POR PREFERIRNOS *\n\n\n\n\n\n`;
    return header + clientStr + itemsStr + total;
  };

  const generateGranjitaShareMessage = (
    _ticketId: string,
    cartItems: typeof granjitaCart,
    selectedLots: LotteryConfig[],
    _client: string
  ) => {
    const timesStr = selectedLots.map(l => formatLotteryTime(l.hour, l.minute)).join(', ');
    
    let msg = `🐓 *Jugada confirmada - La Granjita ${timesStr ? `(${timesStr})` : ''}* ✅\n\n`;

    cartItems.forEach(item => {
      const animal = getAnimalByNumber(item.number);
      const animalLabel = animal ? `${item.number} ${animal.name.toUpperCase()} ${animal.emoji}` : item.number;
      msg += `${animalLabel}\n`;
    });

    return msg.trim();
  };

  const handlePrintThermal = async (ticketText: string) => {
    try {
      if (Capacitor.isNativePlatform()) {
        const address = localStorage.getItem('bt_printer_mac') || localStorage.getItem('bt_printer_address');
        if (!address) {
          alert('Impresora Bluetooth no configurada. Configúrala en "Agregar Impresora".');
          return;
        }
        await BluetoothSerial.connect({ address });
        await BluetoothSerial.write({ address, value: ticketText });
        await BluetoothSerial.disconnect({ address });
      } else {
        const printSec = document.getElementById('print-section');
        if (printSec) {
          printSec.innerHTML = `<pre style="font-family: monospace; white-space: pre-wrap;">${ticketText}</pre>`;
          window.print();
        }
      }
    } catch (err: any) {
      console.error('Error imprimiendo ticket:', err);
      alert('Error de impresión: ' + (err.message || 'Verifica la impresora'));
    }
  };

  const processTransaction = async (action: 'share' | 'print' | 'save') => {
    if (granjitaCart.length === 0) { alert('⚠️ El carrito está vacío.'); return; }
    if (store.selectedLotteries.length === 0) { alert('⚠️ Selecciona al menos un sorteo de La Granjita.'); return; }

    setIsBusy(true);
    try {
      const vendorId = store.currentUser?.username || 'vendedor_desconocido';
      const total = calculateTotal();
      const res = await processSale(vendorId, clientName, total, granjitaCart, null, ticketDate);
      
      store.addTicket({
        id: res.ticketId,
        client_name: clientName,
        total_amount: total,
        status: 'active',
        created_at: new Date().toISOString(),
        cart: [...granjitaCart],
        lotteries: [...store.selectedLotteries]
      });

      const ticketText = generateTicketText(res.ticketId);
      const shareMsg = generateGranjitaShareMessage(res.ticketId, granjitaCart, store.selectedLotteries, clientName);

      setConfirmationMessage(shareMsg);
      setShowCheckoutModal(false);

      if (action === 'print' || action === 'save') {
        setPrintedTicket(ticketText);
        if (action === 'print' && Capacitor.isNativePlatform()) {
          handlePrintThermal(ticketText);
        }
      } else if (action === 'share') {
        if (navigator.share) {
          await navigator.share({
            title: 'Jugada Confirmada - La Granjita',
            text: shareMsg
          });
        } else {
          const url = `https://wa.me/?text=${encodeURIComponent(shareMsg)}`;
          window.open(url, '_blank');
        }
      }

      clearGranjitaCart();
      store.clearLotteries();
      setClientName('');
      setNumpadNumber('');
      setNumpadMode('num');
      setCurrentAmount('');
    } catch (err: any) {
      alert('Error al procesar venta: ' + (err.message || 'Intente nuevamente'));
    } finally {
      setIsBusy(false);
    }
  };

  const displayAnimal = numpadNumber ? getAnimalByNumber(numpadNumber.padStart(2, '0')) : null;

  // ── PHYSICAL KEYBOARD SUPPORT FOR PC & MOBILE ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        if (e.key === 'Enter') {
          (document.activeElement as HTMLElement)?.blur();
        } else {
          return;
        }
      }

      if (showCheckoutModal || printedTicket) {
        if (e.key === 'Enter' && showCheckoutModal && granjitaCart.length > 0 && !isBusy) {
          e.preventDefault();
          processTransaction('print');
        }
        return;
      }

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleNumpadPress(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        if (numpadMode === 'amount') {
          setCurrentAmount(prev => (prev.length > 1 ? prev.slice(0, -1) : ''));
          if (!currentAmount || currentAmount.length <= 1) {
            setNumpadMode('num');
          }
        } else {
          setNumpadNumber(prev => prev.slice(0, -1));
        }
      } else if (e.key === 'Enter' || e.key === '+' || e.key === 'Add') {
        e.preventDefault();
        const targetNum = numpadNumber ? numpadNumber.padStart(2, '0') : '';
        const viles = parseFloat(currentAmount);

        if (targetNum && !isNaN(viles) && viles > 0) {
          handleAddAnimal(targetNum);
        } else if (targetNum && (isNaN(viles) || viles <= 0)) {
          setNumpadMode('amount');
        } else if (!targetNum && granjitaCart.length > 0) {
          setShowCheckoutModal(true);
        } else if (!targetNum) {
          alert('⚠️ Selecciona o ingresa un número de animal primero.');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [numpadNumber, currentAmount, numpadMode, granjitaCart, showCheckoutModal, printedTicket, isBusy, store.selectedLotteries]);

  return (
    <div className={`flex w-full h-full ${bgBase} overflow-hidden ${textPrimary} ${isDesktop ? 'flex-row' : 'flex-col'}`}>

      {/* ─── COLUMNA PRINCIPAL ─── */}
      <div className="flex flex-col flex-1 h-full overflow-hidden no-scrollbar">

        {/* HEADER: SORTEOS + FECHA */}
        <div className={`flex-none ${bgPanel} px-3 py-2 border-b ${borderPanel} z-10 shadow-md`}>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xl">🐓</span>
            <label className={`${textPanelLabel} text-xs uppercase font-black tracking-wider flex-1`}>Sorteos La Granjita:</label>
            <input
              type="date"
              value={ticketDate}
              onChange={(e) => { setTicketDate(e.target.value); store.clearLotteries(); }}
              className={`${selectBg} text-xs font-bold rounded px-2 py-1.5 outline-none`}
            />
          </div>
          <div className="flex items-center gap-2 w-full">
            <select
              className={`${selectBg} text-sm font-bold rounded p-2 outline-none w-[150px] flex-none`}
              onChange={(e) => {
                if (e.target.value) {
                  const l = lotteries.find(l => l.id === e.target.value);
                  if (l) store.toggleLottery(l);
                  e.target.value = "";
                }
              }}
            >
              <option value="">+ AÑADIR</option>
              {lotteries.map(l => (
                <option key={l.id} value={l.id}>
                  {store.selectedLotteries.some(sl => sl.id === l.id) ? '✓ ' : ''}{l.name} - {formatLotteryTime(l.hour, l.minute)}
                </option>
              ))}
            </select>
            <div className="flex-1 flex gap-1 overflow-x-auto no-scrollbar pb-1">
              {store.selectedLotteries.length === 0 && <span className="text-xs text-gray-500 italic mt-2">Ninguno...</span>}
              {store.selectedLotteries.map(lotto => (
                <div key={lotto.id} className="bg-teal-700 text-white text-[11px] px-2 py-1 flex items-center gap-2 rounded font-bold whitespace-nowrap mt-1 shadow-sm">
                  <span>{lotto.name} {formatLotteryTime(lotto.hour, lotto.minute)}</span>
                  <button onClick={() => store.toggleLottery(lotto)} className="text-teal-200 active:text-white bg-teal-800/50 rounded-full p-[2px]">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── VILES × Nº ANIMAL ── */}
        <div className={`flex-none p-3 ${bgBase} border-b ${borderPanel} shadow-sm z-10 w-full`}>
          <div className="flex items-center gap-3">
            {/* VILES */}
            <div
              onClick={() => setNumpadMode('amount')}
              className={`flex-[1.5] p-3 rounded-lg flex justify-between items-center ${bgPanel} border-2 transition-colors cursor-pointer ${
                numpadMode === 'amount'
                  ? tc('border-teal-400 shadow-[0_0_8px_rgba(45,212,191,0.5)]', 'border-[#0d9488] shadow-[0_0_8px_rgba(13,148,136,0.4)]')
                  : tc('border-transparent', 'border-slate-300')
              }`}
            >
              <span className={`${textPanelLabel} text-xs font-mono`}>VILES</span>
              <span className={`text-3xl font-bold font-mono ${currentAmount ? tc('text-white', 'text-slate-900') : tc('text-gray-600', 'text-slate-400')}`}>
                {currentAmount || '0'}
              </span>
            </div>

            <div className={`${tc('text-gray-500', 'text-white')} font-bold text-xl`}>x</div>

            {/* Nº ANIMAL */}
            <div
              onClick={() => setNumpadMode('num')}
              className={`flex-1 p-3 rounded-lg flex justify-between items-center ${bgPanel} border-2 transition-colors cursor-pointer ${
                numpadMode === 'num'
                  ? tc('border-teal-400 shadow-[0_0_8px_rgba(45,212,191,0.5)]', 'border-[#0d9488] shadow-[0_0_8px_rgba(13,148,136,0.4)]')
                  : tc('border-transparent', 'border-slate-300')
              }`}
            >
              <span className={`${textPanelLabel} text-xs font-mono`}>Nº ANIMAL</span>
              <span className={`text-3xl font-bold font-mono ${numpadNumber ? tc('text-teal-400', 'text-[#0d9488]') : tc('text-gray-600', 'text-slate-400')}`}>
                {numpadNumber || '00'}{displayAnimal && <span className="text-2xl ml-1">{displayAnimal.emoji}</span>}
              </span>
            </div>
          </div>
          {displayAnimal && (
            <div className={`mt-1 text-center text-xs font-extrabold ${tc('text-teal-300', 'text-[#0d9488]')} tracking-wider uppercase`}>
              {numpadNumber} – {displayAnimal.name} {displayAnimal.emoji}
            </div>
          )}
        </div>

        {/* ── GRILLA DE ANIMALES ── */}
        <div className={`flex-1 overflow-y-auto ${tc('bg-[#0f172a]', 'bg-white')} p-2 no-scrollbar w-full`}>

          {/* Chips del carrito — barra horizontal */}
          {granjitaCart.length > 0 && (
            <div className={`flex gap-2 overflow-x-auto no-scrollbar pb-2 mb-2 border-b ${tc('border-teal-500/30', 'border-teal-200')}`}>
              {granjitaCart.map(item => {
                const animal = getAnimalByNumber(item.number);
                return (
                  <div key={item.id} className={`flex-none flex items-center gap-1.5 ${tc('bg-teal-950 text-white', 'bg-white text-[#1f2937]')} text-xs px-3 py-1.5 rounded-xl border-2 ${tc('border-teal-500', 'border-[#0d9488]')} font-extrabold whitespace-nowrap shadow`}>
                    <span className="text-base">{animal?.emoji}</span>
                    <span className={`font-mono ${tc('text-teal-300', 'text-[#0d9488]')}`}>#{item.number}</span>
                    <span className={`${tc('text-amber-300', 'text-[#d97706]')} font-mono font-black`}>{item.amount}v</span>
                    <button onClick={() => store.removeNumber(item.id)} className={`${tc('text-red-400 active:text-red-200 bg-red-950/60', 'text-red-500 active:text-red-600 bg-red-50')} p-0.5 ml-1 rounded-full`}>
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Grilla de animales */}
          <div className="grid grid-cols-6 sm:grid-cols-8 lg:grid-cols-10 gap-1">
            {GRANJITA_ANIMALS.map(animal => {
              const isInCart = granjitaCart.some(item => item.number === animal.number);
              const isSelected = numpadNumber.padStart(2, '0') === animal.number;
              return (
                <button
                  key={animal.id}
                  type="button"
                  onClick={() => {
                    setNumpadNumber(animal.number);
                    setNumpadMode('amount');
                  }}
                  className={`relative flex flex-col items-center p-1 rounded-lg border-2 transition-all duration-150 active:scale-95 ${
                    isSelected
                      ? 'bg-amber-100 border-amber-500 ring-2 ring-amber-400 scale-[1.04]'
                      : isInCart
                      ? 'bg-teal-50 border-teal-500'
                      : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="absolute top-0.5 left-0.5 bg-gray-900 text-white text-[8px] font-black font-mono px-0.5 rounded">{animal.number}</div>
                  <div className="text-xl my-0.5 select-none">{animal.emoji}</div>
                  <span className="text-[7px] font-extrabold text-gray-900 text-center leading-tight truncate w-full">{animal.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── TECLADO + CLIENTE + PROCESAR ── */}
        <div className={`flex-none ${bgNumpad} pb-safe border-t ${borderPanel} shadow-[0_-10px_30px_rgba(0,0,0,0.3)] w-full relative z-20`}>
          <div className="w-full flex flex-col gap-3 px-3 pt-2 pb-3">

            {/* Nombre del cliente */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Nombre del cliente (Opcional)"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className={`flex-1 ${tc('bg-[#1e293b] border-gray-700 text-white focus:border-teal-500 placeholder-gray-600', 'bg-white border-slate-300 text-slate-900 focus:border-[#0d9488] placeholder-slate-400')} border rounded p-2 text-sm outline-none transition-colors`}
              />
              {granjitaCart.length > 0 && (
                <button
                  type="button"
                  onClick={clearGranjitaCart}
                  className="bg-red-600 hover:bg-red-500 active:bg-red-700 text-white rounded px-3 py-2 text-xs font-bold flex items-center gap-1 shadow-sm"
                >
                  <Trash2 size={15} /> Vaciar
                </button>
              )}
            </div>

            {/* Numpad + botón + */}
            <div className="flex gap-2 w-full">
              <div className="flex-[3] grid grid-cols-3 gap-2">
                {[1,2,3,4,5,6,7,8,9].map(num => (
                  <button
                    key={num}
                    onClick={() => handleNumpadPress(num.toString())}
                    className={`${tc('bg-[#1f2937] active:opacity-70 text-white', 'bg-white active:bg-slate-100 text-slate-900 border-2 border-slate-300 shadow-[0_3px_0_#cbd5e1] active:shadow-none active:translate-y-[3px]')} rounded-lg h-[55px] flex items-center justify-center text-2xl font-bold font-mono shadow transition-transform`}
                  >
                    {num}
                  </button>
                ))}
                <button
                  onClick={() => { handleNumpadPress('0'); handleNumpadPress('0'); }}
                  className={`${tc('bg-[#1f2937] active:opacity-70 text-teal-400', 'bg-white active:bg-slate-100 text-[#0d9488] border-2 border-slate-300 shadow-[0_3px_0_#cbd5e1] active:shadow-none active:translate-y-[3px]')} rounded-lg h-[55px] flex items-center justify-center text-2xl font-bold font-mono shadow transition-transform`}
                >
                  00
                </button>
                <button
                  onClick={() => handleNumpadPress('0')}
                  className={`${tc('bg-[#1f2937] active:opacity-70 text-white', 'bg-white active:bg-slate-100 text-slate-900 border-2 border-slate-300 shadow-[0_3px_0_#cbd5e1] active:shadow-none active:translate-y-[3px]')} rounded-lg h-[55px] flex items-center justify-center text-2xl font-bold font-mono shadow transition-transform`}
                >
                  0
                </button>
                <button
                  onClick={() => {
                    if (numpadMode === 'num') setNumpadNumber(prev => prev.slice(0, -1));
                    else setCurrentAmount(prev => prev.length > 1 ? prev.slice(0, -1) : '');
                  }}
                  className={`${tc('bg-red-900/20 text-red-500 active:bg-red-900/50', 'bg-white text-red-600 border-2 border-slate-300 shadow-[0_3px_0_#cbd5e1] active:shadow-none active:translate-y-[3px]')} rounded-lg h-[55px] flex items-center justify-center shadow transition-transform`}
                >
                  <Trash2 size={24} />
                </button>
              </div>

              <div className="flex-[1] flex flex-col">
                <button
                  type="button"
                  onClick={() => {
                    const targetNum = numpadNumber ? numpadNumber.padStart(2, '0') : '';
                    if (targetNum) handleAddAnimal(targetNum);
                    else alert('⚠️ Selecciona o ingresa un número de animal primero.');
                  }}
                  disabled={!numpadNumber}
                  className={`w-full h-full min-h-[184px] ${tc('bg-teal-500 hover:bg-teal-400 active:bg-teal-600 border-b-4 border-teal-700', 'bg-[#0d9488] hover:bg-[#0f766e] active:bg-[#115e59] border-b-4 border-[#0f766e]')} disabled:opacity-40 text-white font-black rounded-xl shadow-lg transition-all active:scale-95 flex flex-col items-center justify-center gap-1 active:border-b-0`}
                >
                  <Plus size={36} className="animate-pulse" />
                  <span className="text-[10px] uppercase font-mono tracking-wider font-extrabold">AÑADIR</span>
                </button>
              </div>
            </div>

            {/* PROCESAR */}
            <button
              type="button"
              onClick={() => setShowCheckoutModal(true)}
              disabled={isBusy || granjitaCart.length === 0}
              className={`w-full h-[60px] rounded-lg font-black text-base tracking-widest uppercase flex items-center justify-center gap-3 transition-all shadow-lg border-b-4 active:translate-y-1 active:border-b-0 ${
                granjitaCart.length > 0
                  ? `${tc('bg-[#0ea5e9] border-[#0369a1] active:bg-[#0284c7]', 'bg-[#0d9488] border-[#0f766e] active:bg-[#0f766e]')} text-white`
                  : `${tc('bg-gray-800 text-gray-600 border-gray-700', 'bg-[#e5e7eb] text-[#9ca3af] border-[#d1d5db]')} opacity-60`
              }`}
            >
              PROCESAR
            </button>
          </div>
        </div>

      </div>

      {/* ─── SECCIÓN DERECHA: CARRITO DESKTOP ─── */}
      <div className={`${isDesktop ? 'flex' : 'hidden'} flex-col w-[320px] xl:w-[360px] h-full ${bgCart} border-l ${borderPanel} flex-none`}>
        <div className={`flex-none ${bgPanel} px-4 py-3 border-b ${borderPanel} flex justify-between items-center shadow-md`}>
          <span className={`${textPanelLabel} font-black text-sm uppercase tracking-wider`}>🛒 Carrito La Granjita</span>
          {granjitaCart.length > 0 && (
            <button onClick={clearGranjitaCart} className="text-red-300 hover:text-white text-xs font-bold bg-red-900/40 px-2 py-1 rounded">
              Vaciar
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2 no-scrollbar">
          {granjitaCart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 opacity-60">
              <span className="text-4xl mb-2">🐓</span>
              <p className="font-bold text-xs uppercase">Sin apuestas</p>
            </div>
          ) : (
            granjitaCart.map(item => {
              const animal = getAnimalByNumber(item.number);
              return (
                <div key={item.id} className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-gray-200 shadow-sm text-gray-900">
                  <div className="flex items-center gap-2">
                    <div className={`${tc('bg-gray-900 text-white', 'bg-[#f3f4f6] text-[#1f2937] border border-[#d1d5db]')} font-mono font-bold text-xs px-2 py-1 rounded`}>{item.number}</div>
                    <div className="flex flex-col">
                      <span className="font-extrabold text-sm">{animal ? `${animal.emoji} ${animal.name}` : item.number}</span>
                      <span className="text-[10px] text-gray-500 font-bold">{item.amount} viles · ${(item.amount * store.saleMode).toFixed(2)}</span>
                    </div>
                  </div>
                  <button onClick={() => store.removeNumber(item.id)} className="text-red-500 p-1.5 rounded-lg hover:bg-red-50">
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className={`flex-none p-4 ${bgPanel} border-t ${borderPanel}`}>
          <div className="flex justify-between items-center mb-3">
            <span className={`${textPanelLabel} font-black text-xs uppercase tracking-wider`}>TOTAL VENTA</span>
            <span className="text-2xl font-black text-white font-mono">${calculateTotal().toFixed(2)}</span>
          </div>
          <button
            onClick={() => setShowCheckoutModal(true)}
            disabled={isBusy || granjitaCart.length === 0}
            className={`w-full py-3.5 ${tc('bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600', 'bg-[#0d9488] hover:bg-[#0f766e] active:bg-[#115e59]')} disabled:opacity-40 text-white font-black rounded-xl text-base tracking-wide shadow-lg uppercase flex items-center justify-center gap-2`}
          >
            <span>PROCESAR TICKET (${calculateTotal().toFixed(2)})</span>
            <ArrowRight size={20} />
          </button>
        </div>
      </div>

      {/* ─── MODAL DE CONFIRMACIÓN DE VENTA ─── */}
      {showCheckoutModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
          <div className={`${tc('bg-gray-800 border-gray-700 text-white', 'bg-white border-[#e5e7eb] text-[#1f2937]')} border rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col`} style={{ maxHeight: '90vh' }}>

            <div className={`p-4 ${tc('bg-gray-900 border-gray-700', 'bg-[#f9fafb] border-[#e5e7eb]')} border-b flex justify-between items-center`}>
              <h3 className={`text-lg font-bold ${tc('text-white', 'text-[#1f2937]')} flex items-center gap-2`}>
                <span>🐓</span> Confirmar Transacción
              </h3>
              <button onClick={() => setShowCheckoutModal(false)} className={`${tc('text-gray-400 hover:text-white', 'text-[#9ca3af] hover:text-[#1f2937]')}`}>
                <X size={20} />
              </button>
            </div>

            <div className="p-4 flex flex-col gap-3 overflow-y-auto no-scrollbar">
              
              {/* Client name */}
              <input
                type="text"
                placeholder="Nombre del cliente (Opcional)"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className={`${tc('bg-gray-900 border-gray-700 text-white focus:border-teal-500', 'bg-white border-[#d1d5db] text-[#1f2937] focus:border-[#0d9488]')} border rounded-xl p-3 text-sm outline-none`}
              />

              {/* Lista de animales */}
              <div className={`${tc('bg-gray-900 border-gray-700', 'bg-[#f9fafb] border-[#e5e7eb]')} rounded-xl border overflow-hidden`}>
                <div className={`flex justify-between items-center px-3 py-2 border-b ${tc('border-gray-700', 'border-[#e5e7eb]')}`}>
                  <span className={`text-xs font-bold ${tc('text-gray-400', 'text-[#6b7280]')} uppercase tracking-wider`}>Ítems en carrito: {granjitaCart.length} apunte(s)</span>
                  <span className={`text-xs ${tc('text-gray-500', 'text-[#9ca3af]')}`}>Monto Unit.</span>
                </div>
                <div className="overflow-y-auto no-scrollbar" style={{ maxHeight: '160px' }}>
                  {granjitaCart.map(item => {
                    const animal = getAnimalByNumber(item.number);
                    return (
                      <div key={item.id} className={`flex justify-between items-center px-3 py-2 border-b ${tc('border-gray-800', 'border-[#e5e7eb]')} last:border-0`}>
                        <span className={`text-sm font-bold ${tc('text-white', 'text-[#1f2937]')}`}>
                          {item.number} {animal ? `${animal.emoji} ${animal.name.toUpperCase()}` : ''}
                        </span>
                        <span className={`${tc('text-teal-400', 'text-[#0d9488]')} font-mono text-sm font-bold`}>${(item.amount * store.saleMode).toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Total */}
              <div className={`flex justify-between items-center ${tc('bg-gray-900 border-gray-700', 'bg-[#f9fafb] border-[#e5e7eb]')} p-3.5 rounded-xl border`}>
                <span className={`${tc('text-gray-400', 'text-[#6b7280]')} font-bold text-xs uppercase`}>TOTAL VENTA:</span>
                <span className={`text-2xl font-black ${tc('text-teal-400', 'text-[#0d9488]')} font-mono`}>${calculateTotal().toFixed(2)}</span>
              </div>

              {isBusy ? (
                <div className="flex flex-col items-center justify-center py-6">
                  <div className={`w-8 h-8 border-4 ${tc('border-teal-500', 'border-[#0d9488]')} border-t-transparent rounded-full animate-spin`}></div>
                  <p className={`${tc('text-teal-400', 'text-[#0d9488]')} font-bold mt-2 animate-pulse`}>Registrando en base de datos...</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5 mt-1">
                  <button 
                    onClick={() => processTransaction('share')}
                    className="w-full bg-[#10b981] active:bg-[#059669] text-white py-3.5 rounded-xl font-bold text-base flex justify-center items-center gap-2 shadow-lg"
                  >
                    <MessageCircle size={20} /> GUARDAR Y COMPARTIR
                  </button>
                  <button 
                    onClick={() => processTransaction('print')}
                    className="w-full bg-[#3b82f6] active:bg-[#2563eb] text-white py-3.5 rounded-xl font-bold text-base flex justify-center items-center gap-2 shadow-lg"
                  >
                    <Printer size={20} /> GUARDAR E IMPRIMIR
                  </button>
                  <button 
                    onClick={() => processTransaction('save')}
                    className="w-full bg-[#475569] active:bg-[#334155] text-white py-3 rounded-xl font-bold text-sm flex justify-center items-center gap-2"
                  >
                    SOLO GUARDAR
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL TICKET IMPRESO FINALIZADO ─── */}
      {printedTicket && (
        <div className="fixed inset-0 bg-black/90 z-[110] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white text-black w-full max-w-sm rounded-xl flex flex-col shadow-2xl overflow-hidden animate-slide-up max-h-[85vh]">
            <div className="p-3 bg-gray-100 border-b flex justify-between items-center">
              <span className="font-bold text-green-600 text-sm flex items-center gap-1">Venta Exitosa ✅</span>
            </div>
            <div className="p-6 flex-1 overflow-y-auto no-scrollbar shadow-inner bg-yellow-50/30">
               <pre className="font-mono text-lg w-full break-normal whitespace-pre-wrap leading-relaxed text-center font-bold text-gray-800">
                 {printedTicket}
               </pre>
            </div>
            <div className="p-4 bg-gray-800 flex flex-col gap-3">
               <button 
                  onClick={() => handlePrintThermal(printedTicket)}
                  className="w-full bg-blue-600 active:bg-blue-700 text-white py-3.5 rounded-lg flex gap-2 justify-center items-center font-bold text-sm shadow"
               >
                  <Printer size={20} /> IMPRIMIR TICKET
               </button>
               
               {confirmationMessage && (
                  <button 
                     onClick={() => {
                        const url = `https://wa.me/?text=${encodeURIComponent(confirmationMessage)}`;
                        window.open(url, '_blank');
                     }}
                     className="w-full bg-green-600 active:bg-green-700 text-white py-3 rounded-lg flex gap-2 justify-center items-center font-bold text-sm shadow"
                  >
                     <MessageCircle size={18} /> ENVIAR POR WHATSAPP
                  </button>
                )}

                <button 
                  onClick={() => { setPrintedTicket(null); setConfirmationMessage(null); }} 
                  className="w-full bg-teal-500 active:bg-teal-400 text-white py-3 rounded-lg flex gap-2 justify-center items-center font-bold text-sm shadow"
                >
                  <Plus size={18} /> NUEVA VENTA
                </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
