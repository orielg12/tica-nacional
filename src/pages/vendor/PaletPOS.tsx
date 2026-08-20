import { useState, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { getAvailableLotteries, formatLotteryTime, type LotteryConfig } from '../../utils/lotteryRules';
import { processSale } from '../../services/saleService';
import { Trash2, Plus, X, Printer as PrinterIcon, MessageCircle } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { BluetoothSerial } from '@e-is/capacitor-bluetooth-serial';

export default function PaletPOS() {
  const store = useStore();
  
  // Guard access if not allowed
  if (store.currentUser && store.currentUser.role === 'Vendedor' && store.currentUser.allowPalet === false) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-950 text-white p-6 text-center">
        <div className="w-20 h-20 bg-red-950/40 rounded-full flex items-center justify-center border border-red-800/40 shadow-inner mb-6">
          <span className="text-3xl text-red-500 font-bold">!</span>
        </div>
        <h2 className="text-2xl font-black text-red-400 mb-2 uppercase tracking-wide">Acceso Denegado</h2>
        <p className="text-slate-400 max-w-sm text-sm">
          No tienes permisos autorizados para vender <strong>Palets</strong>. Contacta al Administrador del sistema.
        </p>
      </div>
    );
  }

  const [lotteries, setLotteries] = useState<LotteryConfig[]>([]);
  const [currentNumber, setCurrentNumber] = useState('');
  const [currentAmount, setCurrentAmount] = useState(1.00); // default to $1.00
  const [clientName, setClientName] = useState('');
  const [ticketDate, setTicketDate] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  });
  
  // Modal & Loading State
  const [isBusy, setIsBusy] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [printedTicket, setPrintedTicket] = useState<string | null>(null);
  const [confirmationMessage, setConfirmationMessage] = useState<string | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    store.fetchLotteries();
  }, []);



  useEffect(() => {
    const updateAvailable = () => {
      setLotteries(getAvailableLotteries(ticketDate, store.lotteriesMaster));
    };

    updateAvailable();
    const interval = setInterval(async () => {
      await store.fetchLotteries();
      updateAvailable();
    }, 10000);

    const handleFocus = () => {
      store.fetchLotteries();
      store.fetchUsers();
      updateAvailable();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [store.lotteriesMaster, ticketDate]);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      setIsDesktop(false);
      return;
    }
    const checkSize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    checkSize();
    window.addEventListener('resize', checkSize);
    return () => window.removeEventListener('resize', checkSize);
  }, []);

  const handleNumpadPress = (val: string) => {
    if (currentNumber.length < 4) {
      setCurrentNumber(currentNumber + val);
    }
  };

  const handleBackspace = () => {
    setCurrentNumber(currentNumber.slice(0, -1));
  };

  const handleAdd = () => {
    if (store.selectedLotteries.length === 0) {
      alert('⚠️ Selecciona al menos un SORTEO.');
      return;
    }
    if (currentNumber.length !== 4) {
      alert('⚠️ Ingresa un Palet de 4 dígitos.');
      return;
    }
    if (currentAmount <= 0) {
      alert('⚠️ Selecciona un monto válido.');
      return;
    }

    const num1 = currentNumber.substring(0, 2);
    const num2 = currentNumber.substring(2, 4);

    store.addPaletPlay(num1, num2, currentAmount);
    setCurrentNumber('');
  };

  const handleRandom = () => {
    const n1 = Math.floor(Math.random() * 100).toString().padStart(2, '0');
    const n2 = Math.floor(Math.random() * 100).toString().padStart(2, '0');
    setCurrentNumber(n1 + n2);
  };

  const paletCart = store.cart.filter(item => item.isPalet);
  const clearPaletCart = () => {
    paletCart.forEach(item => store.removeNumber(item.id));
  };

  const calculateTotal = () => {
    return paletCart.reduce((sum, item) => sum + (item.amount * (item.lotteries?.length || 1)), 0);
  };

  const generateTicketText = (saleId: string) => {
    const shortId = saleId.split('-')[0].toUpperCase();
    const vendorName = store.currentUser?.username || 'Caja';
    const header = `${store.ticketHeader}\n--------------------------------\nFecha: ${new Date().toLocaleString('es-ES')}\nTicket ID: ${shortId}\nCajero: ${vendorName.toUpperCase()}\n\n`;
    
    let itemsStr = "";
    const grouped: Record<string, { lottery: LotteryConfig, items: typeof paletCart }> = {};
    
    paletCart.forEach(item => {
       const lotteries = item.lotteries || [];
       lotteries.forEach(lot => {
          if (!grouped[lot.id]) {
             grouped[lot.id] = { lottery: lot, items: [] };
          }
          grouped[lot.id].items.push(item);
       });
    });

    if (Object.keys(grouped).length === 0) {
       itemsStr += "GENERAL\n----------------------\nNUM / VALOR\n";
       paletCart.forEach(item => {
         itemsStr += `PALET ${item.number} / $${item.amount.toFixed(2)}\n`;
       });
       itemsStr += "----------------------\n\n";
    } else {
       Object.values(grouped).forEach(group => {
          itemsStr += `${group.lottery.name.toUpperCase()} (${formatLotteryTime(group.lottery.hour, group.lottery.minute)})\n----------------------\nNUM / VALOR\n`;
          group.items.forEach(item => {
             itemsStr += `PALET ${item.number} / $${item.amount.toFixed(2)}\n`;
          });
          itemsStr += "----------------------\n\n";
       });
    }

    const total = `TOTAL A PAGAR: $${calculateTotal().toFixed(2)}\n\n----------------------\nID DE COBRO: ${shortId}\n----------------------\nREVISE SU TICKET\nSIN TICKET NO SE PAGA\nVALIDO POR 3 DIAS\n* GRACIAS POR PREFERIRNOS *\n\n\n\n\n\n`;
    return header + itemsStr + total;
  };

  const generatePaletShareMessage = (_ticketId: string, cart: typeof paletCart, _client: string) => {
    const uniqueLotteries: LotteryConfig[] = [];
    const seenIds = new Set<string>();
    cart.forEach(item => {
      (item.lotteries || []).forEach(lot => {
        if (!seenIds.has(lot.id)) {
          seenIds.add(lot.id);
          uniqueLotteries.push(lot);
        }
      });
    });

    const getFlag = (name: string) => {
      const lower = name.toLowerCase().trim();
      const exactMap: Record<string, string> = {
        'nica': '🇳🇮',
        'honduras': '🇭🇳',
        'tica': '🇨🇷',
        'monazo': '🇨🇷',
        'primera': '🇩🇴',
        'nacional': '🇵🇦',
        'anguilla': '🇦🇮',
        'new york': '🇺🇸',
        'florida': '🇺🇸',
        'la granjita': '🐓',
        'granjita': '🐓',
      };
      return exactMap[lower] ?? '🎲';
    };

    let headerFlags = uniqueLotteries.map(l => getFlag(l.name)).filter((v, i, a) => a.indexOf(v) === i).join(' ');
    if (!headerFlags) headerFlags = '🎯';

    const msg = `${headerFlags} *Jugada confirmada - Palet* ✅`;
    return msg;
  };

  const processTransaction = async (action: 'print' | 'share' | 'save') => {
    if (paletCart.length === 0) return;
    setIsBusy(true);

    try {
      const currentVendor = store.currentUser?.username || 'vendedor_desconocido'; 
      const total = calculateTotal();
      
      const createdTicket = await processSale(currentVendor, clientName, total, paletCart, null);
      const ticketString = generateTicketText(createdTicket.ticketId);
      const shareMsg = generatePaletShareMessage(createdTicket.ticketId, paletCart, clientName);

      store.addTicket({
         id: createdTicket.ticketId,
         client_name: clientName,
         total_amount: total,
         status: 'active',
         created_at: new Date().toISOString(),
         cart: [...paletCart],
         lotteries: [...store.selectedLotteries]
      });

      setConfirmationMessage(shareMsg);
      clearPaletCart();
      store.clearLotteries();
      setCurrentNumber('');
      setClientName('');
      setShowCheckoutModal(false);

      if (action === 'print' || action === 'save') {
        setPrintedTicket(ticketString);
      } else if (action === 'share') {
        if (navigator.share) {
           await navigator.share({
             title: 'Ticket de Lotería - Palets',
             text: shareMsg
           });
        } else {
           const url = `https://wa.me/?text=${encodeURIComponent(shareMsg)}`;
           window.open(url, '_blank');
        }
      }
    } catch (err: any) {
      console.error(err);
      alert("ERROR AL PROCESAR: " + (err.message || err));
    } finally {
      setIsBusy(false);
    }
  };

  const handlePrintThermal = async () => {
    if (!printedTicket) return;
    if (Capacitor.isNativePlatform()) {
        try {
            const targetMac = localStorage.getItem('bt_printer_mac');
            if (!targetMac) {
                alert("¡Impresora no configurada! En el MENÚ LATERAL entra a 'Vincular Impresora', busca y SELECCIONA tu impresora primero.");
                return;
            }
            
            await BluetoothSerial.connect({ address: targetMac });
            await BluetoothSerial.write({ address: targetMac, value: printedTicket });
            setTimeout(async () => {
               await BluetoothSerial.disconnect({ address: targetMac });
            }, 1000);
        } catch (e: any) {
            alert("Error Bluetooth Nativo: " + (e.message || JSON.stringify(e)));
            window.location.href = 'intent:' + encodeURIComponent(printedTicket) + '#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;';
        }
    } else {
        window.location.href = 'intent:' + encodeURIComponent(printedTicket) + '#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;';
    }
  };

  const renderCartList = () => {
    if (paletCart.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-gray-500 opacity-40 py-12">
          <p className="font-bold text-xs uppercase tracking-widest">SIN APUESTAS EN CARRITO</p>
        </div>
      );
    }
    return (
      <div className="space-y-2 pb-6">
        {paletCart.map((item, index) => (
          <div 
            key={item.id} 
            className="flex justify-between items-center bg-[#1e293b]/70 rounded-xl p-3 shadow text-white border-l-4 border-amber-500"
          >
            <div className="flex items-center gap-3">
              <span className="text-gray-500 text-xs font-mono">#{index + 1}</span>
              <div className="bg-amber-950/40 border border-amber-800/40 rounded-xl px-3 h-11 flex items-center justify-center shadow-inner">
                <span className="text-base font-bold font-mono tracking-tighter text-amber-400">
                  🎯 PALET {item.number}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right flex flex-col">
                <span className="text-base font-bold font-mono text-white">
                  ${item.amount.toFixed(2)}
                </span>
                <span className="text-xs text-teal-400 font-mono font-semibold">
                  ${(item.amount * (item.lotteries?.length || 1)).toFixed(2)}
                </span>
                {item.lotteries && item.lotteries.length > 0 && (
                  <span className="text-[9px] text-gray-400 font-bold uppercase mt-0.5 tracking-wider leading-none">
                    [{item.lotteries.map(l => l.name.substring(0, 4)).join(', ')}]
                  </span>
                )}
              </div>
              <button onClick={() => store.removeNumber(item.id)} className="bg-red-950/40 text-red-400 p-2 rounded-xl">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const denominations = [0.25, 0.50, 0.75, 1.00, 1.25, 1.50, 1.75, 2.00];

  return (
    <div className={`flex w-full h-full bg-gray-900 overflow-hidden text-white ${isDesktop ? 'flex-row' : 'flex-col'}`}>
      
      {/* COLUMNA IZQUIERDA: Entradas, Sorteos y Teclado */}
      <div className={`flex flex-col bg-gray-900 no-scrollbar ${isDesktop ? 'flex-1 h-full overflow-y-auto' : 'flex-1 h-full'}`}>
        
        {/* SELECTOR DE SORTEO COMPACTO */}
        <div className="flex-none bg-gray-800 px-3 py-2 lg:px-6 lg:py-4 border-b border-gray-700 z-10 w-full overflow-hidden shadow-md">
          <div className="flex justify-between items-center mb-1 lg:mb-3">
             <label className="text-gray-400 text-[10px] lg:text-sm uppercase font-bold tracking-wider">Sorteos Seleccionados:</label>
             <input 
               type="date" 
               value={ticketDate} 
               onChange={(e) => setTicketDate(e.target.value)}
               className="bg-gray-900 border border-gray-600 text-teal-400 text-xs lg:text-base lg:px-3 lg:py-1.5 font-bold rounded px-1 py-0.5 outline-none"
             />
          </div>
          <div className="flex items-center gap-2 w-full">
             <select 
               className="bg-gray-900 border border-gray-600 text-teal-400 text-sm lg:text-lg font-bold font-mono tracking-wide rounded p-2 lg:p-3 outline-none w-[140px] lg:w-[200px]"
               onChange={(e) => {
                  if (e.target.value) {
                     const selectedLotto = lotteries.find(l => l.id === e.target.value);
                     if (selectedLotto) store.toggleLottery(selectedLotto);
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
             
             <div className="flex-1 flex gap-1 lg:gap-2 overflow-x-auto no-scrollbar pb-1">
               {store.selectedLotteries.length === 0 && <span className="text-xs lg:text-base text-gray-500 italic mt-2">Ninguno...</span>}
               {store.selectedLotteries.map(lotto => (
                   <div key={lotto.id} className="bg-teal-700 text-white text-[11px] lg:text-sm px-2 py-1 lg:px-3 lg:py-2 flex items-center gap-2 rounded font-bold whitespace-nowrap mt-1 shadow-sm">
                     <span>{lotto.name} {formatLotteryTime(lotto.hour, lotto.minute)}</span>
                     <button onClick={() => store.toggleLottery(lotto)} className="text-teal-200 bg-teal-800/50 rounded-full p-[2px]">
                       <X size={14} />
                     </button>
                   </div>
               ))}
             </div>
          </div>
        </div>

        {/* INPUT DISPLAY DE PALET Y PREMIO POTENCIAL */}
        <div className="flex-none p-4 bg-gray-950 border-b border-gray-800 flex flex-col gap-4">
          <div className="flex justify-between items-center gap-4">
            <div className="flex-1 bg-[#1e293b] p-3 rounded-lg border border-gray-800 flex justify-between items-center">
              <span className="text-slate-400 font-bold text-xs uppercase">PALET</span>
              <span className="text-3xl lg:text-5xl font-mono font-bold text-amber-400">
                {currentNumber.padEnd(4, '-')}
              </span>
            </div>
            
            <div className="flex-1 bg-[#1e293b] p-3 rounded-lg border border-gray-800 flex justify-between items-center">
              <span className="text-slate-400 font-bold text-xs uppercase">APUESTA</span>
              <span className="text-3xl lg:text-5xl font-mono font-bold text-teal-400">
                ${currentAmount.toFixed(2)}
              </span>
            </div>
          </div>

          {/* PREMIO POTENCIAL EN TIEMPO REAL */}
          <div className="bg-amber-950/20 border border-amber-900/30 rounded-xl p-3 flex flex-col gap-1 text-xs">
            <span className="text-amber-500 font-black uppercase text-[10px] tracking-wider mb-1 block">🏆 PREMIO POTENCIAL</span>
            <div className="flex justify-between text-slate-300">
              <span>🥇🥈 1er y 2do Lugar (x500):</span>
              <strong className="text-amber-400 font-mono">${(currentAmount * 500).toFixed(2)}</strong>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>🥈🥉 2do y 3er Lugar (x100):</span>
              <strong className="text-amber-400 font-mono">${(currentAmount * 100).toFixed(2)}</strong>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>🥇🥉 1er y 3er Lugar (x500):</span>
              <strong className="text-amber-400 font-mono">${(currentAmount * 500).toFixed(2)}</strong>
            </div>
          </div>
        </div>

        {/* SELECTOR DE DENOMINACIONES (Fast buttons) */}
        <div className="flex-none p-3 bg-gray-900 border-b border-gray-800">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">
            Selecciona Monto de la Apuesta:
          </label>
          <div className="grid grid-cols-4 gap-2">
            {denominations.map(d => (
              <button 
                key={d} 
                onClick={() => setCurrentAmount(d)}
                className={`py-2 rounded-lg font-bold font-mono text-sm transition-all border ${
                  currentAmount === d 
                    ? 'bg-teal-500 text-white border-teal-400 shadow-md' 
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                }`}
              >
                ${d.toFixed(2)}
              </button>
            ))}
          </div>
        </div>

        {/* NUMPAD & ACCIONES COMPACTAS */}
        <div className="p-4 flex flex-col gap-3">
          <div className="flex gap-2">
            <div className="flex-[3] grid grid-cols-3 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  onClick={() => handleNumpadPress(num.toString())}
                  className="bg-[#1f2937] active:bg-[#374151] rounded-lg h-[52px] flex items-center justify-center text-2xl font-bold font-mono text-white shadow"
                >
                  {num}
                </button>
              ))}
              <button
                onClick={handleRandom}
                className="bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-slate-950 font-bold rounded-lg h-[52px] flex flex-col items-center justify-center text-xs tracking-tighter"
                title="Generar Palet aleatorio"
              >
                <span>🎲 AZAR</span>
              </button>
              <button
                onClick={() => handleNumpadPress('0')}
                className="bg-[#1f2937] active:bg-[#374151] rounded-lg h-[52px] flex items-center justify-center text-2xl font-bold font-mono text-white shadow"
              >
                0
              </button>
              <button
                onClick={handleBackspace}
                className="bg-red-900/20 text-red-500 rounded-lg h-[52px] flex items-center justify-center shadow"
              >
                <Trash2 size={22} />
              </button>
            </div>

            <div className="flex-[1] flex">
              <button 
                onClick={handleAdd}
                className={`rounded-lg w-full flex items-center justify-center shadow-lg transition-colors text-white ${
                  currentNumber.length === 4 && store.selectedLotteries.length > 0
                    ? 'bg-teal-500 active:bg-teal-400'
                    : 'bg-teal-800 opacity-60 cursor-not-allowed'
                }`}
              >
                <Plus size={36} />
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* COLUMNA DERECHA: Carrito & Confirmar (PC) o Panel Flotante */}
      <div className={`bg-[#0f172a] border-l border-gray-800 flex flex-col no-scrollbar ${isDesktop ? 'w-[400px] h-full' : 'flex-none h-[180px] w-full border-t border-gray-800'}`}>
        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900">
          <span className="font-bold text-sm uppercase text-slate-400">Apuestas ({store.cart.length})</span>
          {store.cart.length > 0 && (
            <button onClick={() => store.clearCart()} className="text-red-400 text-xs font-bold uppercase">
              Vaciar
            </button>
          )}
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
          {renderCartList()}
        </div>

        <div className="p-4 bg-gray-900 border-t border-gray-800 flex flex-col gap-3">
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-400">TOTAL APUESTA:</span>
            <span className="text-2xl font-black text-teal-400 font-mono">${calculateTotal().toFixed(2)}</span>
          </div>

          <button 
            onClick={() => setShowCheckoutModal(true)}
            disabled={paletCart.length === 0}
            className="w-full bg-teal-500 disabled:bg-slate-800 disabled:text-slate-600 py-3 rounded-xl font-bold uppercase tracking-wider text-slate-950 text-base"
          >
            PROCESAR PALETS
          </button>
        </div>
      </div>

      {/* CHECKOUT MODAL */}
      {showCheckoutModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 w-full max-w-sm flex flex-col gap-4 text-center">
            <h3 className="text-xl font-black tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-emerald-300">
              Confirmar Transacción
            </h3>
            
            <input 
              type="text" 
              placeholder="Nombre del cliente (Opcional)" 
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-white rounded p-3 text-sm outline-none focus:border-teal-500"
            />

            <div className="flex justify-between bg-slate-900 p-3 rounded-lg border border-slate-700 text-sm">
               <span>Sorteos:</span>
               <strong className="text-teal-400 font-mono">{store.selectedLotteries.length}</strong>
            </div>
            
            <div className="flex justify-between bg-slate-900 p-3 rounded-lg border border-slate-700 text-sm">
               <span>Total a pagar:</span>
               <strong className="text-teal-400 font-mono text-lg">${calculateTotal().toFixed(2)}</strong>
            </div>

            <div className="flex gap-2 mt-2">
              <button 
                onClick={() => setShowCheckoutModal(false)}
                className="flex-1 bg-slate-700 py-3 rounded-xl font-bold text-slate-300 active:bg-slate-600 transition-all text-sm"
              >
                Atrás
              </button>
              <button 
                onClick={() => processTransaction('print')}
                disabled={isBusy}
                className="flex-1 bg-teal-600 py-3 rounded-xl font-bold text-white active:bg-teal-500 transition-all text-sm uppercase"
              >
                {isBusy ? 'Cargando...' : 'Procesar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* THERMAL PRINT / COPY MODAL */}
      {printedTicket && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 w-full max-w-sm flex flex-col gap-4">
             <h3 className="text-center font-bold text-teal-400">¡Ticket Generado!</h3>
             <pre className="bg-slate-900 p-3 rounded-lg border border-slate-700 text-xs font-mono text-slate-300 max-h-[250px] overflow-y-auto leading-relaxed">
               {printedTicket}
             </pre>
             <div className="flex flex-col gap-2">
                {confirmationMessage && (
                   <button 
                      onClick={() => {
                         const url = `https://wa.me/?text=${encodeURIComponent(confirmationMessage)}`;
                         window.open(url, '_blank');
                      }}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white py-3 rounded-xl font-bold flex justify-center items-center gap-2 text-sm shadow"
                   >
                      <MessageCircle size={18} /> ENVIAR POR WHATSAPP
                   </button>
                )}
                <div className="flex gap-2">
                  <button 
                    onClick={handlePrintThermal}
                    className="flex-1 bg-teal-600 hover:bg-teal-500 py-3 rounded-xl font-bold flex justify-center items-center gap-1.5 text-sm text-white"
                  >
                    <PrinterIcon size={18} /> Imprimir
                  </button>
                  <button 
                    onClick={() => { setPrintedTicket(null); setConfirmationMessage(null); }}
                    className="flex-1 bg-slate-700 hover:bg-slate-600 py-3 rounded-xl font-bold text-sm text-slate-300"
                  >
                    Cerrar
                  </button>
                </div>
             </div>
          </div>
        </div>
      )}

    </div>
  );
}
