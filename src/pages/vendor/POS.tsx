import { useState, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { isGranjitaLottery, type LotteryConfig, formatLotteryTime, getAvailableLotteries } from '../../utils/lotteryRules';
import { processSale } from '../../services/saleService';
import { fetchPendingWinners, type PendingWinner } from '../../services/prizeService';
import { getDecadeNumbers } from '../../utils/math';
import { Trash2, Copy, Plus, X, Printer as PrinterIcon, FileText, MessageCircle } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { BluetoothSerial } from '@e-is/capacitor-bluetooth-serial';
import { supabase } from '../../utils/supabase';
import { useTheme } from '../../context/ThemeContext';
export default function POS() {
  const store = useStore();
  const { tc } = useTheme();

  // ── Theme-aware class shortcuts ──
  // ── Theme-aware class shortcuts ──
  // CLARO: fondo blanco puro, teal sólido en headers/franjas, contornos en inputs/botones
  const bgBase       = tc('bg-gray-900',  'bg-white');
  const bgPanel      = tc('bg-gray-800',  'bg-[#0d9488]');   // SORTEOS: franja teal sólida
  const bgInput      = tc('bg-[#1e293b]', 'bg-white');       // TIEMPOS/NÚMERO: blanco puro
  const bgDecenas    = tc('bg-[#0f172a]', 'bg-[#0d9488]');   // DECENAS: franja teal sólida
  const bgCart       = tc('bg-[#0f172a]', 'bg-white');       // carrito: blanco puro
  const bgNumpad     = tc('bg-[#111827]', 'bg-white');       // numpad: blanco puro
  const bgNumBtn     = tc('bg-[#1f2937]', 'bg-white');       // botones numpad: blanco
  // Borders
  const borderPanel   = tc('border-gray-700', 'border-slate-200');
  const borderInput   = tc('border-transparent', 'border-slate-300');
  const borderDecenas = tc('border-sky-800/60', 'border-[#0a7a6f]');
  const borderNumpad  = tc('border-gray-800',   'border-slate-200');
  // Text — SEPARADO por contexto de fondo
  const textPrimary    = tc('text-white',    'text-slate-900');   // texto principal
  const textPanelLabel = tc('text-gray-400', 'text-white font-black'); // labels en franja TEAL → blanco
  const textInputLabel = tc('text-gray-400', 'text-slate-600 font-bold'); // labels en input → gris oscuro
  const textInputValue = tc('text-white',    'text-slate-900 font-black'); // valores en input → negro
  const textMutedInput = tc('text-gray-600', 'text-slate-400');   // placeholder en input
  const textMuted      = tc('text-gray-500', 'text-white/90'); // subtítulos en franja teal
  const textTeal       = tc('text-teal-400', 'text-[#0d9488]');
  const textSkyLabel   = tc('text-sky-200',  'text-white font-black'); // POR DECENAS en franja teal → blanco
  // Select
  const selectBg      = tc('bg-gray-900 border-gray-600 text-teal-400', 'bg-white border-2 border-slate-300 text-[#0d9488] font-bold');
  const selectDecenas = tc('bg-[#162032] border-2 border-sky-500/70 text-sky-200', 'bg-[#0a7a6f] border border-[#085e56] text-white font-bold');
  // Numpad buttons: en claro → blanco con contorno marcado y sombra 3D física
  const numBtnClass   = tc(
    `${bgNumBtn} active:opacity-70 rounded-lg h-[55px] flex items-center justify-center text-2xl font-bold font-mono shadow`,
    'bg-white active:bg-slate-100 rounded-lg h-[55px] flex items-center justify-center text-2xl font-black font-mono text-slate-900 border-2 border-slate-300 shadow-[0_3px_0_#cbd5e1] active:shadow-none active:translate-y-[3px] transition-transform'
  );
  const backspaceClass = tc(
    'bg-red-900/20 text-red-500 active:bg-red-900/50 rounded-lg h-[55px] flex items-center justify-center shadow',
    'bg-white active:bg-red-50 rounded-lg h-[55px] flex items-center justify-center border-2 border-slate-300 shadow-[0_3px_0_#cbd5e1] active:shadow-none active:translate-y-[3px] transition-transform text-red-600 font-black'
  );

  const [lotteries, setLotteries] = useState<LotteryConfig[]>([]);
  
  // Custom Numpad Focus State
  const [focusedInput, setFocusedInput] = useState<'number' | 'amount'>('amount');
  
  // Form State
  const [currentNumber, setCurrentNumber] = useState('');
  const [currentAmount, setCurrentAmount] = useState('');
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

  // Repeat Play State
  const [showRepeatModal, setShowRepeatModal] = useState(false);
  const [searchClientName, setSearchClientName] = useState('');
  const [matchingTickets, setMatchingTickets] = useState<any[]>([]);
  const [searchingTickets, setSearchingTickets] = useState(false);

  // Import Text State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [invertImportOrder, setInvertImportOrder] = useState(false);
  const [parsedImport, setParsedImport] = useState<{
    clientName: string;
    plays: any[];
    detectedLotteries: LotteryConfig[];
  } | null>(null);

  const [isDesktop, setIsDesktop] = useState(false);

  // Pay with Prize State
  const [pendingPrizes, setPendingPrizes] = useState<PendingWinner[]>([]);
  const [payWithPrizeTicketId, setPayWithPrizeTicketId] = useState<string | null>(null);
  const [usePrize, setUsePrize] = useState(false);
  const [prizeSearchTerm, setPrizeSearchTerm] = useState('');

  useEffect(() => {
    // Forzar fetch fresco al montar el POS y purgar loterías de La Granjita si las hubiera
    store.fetchLotteries();
    const granjitaLots = store.selectedLotteries.filter(l => isGranjitaLottery(l));
    if (granjitaLots.length > 0) {
      store.clearLotteries();
    }
  }, []);

  useEffect(() => {
    const updateAvailable = () => {
      const available = getAvailableLotteries(ticketDate, store.lotteriesMaster).filter(l => !isGranjitaLottery(l));
      setLotteries(available);
      // Purgar loterías que ya no estén disponibles para la fecha elegida
      const validSelected = store.selectedLotteries.filter(sl => available.some(a => a.id === sl.id));
      if (validSelected.length !== store.selectedLotteries.length) {
        validSelected.forEach(l => {
          if (!available.some(a => a.id === l.id)) store.toggleLottery(l);
        });
      }
    };
    
    updateAvailable();
    // Refrescar disponibilidad y consultar loterías desde Supabase automáticamente cada 10s
    const interval = setInterval(async () => {
      await store.fetchLotteries();
      updateAvailable();
    }, 10000);

    // Refrescar inmediatamente cuando el usuario reactiva la pantalla o vuelve a la app
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

  const handleNumpadPress = (val: string) => {
    if (val === '.') return; // decimales no permitidos en Tiempos

    if (focusedInput === 'number') {
      if (currentNumber.length + val.length <= 2) {
        const newNumber = currentNumber + val;
        setCurrentNumber(newNumber);
      }
    } else {
      if (currentAmount.length + val.length <= 6) { 
        setCurrentAmount(currentAmount + val);
      }
    }
  };

  const handleBackspace = () => {
    if (focusedInput === 'number') {
      if (currentNumber === '') {
         setFocusedInput('amount');
      } else {
         setCurrentNumber(currentNumber.slice(0, -1));
      }
    } else {
      if (currentAmount !== '') {
         setCurrentAmount(currentAmount.slice(0, -1));
      }
    }
  };

  const handleAdd = () => {
    if (focusedInput === 'amount') {
      const amount = parseFloat(currentAmount);
      if (isNaN(amount) || amount <= 0) {
        alert('⚠️ Ingresa los TIEMPOS (monto) antes de continuar.');
        return;
      }
      setFocusedInput('number');
      return;
    }

    // Feedback específico de qué falta
    if (store.selectedLotteries.length === 0) {
      alert('⚠️ Debes seleccionar al menos un SORTEO antes de agregar.');
      return;
    }
    if (currentNumber.length !== 2) {
      alert('⚠️ Ingresa un número de 2 dígitos (00-99).');
      return;
    }
    const amount = parseFloat(currentAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('⚠️ Ingresa los TIEMPOS (monto) antes de agregar.');
      return;
    }

    store.addNumber(currentNumber, amount);
    setCurrentNumber('');
    setCurrentAmount('');
    setFocusedInput('amount'); // Volver a empezar en TIEMPOS
  };

  // ── PHYSICAL KEYBOARD SUPPORT ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input, textarea, or select
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        return;
      }

      // Ignore if modals are open
      if (showCheckoutModal || showRepeatModal || showImportModal || printedTicket) {
        return;
      }

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleNumpadPress(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleAdd();
      } else if (e.key === '+' || e.key === 'Add') {
        e.preventDefault();
        handleAdd();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedInput, currentNumber, currentAmount, showCheckoutModal, showRepeatModal, showImportModal, printedTicket]);

  const posCart = store.cart.filter(item => !item.isGranjita && !item.isPalet);
  const clearPosCart = () => {
    posCart.forEach(item => store.removeNumber(item.id));
  };

  const calculateTotal = () => {
    return posCart.reduce((sum, item) => sum + (item.amount * (item.lotteries?.length || 1)), 0) * store.saleMode;
  };

  const generateTicketText = (saleId: string) => {
    const shortId = saleId.split('-')[0].toUpperCase();
    const vendorName = store.currentUser?.username || 'Caja';
    const header = `${store.ticketHeader}\n--------------------------------\nFecha: ${new Date().toLocaleString('es-ES')}\nTicket ID: ${shortId}\nCajero: ${vendorName.toUpperCase()}\n\n`;
    
    let itemsStr = "";
    const grouped: Record<string, { lottery: LotteryConfig, items: typeof posCart }> = {};
    
    posCart.forEach(item => {
       const lotteries = item.lotteries || [];
       lotteries.forEach(lot => {
          if (!grouped[lot.id]) {
             grouped[lot.id] = { lottery: lot, items: [] };
          }
          grouped[lot.id].items.push(item);
       });
    });

    if (Object.keys(grouped).length === 0) {
       itemsStr += "GENERAL\n----------------------\nNUM / VILES / VALOR\n";
       posCart.forEach(item => {
         itemsStr += `${item.number.padEnd(16)} / ${item.amount.toString().padStart(3)} v / $${(item.amount * store.saleMode).toFixed(2)}\n`;
       });
       itemsStr += "----------------------\n\n";
    } else {
       Object.values(grouped).forEach(group => {
          itemsStr += `${group.lottery.name.toUpperCase()} (${formatLotteryTime(group.lottery.hour, group.lottery.minute)})\n----------------------\nNUM / VILES / VALOR\n`;
          group.items.forEach(item => {
             itemsStr += `${item.number.padEnd(16)} / ${item.amount.toString().padStart(3)} v / $${(item.amount * store.saleMode).toFixed(2)}\n`;
          });
          itemsStr += "----------------------\n\n";
       });
    }

    const total = `TOTAL A PAGAR: $${calculateTotal().toFixed(2)}\n\n----------------------\nID DE COBRO: ${shortId}\n----------------------\nREVISE SU TICKET\nSIN TICKET NO SE PAGA\nVALIDO POR 3 DIAS\n* GRACIAS POR PREFERIRNOS *\n\n\n\n\n\n`;
    return header + itemsStr + total;
  };

  const generateConfirmationMessage = (_ticketId: string, cart: typeof posCart, _client: string) => {
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
      const lower = (name || '').toLowerCase().trim();
      if (lower.includes('nica'))        return '🇳🇮';
      if (lower.includes('honduras'))    return '🇭🇳';
      if (lower.includes('tica'))        return '🇨🇷';
      if (lower.includes('monazo'))      return '🇨🇷';
      if (lower.includes('primera'))     return '🇩🇴';
      if (lower.includes('nacional'))    return '🇵🇦';
      if (lower.includes('anguilla'))    return '🇦🇮';
      if (lower.includes('new york') || lower.includes('florida')) return '🇺🇸';
      if (lower.includes('granjita'))    return '🐓';
      return '🎲';
    };

    const timeGroups: Record<string, { hour: number, minute: number, lots: LotteryConfig[] }> = {};
    uniqueLotteries.forEach(lot => {
      const timeKey = `${lot.hour}:${lot.minute}`;
      if (!timeGroups[timeKey]) {
        timeGroups[timeKey] = { hour: lot.hour, minute: lot.minute, lots: [] };
      }
      timeGroups[timeKey].lots.push(lot);
    });

    const titleLines: string[] = [];
    const sortedGroupKeys = Object.keys(timeGroups).sort((a, b) => {
      const [hA, mA] = a.split(':').map(Number);
      const [hB, mB] = b.split(':').map(Number);
      return (hA * 60 + mA) - (hB * 60 + mB);
    });

    sortedGroupKeys.forEach(key => {
      const group = timeGroups[key];
      const timeStr = formatLotteryTime(group.hour, group.minute);
      if (group.lots.length === 1) {
        const lot = group.lots[0];
        const flag = getFlag(lot.name);
        titleLines.push(`${flag} *Jugada confirmada - ${lot.name} ${timeStr}* ✅`);
      } else {
        const flags = group.lots.map(l => getFlag(l.name)).join(' ');
        const namesStr = group.lots.map(l => l.name).join(' y ');
        titleLines.push(`${flags} *Jugada confirmada - ${namesStr} ${timeStr}* ✅`);
      }
    });

    const msg = titleLines.length > 0 ? titleLines.join('\n') : '🎲 *Jugada confirmada - Tiempos* ✅';
    return msg;
  };

  const processTransaction = async (action: 'print' | 'share' | 'save') => {
    if (posCart.length === 0) return;
    
    // ── VALIDA QUE NINGÚN SORTEO EN EL CARRITO SE HAYA CERRADO ──
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    if (ticketDate === todayStr) {
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const totalMinutesNow = currentHour * 60 + currentMinute;
      
      const currentDays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      const todayName = currentDays[now.getDay()];

      const closedLotteriesInCart: string[] = [];

      posCart.forEach(item => {
        (item.lotteries || []).forEach(l => {
          const playsToday = !l.days || l.days.includes(todayName as any);
          const lotteryTotalMinutes = l.hour * 60 + l.minute;
          const closingTimeMinutes = lotteryTotalMinutes - (l.closeMinutes ?? 10);
          
          if (playsToday && totalMinutesNow >= closingTimeMinutes) {
             const timeStr = `${l.hour > 12 ? l.hour - 12 : (l.hour === 0 ? 12 : l.hour)}:${l.minute.toString().padStart(2, '0')} ${l.hour >= 12 ? 'PM' : 'AM'}`;
             const desc = `${l.name} (${timeStr})`;
             if (!closedLotteriesInCart.includes(desc)) {
                closedLotteriesInCart.push(desc);
             }
          }
        });
      });

      if (closedLotteriesInCart.length > 0) {
        alert(`🚫 ERROR: No se puede procesar el ticket.\nLos siguientes sorteos ya están CERRADOS:\n\n- ${closedLotteriesInCart.join('\n- ')}\n\nPor favor, vacía el carrito o remueve las jugadas tardías.`);
        return;
      }
    }

    setIsBusy(true);

    try {
      const currentVendor = store.currentUser?.username || 'vendedor_desconocido'; 
      const total = calculateTotal();
      
      const createdTicket = await processSale(currentVendor, clientName, total, posCart, payWithPrizeTicketId, ticketDate);
      const ticketString = generateTicketText(createdTicket.ticketId);

      store.addTicket({
         id: createdTicket.ticketId,
         client_name: clientName,
         total_amount: total,
         status: 'active',
         created_at: new Date().toISOString(),
         cart: [...posCart],
         lotteries: [...store.selectedLotteries]
      });
      
      const confirmationMsg = generateConfirmationMessage(createdTicket.ticketId, posCart, clientName);
      setConfirmationMessage(confirmationMsg);

      clearPosCart();
      store.clearLotteries();
      setCurrentNumber('');
      setCurrentAmount('');
      setClientName('');
      setFocusedInput('amount');
      setUsePrize(false);
      setPayWithPrizeTicketId(null);
      setShowCheckoutModal(false);

      if (action === 'print' || action === 'save') {
        setPrintedTicket(ticketString); // abre modal final
      } else if (action === 'share') {
        if (navigator.share) {
           await navigator.share({
             title: 'Ticket de Lotería',
             text: confirmationMsg
           });
        } else {
           const url = `https://wa.me/?text=${encodeURIComponent(confirmationMsg)}`;
           window.open(url, '_blank');
        }
      }
      
    } catch (err: any) {
      console.error("Fallo DB:", err);
      alert("ERROR DB NUBE: " + (err.message || JSON.stringify(err) || err));
    } finally {
      setIsBusy(false);
    }
  };

  const handleSearchTickets = async (term = searchClientName) => {
    setSearchingTickets(true);
    try {
      let query = supabase
        .from('tickets')
        .select('id, client_name, created_at, total_amount, ticket_numbers(draw_id, number_played, amount)')
        .eq('vendor_id', store.currentUser?.username || 'vendedor_desconocido')
        .order('created_at', { ascending: false })
        .limit(20);
        
      if (term.trim() !== '') {
        query = query.ilike('client_name', `%${term.trim()}%`);
      }
      
      const { data, error } = await query;
      if (!error && data) {
        setMatchingTickets(data);
      } else {
        console.error("Error searching tickets:", error);
      }
    } catch (err) {
      console.error("Error in handleSearchTickets:", err);
    } finally {
      setSearchingTickets(false);
    }
  };

  const handleLoadTicket = (t: any) => {
    const ticketDrawIds = Array.from(new Set(t.ticket_numbers?.map((n: any) => n.draw_id) || []));
    
    // Auto-select open lotteries from the ticket if no lottery is currently selected
    if (store.selectedLotteries.length === 0) {
      const openTicketLotteries = lotteries.filter(l => ticketDrawIds.includes(l.id));
      if (openTicketLotteries.length > 0) {
        openTicketLotteries.forEach(l => {
          if (!store.selectedLotteries.some(sl => sl.id === l.id)) {
            store.toggleLottery(l);
          }
        });
      } else {
        alert("⚠️ Los sorteos del ticket original están cerrados. Selecciona un sorteo activo antes de cargar.");
        return;
      }
    }

    store.clearCart();
    setClientName(t.client_name || '');

    const uniqueNumbers: Record<string, number> = {};
    t.ticket_numbers?.forEach((n: any) => {
      uniqueNumbers[n.number_played] = parseFloat(n.amount);
    });

    Object.entries(uniqueNumbers).forEach(([num, amt]) => {
      store.addNumber(num, amt);
    });

    setShowRepeatModal(false);
  };

  useEffect(() => {
    if (showRepeatModal) {
      setSearchClientName('');
      handleSearchTickets('');
    }
  }, [showRepeatModal]);

  useEffect(() => {
    if (importText.trim() === '') {
      setParsedImport(null);
      return;
    }

    const lines = importText.split('\n');
    let clientName = '';
    const plays: any[] = [];
    const detectedLotteryIds = new Set<string>();

    // ── STEP 1: Extract client name ──
    // Try explicit labels first
    const nameMatch = importText.match(/(?:Nombre|Cliente|Name|Vendedor|Cajero|Jugador)\s*[:\-=]\s*(.+)/i);
    if (nameMatch) {
      clientName = nameMatch[1].trim();
    }

    let currentLottery: LotteryConfig | null = null;

    // ── Helper: strip emoji/unicode decorations from a line ──
    const stripEmoji = (s: string) => s.replace(/[\u{1F1E0}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '').trim();

    for (let rawLine of lines) {
      let line = rawLine.trim();
      if (!line) continue;

      // Skip lines that are clearly metadata/headers
      if (/^(codigo|verificacion|total|monto\s*minimo|procesar|confirmo)/i.test(stripEmoji(line))) continue;
      if (/^-+$/.test(line) || /^=+$/.test(line) || /^\*+$/.test(line)) continue;

      // If the first non-empty line has no numbers at all and no label was found, treat it as client name
      if (!clientName && plays.length === 0 && !detectedLotteryIds.size) {
        const cleanLine = stripEmoji(line);
        // If the line is purely alphabetic (a name), grab it
        if (/^[a-záéíóúñü\s]+$/i.test(cleanLine) && cleanLine.length >= 2 && cleanLine.length <= 40) {
          clientName = cleanLine;
          continue;
        }
      }

      // ── STEP 2: Detect lottery/draw names ──
      const cleanedLine = stripEmoji(line);
      const normalizedLine = cleanedLine.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

      // Also try matching "tica tradicional" → "tica"
      let foundLotto: LotteryConfig | undefined;
      const matches = store.lotteriesMaster.filter(l => {
        const normName = l.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return normalizedLine.includes(normName);
      });

      if (matches.length > 0) {
        foundLotto = matches[0];
        // Disambiguate by time if multiple lotteries share the same name (e.g. Nica 1pm vs Nica 4pm)
        if (matches.length > 1) {
          const timeMatch = line.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
          if (timeMatch) {
            let hr = parseInt(timeMatch[1]);
            const min = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
            const ampm = timeMatch[3]?.toLowerCase();
            
            // Si es PM y la hora es menor a 12, sumamos 12. Pero si explícitamente dice "12 pm", es 12.
            if (ampm === 'pm' && hr < 12) hr += 12;
            if (ampm === 'am' && hr === 12) hr = 0;
            
            // Si no se especifica am/pm, y es 1, 4, 7, 10, etc., asumimos PM
            if (!ampm) {
              if (hr >= 1 && hr <= 11) hr += 12;
            }

            let bestLotto = matches.find(l => l.hour === hr && (min === 0 || l.minute === min));
            
            // Si buscan la de la 1 PM o las 12 PM, y no se encuentra por hora exacta,
            // mapeamos al ID que contenga '1pm' (ej: '1pm-nica' que ahora corre a las 12:00 PM)
            if (!bestLotto && (hr === 13 || hr === 12)) {
              bestLotto = matches.find(l => l.id.includes('1pm') || l.id.includes('12pm') || l.id.includes('120'));
            }

            if (bestLotto) foundLotto = bestLotto;
          }
        }
        currentLottery = foundLotto;
        detectedLotteryIds.add(foundLotto.id);
        continue;
      }

      // ── STEP 3: Skip known non-play lines ──
      if (/(?:nombre|cliente|jugador|cajero|vendedor)\s*[:\-=]/i.test(line)) continue;
      if (/(?:viles|monto|pesos|cantidad|valor|numero|num|jugada)/i.test(line) && !/\d{1,2}\s*[-x*:]\s*\d+/.test(line)) continue;

      // ── STEP 4: Parse number-amount pairs ──
      let num = '';
      let amt = 0;

      // Clean trailing "v" or "viles" from the line
      const lineClean = line.replace(/\s*v(?:iles)?\s*$/i, '').trim();

      let matched = false;
      let firstVal = '';
      let secondVal = '';
      let isExplicitDelFormat = false; // "del" format has amt first, num second by default

      // Format: "25 - 10" (number DASH amount) or "25/10" (number SLASH amount)
      const dashMatch = lineClean.match(/^(\d{1,2})\s*[-–—\/]\s*(\d+)$/);
      if (dashMatch) {
        firstVal = dashMatch[1];
        secondVal = dashMatch[2];
        matched = true;
      }

      // Format: "25x10" or "25 x 10" or "25*10"
      if (!matched) {
        const xMatch = lineClean.match(/^(\d{1,2})\s*[x*X]\s*(\d+)$/);
        if (xMatch) {
          firstVal = xMatch[1];
          secondVal = xMatch[2];
          matched = true;
        }
      }

      // Format: "25:10" or "25 = 10"
      if (!matched) {
        const colonMatch = lineClean.match(/^(\d{1,2})\s*[:=]\s*(\d+)$/);
        if (colonMatch) {
          firstVal = colonMatch[1];
          secondVal = colonMatch[2];
          matched = true;
        }
      }

      // Format: "10 del 25" or "10 al 25" (amount DEL number)
      if (!matched) {
        const delMatch = lineClean.match(/^(\d+)\s+(?:del|al|de|el)\s+(\d{1,2})$/i);
        if (delMatch) {
          firstVal = delMatch[1];
          secondVal = delMatch[2];
          isExplicitDelFormat = true;
          matched = true;
        }
      }

      // Format: "25 con 10" or "25 por 10" (number CON amount)
      if (!matched) {
        const conMatch = lineClean.match(/^(\d{1,2})\s+(?:con|por|de)\s+(\d+)$/i);
        if (conMatch) {
          firstVal = conMatch[1];
          secondVal = conMatch[2];
          matched = true;
        }
      }

      // Format: pipe "25 | 10" or "25|10"
      if (!matched) {
        const pipeMatch = lineClean.match(/^(\d{1,2})\s*\|\s*(\d+)$/);
        if (pipeMatch) {
          firstVal = pipeMatch[1];
          secondVal = pipeMatch[2];
          matched = true;
        }
      }

      // Format: slash "25/10" or "25 / 10"
      if (!matched) {
        const slashMatch = lineClean.match(/^(\d{1,2})\s*\/\s*(\d+)$/);
        if (slashMatch) {
          firstVal = slashMatch[1];
          secondVal = slashMatch[2];
          matched = true;
        }
      }

      // Format: parentheses "49(4)" or "49 (4)" or "83(4)" or "15 (4)"
      if (!matched) {
        const parenMatch = lineClean.match(/^(\d{1,2})\s*\((\d+)\)$/);
        if (parenMatch) {
          firstVal = parenMatch[1];
          secondVal = parenMatch[2];
          matched = true;
        }
      }

      // Format: tab separated "25\t10"
      if (!matched) {
        const tabMatch = lineClean.match(/^(\d{1,2})\t+(\d+)$/);
        if (tabMatch) {
          firstVal = tabMatch[1];
          secondVal = tabMatch[2];
          matched = true;
        }
      }

      // Format: space separated "25 10"
      if (!matched) {
        const spaceMatch = lineClean.match(/^(\d{1,2})\s+(\d+)$/);
        if (spaceMatch) {
          firstVal = spaceMatch[1];
          secondVal = spaceMatch[2];
          matched = true;
        }
      }

      // Format: comma separated "25,10"
      if (!matched) {
        const commaMatch = lineClean.match(/^(\d{1,2})\s*,\s*(\d+)$/);
        if (commaMatch) {
          firstVal = commaMatch[1];
          secondVal = commaMatch[2];
          matched = true;
        }
      }

      // Format: dot separated "70.1"
      if (!matched) {
        const dotMatch = lineClean.match(/^(\d{1,2})\s*\.\s*(\d+(?:\.\d+)?)$/);
        if (dotMatch) {
          firstVal = dotMatch[1];
          secondVal = dotMatch[2];
          matched = true;
        }
      }

      if (matched) {
        const normalOrder = !isExplicitDelFormat;
        const shouldInvert = invertImportOrder;
        
        if (normalOrder !== shouldInvert) {
          num = firstVal;
          amt = parseFloat(secondVal);
        } else {
          amt = parseFloat(firstVal);
          num = secondVal;
        }
      }

      if (num && amt > 0) {
        num = num.padStart(2, '0');
        plays.push({
          number: num,
          amount: amt,
          lotteryId: currentLottery ? currentLottery.id : null
        });
      }
    }

    const detectedLotteries = store.lotteriesMaster.filter(l => detectedLotteryIds.has(l.id));

    setParsedImport({
      clientName,
      plays,
      detectedLotteries
    });
  }, [importText, store.lotteriesMaster, invertImportOrder]);

  const handleLoadImport = (replaceCart: boolean = true) => {
    if (!parsedImport || parsedImport.plays.length === 0) {
      alert("⚠️ No se detectaron jugadas válidas para importar.");
      return;
    }

    let targetLotteries = store.selectedLotteries;
    
    if (targetLotteries.length === 0) {
      const openImportLotteries = lotteries.filter(l => 
        parsedImport.detectedLotteries.some(dl => dl.id === l.id)
      );
      
      if (openImportLotteries.length > 0) {
        openImportLotteries.forEach(l => {
          if (!store.selectedLotteries.some(sl => sl.id === l.id)) {
            store.toggleLottery(l);
          }
        });
        targetLotteries = openImportLotteries;
      } else {
        alert("⚠️ Los sorteos detectados en el texto están cerrados. Selecciona un sorteo activo antes de importar.");
        return;
      }
    }

    if (replaceCart) {
      store.clearCart();
    }
    
    if (parsedImport.clientName && replaceCart) {
      setClientName(parsedImport.clientName);
    }

    const uniqueNumbers: Record<string, number> = {};
    parsedImport.plays.forEach(p => {
      if (uniqueNumbers[p.number]) {
        uniqueNumbers[p.number] += p.amount; // Sumar viles si el número se repite
      } else {
        uniqueNumbers[p.number] = p.amount;
      }
    });

    Object.entries(uniqueNumbers).forEach(([num, amt]) => {
      store.addNumber(num, amt);
    });

    setShowImportModal(false);
    setImportText('');
  };

  const handleCopyTicket = () => {
    if (printedTicket) {
      navigator.clipboard.writeText(printedTicket)
        .then(() => alert("Ticket copiado exitosamente"))
        .catch(() => alert("Error copiando ticket"));
    }
  };

  const renderCartList = (_isDesktop: boolean) => {
    if (posCart.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-gray-500 opacity-40 py-12 pointer-events-none">
          <div className="w-24 h-24 border-4 border-dashed border-gray-700 rounded-full flex items-center justify-center mb-4">
            <span className="text-3xl text-gray-600 font-mono">!</span>
          </div>
          <p className="font-bold text-xs text-gray-500 tracking-widest uppercase">CARRITO VACÍO</p>
        </div>
      );
    }

    return (
      <div className="space-y-2 pb-6">
        {posCart.map((item, index) => {
          return (
            <div 
              key={item.id} 
              className="flex justify-between items-center bg-[#1e293b]/70 hover:bg-[#1e293b] rounded-xl p-3 shadow-md text-white border-l-4 border-teal-500 w-full transition-all duration-200 animate-slide-up"
            >
              <div className="flex items-center gap-3">
                <span className="text-gray-500 text-[10px] font-mono w-4">#{index + 1}</span>
                <div className="bg-teal-950/40 rounded-xl px-3 py-1 flex items-center gap-1.5 border border-teal-800/40 shadow-inner min-w-[50px] justify-center">
                  <span className="text-lg font-bold font-mono tracking-tighter text-teal-400">{item.number}</span>
                </div>
              </div>
            
              <div className="flex items-center gap-3">
                <div className="text-right flex flex-col">
                  <span className="text-base font-bold font-mono text-white">
                    {item.amount} <span className="text-xs text-gray-400 font-sans font-normal">viles</span>
                  </span>
                  <span className="text-xs text-teal-400 font-mono font-semibold">
                    ${(item.amount * store.saleMode * (item.lotteries?.length || 1)).toFixed(2)}
                  </span>
                  {item.lotteries && item.lotteries.length > 0 && (
                    <span className="text-[9px] text-gray-400 font-bold uppercase mt-0.5 tracking-wider leading-none">
                      [{item.lotteries.map(l => l.name.substring(0, 4)).join(', ')}]
                    </span>
                  )}
                </div>
                <button 
                  onClick={() => store.removeNumber(item.id)}
                  className="bg-red-950/40 text-red-400 p-2 rounded-xl hover:bg-red-900/40 hover:text-red-300 transition-colors"
                  title="Eliminar"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]');
    if (meta) {
       meta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
    }

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

  return (
    <div className={`flex w-full h-full ${bgBase} overflow-hidden ${textPrimary} ${isDesktop ? 'flex-row' : 'flex-col'}`}>
      
      {/* COLUMNA IZQUIERDA: Entradas, Sorteos y Teclado */}
      <div className={`flex flex-col ${bgBase} no-scrollbar ${isDesktop ? 'flex-1 h-full overflow-y-auto' : 'flex-1 h-full'}`}>
        
        {/* SELECTOR DE SORTEO COMPACTO */}
        <div className={`flex-none ${bgPanel} px-3 py-2 lg:px-6 lg:py-4 border-b ${borderPanel} z-10 w-full overflow-hidden shadow-md`}>
          <div className="flex justify-between items-center mb-1 lg:mb-3">
             <label className={`${textPanelLabel} text-[10px] lg:text-sm uppercase font-bold tracking-wider`}>Sorteos Seleccionados:</label>
             <div className="flex gap-2 items-center">
               <input 
                 type="date" 
                 value={ticketDate} 
                 onChange={(e) => {
                   setTicketDate(e.target.value);
                   store.clearLotteries();
                 }}
                 className={`${selectBg} text-xs lg:text-base lg:px-3 lg:py-1.5 font-bold rounded px-1 py-0.5 outline-none`}
               />
             </div>
          </div>
          <div className="flex items-center gap-2 w-full">
             <select 
               className={`${selectBg} text-sm lg:text-lg font-bold font-mono tracking-wide rounded p-2 lg:p-3 outline-none w-[140px] lg:w-[200px]`}
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
                     <button onClick={() => store.toggleLottery(lotto)} className="text-teal-200 active:text-white bg-teal-800/50 rounded-full p-[2px] lg:p-1">
                       <X size={14} />
                     </button>
                   </div>
               ))}
             </div>
          </div>
        </div>

             {/* ENTRADA DE DATOS TRADICIONAL */}
             <div className={`flex-none p-3 lg:p-6 lg:py-6 ${bgBase} border-b ${borderNumpad} shadow-sm z-10 w-full relative`}>
               <div className="flex items-center gap-3 lg:gap-6">
                 <div 
                   onClick={() => setFocusedInput('amount')}
                   className={`flex-[1.5] p-3 lg:px-6 lg:py-6 rounded-lg flex justify-between items-center ${bgInput} border-2 transition-colors cursor-pointer ${
                     focusedInput === 'amount' ? 'border-teal-400 shadow-[0_0_8px_rgba(45,212,191,0.5)]' : borderInput
                   }`}
                 >
                   <span className={`${textInputLabel} font-medium text-xs lg:text-lg font-mono`}>TIEMPOS</span>
                   <div className="flex items-center gap-1">
                     <span className={`text-3xl lg:text-6xl font-bold font-mono ${currentAmount ? textInputValue : textMutedInput}`}>
                       {currentAmount || '0'}
                     </span>
                   </div>
                 </div>

                 <div className={`${textMuted} font-bold text-xl lg:text-4xl lg:mx-4`}>x</div>

                 <div 
                   onClick={() => setFocusedInput('number')}
                   className={`flex-1 p-3 lg:px-6 lg:py-6 rounded-lg flex justify-between items-center ${bgInput} border-2 transition-colors cursor-pointer ${
                     focusedInput === 'number' ? 'border-teal-400 shadow-[0_0_8px_rgba(45,212,191,0.5)]' : borderInput
                   }`}
                 >
                   <span className={`${textInputLabel} font-medium text-xs lg:text-lg font-mono`}>NÚMERO</span>
                   <span className={`text-3xl lg:text-6xl font-bold font-mono ${currentNumber ? textTeal : textMutedInput}`}>
                     {currentNumber || '00'}
                   </span>
                 </div>
               </div>
             </div>

             {/* SELECTOR DE DECENAS RÁPIDAS */}
             <div className={`flex-none ${bgDecenas} px-3 py-3 lg:px-6 lg:py-4 border-b-2 ${borderDecenas} shadow-md z-10 w-full flex justify-between items-center gap-3`}>
                <span className={`${textSkyLabel} text-sm lg:text-base font-black tracking-widest uppercase whitespace-nowrap`}>POR DECENAS:</span>
                <select
                   className={`flex-1 ${selectDecenas} text-base lg:text-xl font-extrabold p-3 lg:p-3.5 rounded-xl outline-none shadow-inner cursor-pointer`}
                   onChange={(e) => {
                      if(e.target.value !== "") {
                         const decade = parseInt(e.target.value);
                         const amount = parseFloat(currentAmount);
                         if (isNaN(amount) || amount <= 0 || store.selectedLotteries.length === 0) {
                            alert("Ingresa los TIEMPOS y selecciona LOTERÍAS primero para vender por decenas.");
                            e.target.value = "";
                            return;
                         }
                         const nums = getDecadeNumbers(decade);
                         nums.forEach(n => store.addNumber(n, amount));
                         setCurrentAmount('');
                         setFocusedInput('amount');
                         e.target.value = "";
                      }
                   }}
                >
                  <option value="">+ Desplegar y elegir Decena</option>
                  <option value="0">Decena del 0 (00-09)</option>
                  <option value="1">Decena del 1 (10-19)</option>
                  <option value="2">Decena del 2 (20-29)</option>
                  <option value="3">Decena del 3 (30-39)</option>
                  <option value="4">Decena del 4 (40-49)</option>
                  <option value="5">Decena del 5 (50-59)</option>
                  <option value="6">Decena del 6 (60-69)</option>
                  <option value="7">Decena del 7 (70-79)</option>
                  <option value="8">Decena del 8 (80-89)</option>
                  <option value="9">Decena del 9 (90-99)</option>
                </select>
             </div>

        {/* ÁREA DE JUGADAS MÓVIL */}
        {!isDesktop && (
          <div className={`flex-1 overflow-y-auto ${bgCart} p-3 no-scrollbar w-full`}>
            {renderCartList(false)}
          </div>
        )}

        {/* SPACER PARA ESCRITORIO - EMPUJA EL TECLADO HACIA ABAJO */}
        {isDesktop && <div className="flex-1"></div>}

        {/* CLIENT NAME & TECLADO NUMÉRICO */}
        <div className={`flex-none ${isDesktop ? 'bg-transparent p-6 flex flex-col justify-end mt-auto w-full' : `${bgNumpad} pb-safe border-t ${borderNumpad} shadow-[0_-10px_30px_rgba(0,0,0,0.3)] w-full relative z-20`}`}>
          <div className={`w-full mx-auto flex flex-col gap-3 ${isDesktop ? `${bgPanel} p-6 rounded-2xl border ${borderPanel} shadow-xl` : ''}`}>
            <div className="px-1 py-1 flex gap-2">
               <input 
                 type="text" 
                 placeholder="Nombre del cliente (Opcional)" 
                 value={clientName}
                 onChange={(e) => setClientName(e.target.value)}
                 onFocus={(e) => {
                   setTimeout(() => {
                     e.target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                   }, 300);
                 }}
                 onKeyDown={(e) => {
                   if (e.key === 'Enter') {
                     e.currentTarget.blur();
                   }
                 }}
                 className={`flex-1 ${bgInput} border ${borderNumpad} ${textInputValue} rounded p-2 text-sm outline-none focus:border-teal-500 transition-colors ${tc('placeholder-gray-600','placeholder-gray-400')}`}
               />
               <button
                 type="button"
                 onClick={() => setShowRepeatModal(true)}
                 className="bg-teal-600 hover:bg-teal-500 active:bg-teal-700 text-white rounded px-3 py-2 text-xs font-bold transition-colors flex items-center gap-1 shadow-sm"
                 title="Repetir jugada anterior"
               >
                 <Copy size={16} />
                 <span>Repetir</span>
               </button>
               <button
                 type="button"
                 onClick={() => setShowImportModal(true)}
                 className="bg-[#0284c7] hover:bg-sky-500 active:bg-sky-700 text-white rounded px-3 py-2 text-xs font-bold transition-colors flex items-center gap-1 shadow-sm font-sans"
                 title="Importar jugada desde WhatsApp / Texto"
               >
                 <FileText size={16} />
                 <span>Importar</span>
               </button>
            </div>
            
            <div className="flex gap-2 w-full">
              {/* Keypad numbers */}
              <div className="flex-[3] grid grid-cols-3 gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                  <button
                    key={num}
                    onClick={() => handleNumpadPress(num.toString())}
                    className={`${numBtnClass} ${textPrimary}`}
                  >
                    {num}
                  </button>
                ))}
                <button
                    onClick={() => handleNumpadPress('00')}
                    className={`${numBtnClass} ${textTeal}`}
                >
                  00
                </button>
                <button
                    onClick={() => handleNumpadPress('0')}
                    className={`${numBtnClass} ${textPrimary}`}
                >
                  0
                </button>
                <button
                  onClick={handleBackspace}
                  className={backspaceClass}
                >
                  <Trash2 size={24} />
                </button>
              </div>

              {/* Action Column - PLUS */}
              <div className="flex-[1] flex flex-col gap-2 relative">
                <button 
                  onClick={handleAdd}
                  className={`rounded-lg h-full flex items-center justify-center shadow-lg transition-colors overflow-hidden relative text-white ${
                    (focusedInput === 'amount' && parseFloat(currentAmount) > 0) ||
                    (focusedInput === 'number' && currentNumber.length === 2 && parseFloat(currentAmount) > 0 && store.selectedLotteries.length > 0)
                      ? 'bg-teal-500 active:bg-teal-400 scale-100 active:scale-95'
                      : 'bg-teal-800 opacity-70'
                  }`}
                >
                  <Plus size={40} className={
                    (focusedInput === 'amount' && parseFloat(currentAmount) > 0) ||
                    (focusedInput === 'number' && currentNumber.length === 2 && parseFloat(currentAmount) > 0)
                      ? 'animate-pulse text-white' 
                      : 'text-teal-600'
                  } />
                </button>
              </div>
            </div>
            
            {/* EL BOTON MÁS GRANDE - PROCESAR MÓVIL (Solo visible si !isDesktop) */}
            {!isDesktop && (
              <div>
                <button 
                  onClick={() => setShowCheckoutModal(true)}
                  disabled={store.cart.length === 0}
                  className="w-full bg-[#0ea5e9] disabled:bg-gray-800 disabled:text-gray-600 active:bg-[#0284c7] text-white rounded-lg h-[60px] flex items-center justify-center shadow-lg transition-colors mt-1 border-b-4 border-[#0369a1] active:translate-y-1 active:border-b-0"
                >
                  <span className="font-black text-2xl tracking-widest text-shadow">PROCESAR</span>
                </button>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* COLUMNA DERECHA: Carrito Desktop */}
      {isDesktop && (
        <div className={`flex flex-col w-[500px] xl:w-[550px] h-full ${bgCart} border-l ${borderPanel}`}>
          <div className={`flex-none ${bgPanel} px-4 py-3.5 lg:px-6 lg:py-5 border-b ${borderPanel} flex justify-between items-center`}>
             <span className={`${textPanelLabel} font-bold text-xs lg:text-base uppercase tracking-wider`}>Lista de Jugadas</span>
             <div className="flex items-center gap-3">
               {store.cart.length > 0 && (
                 <button 
                   onClick={() => store.clearCart()} 
                   className="flex items-center gap-1 text-red-400 hover:bg-red-900/30 px-2 py-1 rounded transition-colors"
                   title="Vaciar carrito"
                 >
                   <Trash2 size={16} />
                   <span className="text-xs font-bold uppercase tracking-wider">Vaciar</span>
                 </button>
               )}
               <span className="bg-teal-950/40 text-teal-400 text-xs lg:text-sm font-mono font-bold px-2 py-0.5 lg:px-3 lg:py-1 rounded-full border border-teal-800/30">
                 {store.cart.length} apuntes
               </span>
             </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
             {renderCartList(true)}
          </div>
          
          <div className={`flex-none p-4 ${bgPanel} border-t ${borderPanel} shadow-[0_-8px_25px_rgba(0,0,0,0.1)]`}>
             <div className="flex justify-between items-center mb-3.5">
                <span className={`${textPanelLabel} font-bold text-xs uppercase tracking-wider`}>Total a pagar</span>
                <span className={`text-2xl font-black ${tc('text-teal-400','text-white')} font-mono`}>${calculateTotal().toFixed(2)}</span>
             </div>
             <button
                onClick={() => setShowCheckoutModal(true)}
                disabled={store.cart.length === 0}
                className="w-full bg-[#0ea5e9] hover:bg-sky-500 disabled:bg-gray-800 disabled:text-gray-600 disabled:border-b-0 text-white rounded-xl h-[55px] flex items-center justify-center font-black text-xl tracking-widest shadow-lg transition-all border-b-4 border-[#0369a1] active:translate-y-0.5 active:border-b-0"
             >
                PROCESAR
             </button>
          </div>
        </div>
      )}

      {/* MODAL DE TICKET */}
      {showCheckoutModal && !printedTicket && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-gray-800 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-slide-up border border-gray-700">
            <div className="bg-gray-900 p-4 border-b border-gray-700 flex justify-between items-center">
               <h3 className="text-white font-bold text-lg flex items-center gap-2"><PrinterIcon size={18}/> Confirma Venta</h3>
               <button onClick={() => setShowCheckoutModal(false)} className="text-gray-500 active:text-white p-2 bg-gray-800 rounded-full">
                 <X size={20} />
               </button>
            </div>
            
            <div className="p-4 overflow-y-auto flex-1 bg-gray-800 no-scrollbar">
               <div className="space-y-4">
                  <div className="bg-gray-900 p-3 rounded-lg border border-gray-700">
                    <p className="text-gray-400 text-xs mb-1">Items en carrito:</p>
                    <p className="text-white font-bold text-sm">
                      {posCart.length} apunte(s)
                    </p>
                  </div>

                  <div>
                     <div className="flex justify-between border-b mx-1 mb-2 border-dashed border-gray-600 pb-1">
                        <span className="text-gray-400 text-xs">Números</span>
                        <span className="text-gray-400 text-xs text-right">Monto Unit.</span>
                     </div>
                     {posCart.map(i => {
                        return (
                          <div key={i.id} className="flex justify-between py-1 px-2 border-b border-gray-700/50 last:border-0 text-white font-mono text-xs">
                             <span className="tracking-widest font-bold">
                               {i.number}
                             </span>
                             <span>${i.amount.toFixed(2)}</span>
                          </div>
                        );
                     })}
                  </div>
               </div>

                {/* COBRAR CON PREMIO PENDIENTE */}
                <div className="mt-2 border border-orange-800/40 rounded-md overflow-hidden">
                  <button
                    onClick={async () => {
                      const next = !usePrize;
                      setUsePrize(next);
                      if (next && pendingPrizes.length === 0) {
                        const vendorId = store.currentUser?.username || 'vendedor_desconocido';
                        const prizes = await fetchPendingWinners(vendorId);
                        setPendingPrizes(prizes);
                        if (prizes.length > 0) setPayWithPrizeTicketId(prizes[0].ticket_id);
                      }
                      if (!next) {
                        setPayWithPrizeTicketId(null);
                        setPrizeSearchTerm('');
                      }
                    }}
                    className={`w-full flex justify-between items-center px-4 py-3 text-sm font-bold transition-colors ${
                      usePrize ? 'bg-orange-900/60 text-orange-300' : 'bg-gray-800/60 text-gray-400'
                    }`}
                  >
                    <span>🏆 Cobrar de Premio Pendiente</span>
                    <span className={`text-xs px-2 py-0.5 rounded font-bold ${
                      usePrize ? 'bg-orange-500 text-white' : 'bg-gray-700 text-gray-500'
                    }`}>{usePrize ? 'ON' : 'OFF'}</span>
                  </button>

                  {usePrize && (
                    <div className="p-3 bg-gray-900/60 border-t border-orange-800/30">
                      {pendingPrizes.length === 0 ? (
                        <p className="text-gray-500 text-xs text-center py-1">No hay premios pendientes disponibles.</p>
                      ) : (
                        <>
                          {/* Buscador rápido de premios */}
                          <div className="mb-3 relative">
                            <input
                              type="text"
                              value={prizeSearchTerm}
                              onChange={(e) => setPrizeSearchTerm(e.target.value)}
                              onFocus={(e) => {
                                setTimeout(() => {
                                  e.target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                                }, 300);
                              }}
                              placeholder="Buscar por ticket o cliente..."
                              className="w-full bg-gray-800 border border-gray-700 text-white rounded p-2 text-xs outline-none focus:border-orange-500"
                            />
                            {prizeSearchTerm && (
                              <button
                                type="button"
                                onClick={() => setPrizeSearchTerm('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-xs bg-gray-700 px-1.5 py-0.5 rounded"
                              >
                                Limpiar
                              </button>
                            )}
                          </div>

                          <p className="text-gray-400 text-[10px] mb-2 font-bold uppercase tracking-wider">Tickets disponibles:</p>
                          <div className="flex flex-col gap-2 max-h-40 overflow-y-auto pr-1">
                            {(() => {
                              const filtered = pendingPrizes.filter(p => 
                                String(p.ticket_number || '').includes(prizeSearchTerm) ||
                                p.ticket_id.split('-')[0].toLowerCase().includes(prizeSearchTerm.toLowerCase()) ||
                                (p.client || '').toLowerCase().includes(prizeSearchTerm.toLowerCase())
                              );

                              if (filtered.length === 0) {
                                return <p className="text-gray-500 text-xs text-center py-2">Ningún ticket coincide.</p>;
                              }

                              return filtered.map(p => (
                                <button
                                  key={p.ticket_id}
                                  type="button"
                                  onClick={() => setPayWithPrizeTicketId(p.ticket_id)}
                                  className={`w-full text-left p-2 rounded border text-xs transition-all ${
                                    payWithPrizeTicketId === p.ticket_id
                                      ? 'bg-orange-950/70 border-orange-500 text-orange-200'
                                      : 'bg-gray-800 border-gray-700 text-gray-300'
                                  }`}
                                >
                                  <div className="flex justify-between font-bold">
                                    <span>#{p.ticket_number || p.ticket_id.split('-')[0].toUpperCase()} — {p.client || 'General'}</span>
                                    <span className="text-emerald-400 font-mono">${p.remainingPrize.toFixed(2)}</span>
                                  </div>
                                  <div className="text-gray-500 mt-0.5 text-[10px]">{p.description}</div>
                                </button>
                              ));
                            })()}
                          </div>
                          {payWithPrizeTicketId && (() => {
                            const selected = pendingPrizes.find(p => p.ticket_id === payWithPrizeTicketId);
                            const saleTotal = calculateTotal();
                            const deducted = Math.min(saleTotal, selected?.remainingPrize || 0);
                            const cashNeeded = saleTotal - deducted;
                            return (
                              <div className="mt-3 p-2 bg-orange-950/40 rounded border border-orange-700/30 text-xs">
                                <div className="flex justify-between text-gray-400">
                                  <span>Total jugada:</span><span className="font-mono">${saleTotal.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-orange-300 mt-0.5">
                                  <span>Se descuenta del premio:</span><span className="font-mono">-${deducted.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-emerald-300 font-bold border-t border-orange-700/30 mt-1.5 pt-1.5">
                                  <span>Efectivo a cobrar:</span><span className="font-mono">${cashNeeded.toFixed(2)}</span>
                                </div>
                              </div>
                            );
                          })()}
                        </>
                      )}
                    </div>
                  )}
                </div>
             </div>

            <div className="p-4 bg-gray-900 border-t border-gray-700 text-center">
                <div className="flex justify-between items-center mb-4 bg-gray-800 p-3 rounded-lg border border-sky-900/50 shadow-inner">
                  <span className="text-gray-400 font-bold text-sm">TOTAL VENTA:</span>
                  <span className="text-3xl font-black text-sky-400 font-mono">${calculateTotal().toFixed(2)}</span>
                </div>
                
                {isBusy ? (
                   <div className="flex flex-col items-center justify-center py-6">
                     <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                     <p className="text-sky-400 font-bold mt-2 animate-pulse">Registrando en base de datos...</p>
                   </div>
                ) : (
                   <div className="flex flex-col gap-3">
                     <button 
                       onClick={() => processTransaction('share')}
                       className="w-full bg-[#10b981] active:bg-[#059669] text-white py-3 rounded-xl font-bold text-lg transition-colors flex justify-center items-center gap-2 shadow-lg"
                     >
                       GUARDAR Y COMPARTIR
                     </button>
                     
                     <button 
                       onClick={() => processTransaction('print')}
                       className="w-full bg-[#3b82f6] active:bg-[#2563eb] text-white py-3 rounded-xl font-bold text-lg transition-colors flex justify-center items-center gap-2 shadow-lg"
                     >
                       GUARDAR E IMPRIMIR
                     </button>
                     
                     <button 
                       onClick={() => processTransaction('save')}
                       className="w-full bg-[#475569] active:bg-[#334155] text-white py-3 rounded-xl font-bold text-[15px] transition-colors flex justify-center items-center gap-2"
                     >
                       SOLO GUARDAR
                     </button>
                   </div>
                )}
            </div>
          </div>
        </div>
      )}

      {/* TICKET FINALIZADO MODAL */}
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
                  onClick={async () => {
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
                             
                             localStorage.setItem('bt_printer_mac', targetMac);
                         } catch (e: any) {
                             alert("Error Bluetooth Nativo: " + (e.message || JSON.stringify(e)));
                             window.location.href = 'intent:' + encodeURIComponent(printedTicket) + '#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;';
                         }
                     } else {
                         window.location.href = 'intent:' + encodeURIComponent(printedTicket) + '#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;';
                     }
                  }}
                  className="w-full bg-blue-600 active:bg-blue-700 text-white py-4 rounded-lg flex gap-2 justify-center items-center font-bold text-[15px] shadow"
               >
                  <PrinterIcon size={20} /> {Capacitor.isNativePlatform() ? 'IMPRIMIR DIRECTO' : 'IMPRIMIR POR RAWBT'}
               </button>
               
               {confirmationMessage && (
                  <button 
                     onClick={async () => {
                        if (isDesktop) {
                           // En PC: copiar al portapapeles
                           try {
                              await navigator.clipboard.writeText(confirmationMessage);
                              const btn = document.getElementById('wa-copy-btn');
                              if (btn) {
                                 btn.textContent = '✅ COPIADO — Pégalo en WhatsApp';
                                 setTimeout(() => { btn.innerHTML = '<span style="display:flex;align-items:center;justify-content:center;gap:8px"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg> ENVIAR POR WHATSAPP</span>'; }, 2000);
                              }
                           } catch { /* fallback */ }
                        } else {
                           // En celular: abrir WhatsApp directamente
                           const url = `https://wa.me/?text=${encodeURIComponent(confirmationMessage)}`;
                           window.open(url, '_blank');
                        }
                     }}
                     id="wa-copy-btn"
                     className="w-full bg-green-600 active:bg-green-700 text-white py-3.5 rounded-lg flex gap-2 justify-center items-center font-bold text-sm shadow mb-1"
                  >
                     <MessageCircle size={18} /> ENVIAR POR WHATSAPP
                  </button>
                )}

                <div className="flex gap-3">
                 <button onClick={handleCopyTicket} className="flex-1 bg-gray-700 active:bg-gray-600 text-white py-3 rounded-lg flex gap-2 justify-center items-center font-bold text-sm shadow">
                   <Copy size={18} /> COPIAR
                 </button>
                 <button onClick={() => { setPrintedTicket(null); setConfirmationMessage(null); }} className="flex-1 bg-teal-500 active:bg-teal-400 text-white py-3 rounded-lg flex gap-2 justify-center items-center font-bold text-sm shadow text-shadow-sm">
                   <Plus size={18} /> NUEVA VENTA
                 </button>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE REPETIR JUGADA */}
      {showRepeatModal && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-gray-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-slide-up border border-gray-700 text-white">
            <div className="bg-gray-900 p-4 border-b border-gray-700 flex justify-between items-center">
               <h3 className="text-white font-bold text-lg flex items-center gap-2"><Copy size={18}/> Repetir Jugada Anterior</h3>
               <button onClick={() => setShowRepeatModal(false)} className="text-gray-500 active:text-white p-2 bg-gray-800 rounded-full">
                 <X size={20} />
               </button>
            </div>
            
            <div className="p-4 flex flex-col gap-3 bg-gray-800 flex-1 overflow-y-auto no-scrollbar">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Buscar cliente por nombre..."
                  value={searchClientName}
                  onChange={(e) => setSearchClientName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSearchTickets(searchClientName);
                    }
                  }}
                  className="flex-1 bg-gray-900 border border-gray-700 text-white rounded p-2 text-sm outline-none focus:border-teal-500 placeholder-gray-600"
                />
                <button
                  onClick={() => handleSearchTickets(searchClientName)}
                  className="bg-teal-600 hover:bg-teal-500 text-white px-4 py-2 rounded text-sm font-bold transition-colors"
                >
                  Buscar
                </button>
              </div>

              {searchingTickets ? (
                <div className="text-center py-6 text-gray-400 font-bold animate-pulse">Buscando jugadas...</div>
              ) : (
                <div className="space-y-3 mt-2 overflow-y-auto flex-1 pr-1">
                  {matchingTickets.map((t) => (
                    <div key={t.id} className="bg-gray-900 p-3 rounded-lg border border-gray-705 flex flex-col gap-2 shadow-sm">
                      <div className="flex justify-between items-center border-b border-gray-800 pb-1.5">
                        <span className="text-teal-400 font-bold text-sm">Cliente: {t.client_name || 'General'}</span>
                        <span className="text-gray-500 text-xs">{new Date(t.created_at).toLocaleDateString('es-ES')}</span>
                      </div>
                      
                      {/* Sorteos en este ticket */}
                      <div className="text-[11px] text-gray-400 font-sans flex flex-wrap gap-1">
                        <span className="font-bold text-teal-500/80">Sorteos:</span>
                        <span>
                          {Array.from(new Set(t.ticket_numbers?.map((n: any) => n.draw_id) || []))
                            .map(drawId => {
                              const lot = store.lotteriesMaster.find(l => l.id === drawId);
                              return lot ? lot.name : drawId;
                            })
                            .join(', ') || 'Ninguno'
                          }
                        </span>
                      </div>
                      
                      <div className="flex flex-wrap gap-2 text-xs font-mono">
                        {t.ticket_numbers?.map((numObj: any, idx: number) => (
                          <span key={idx} className="bg-slate-800 text-slate-300 px-2 py-1 rounded">
                            {numObj.number_played} ({parseFloat(numObj.amount).toFixed(0)}v)
                          </span>
                        ))}
                      </div>
                      
                      <div className="flex justify-between items-center mt-1 pt-1.5 border-t border-gray-800/50">
                        <span className="text-gray-400 text-xs">Total: ${parseFloat(t.total_amount).toFixed(2)}</span>
                        <button
                          onClick={() => handleLoadTicket(t)}
                          className="bg-teal-600 hover:bg-teal-500 text-white px-3 py-1 rounded text-xs font-bold transition-colors"
                        >
                          Cargar Jugada
                        </button>
                      </div>
                    </div>
                  ))}
                  {matchingTickets.length === 0 && (
                    <div className="text-center py-8 text-gray-500 italic">No se encontraron jugadas anteriores.</div>
                  )}
                </div>
              )}
            </div>
            
            <div className="p-3 bg-gray-900 border-t border-gray-700 text-right">
              <button
                onClick={() => setShowRepeatModal(false)}
                className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm font-bold transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE IMPORTAR JUGADA */}
      {showImportModal && (
<div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-gray-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-slide-up border border-gray-700 text-white">
            <div className="bg-gray-900 p-4 border-b border-gray-700 flex justify-between items-center">
               <h3 className="text-white font-bold text-lg flex items-center gap-2"><FileText size={18}/> Importar de WhatsApp</h3>
               <button onClick={() => { setShowImportModal(false); setImportText(''); }} className="text-gray-500 active:text-white p-2 bg-gray-800 rounded-full">
                 <X size={20} />
               </button>
            </div>
            
            <div className="p-4 flex flex-col gap-3 bg-gray-800 flex-1 overflow-y-auto no-scrollbar">
              <p className="text-xs text-gray-400 leading-relaxed">
                Pega el mensaje copiado de la aplicación del cliente (Jugadas Monazo) o una lista de números en formato manual (ej: <span className="font-mono text-teal-400">99x10</span> o <span className="font-mono text-teal-400">10 del 75</span>).
              </p>
              
              <div className="flex items-center gap-2 bg-gray-950/40 p-2.5 rounded-xl border border-gray-700/50">
                 <input
                   type="checkbox"
                   id="invert-import-order"
                   checked={invertImportOrder}
                   onChange={(e) => setInvertImportOrder(e.target.checked)}
                   className="w-4 h-4 text-teal-650 bg-gray-900 border-gray-700 rounded focus:ring-teal-500 focus:ring-2 cursor-pointer"
                 />
                 <label htmlFor="invert-import-order" className="text-xs font-bold text-gray-300 select-none cursor-pointer">
                   Invertir orden (Monto primero / Número después - ej: 2.15 o 2-15)
                 </label>
               </div>
              
              <textarea
                rows={10}
                placeholder="Pega el mensaje aquí..."
                value={importText}
                onFocus={(e) => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                onChange={(e) => setImportText(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 text-white rounded p-3 text-sm outline-none focus:border-teal-500 resize-none font-mono"
              />

              {parsedImport && (parsedImport.plays.length > 0 || parsedImport.clientName || parsedImport.detectedLotteries.length > 0) && (
                <div className="bg-gray-900 p-3 rounded-xl border border-gray-700 space-y-2.5 text-xs">
                  <h4 className="text-teal-400 font-bold uppercase tracking-wider text-[10px]">Previsualización detectada:</h4>
                  
                  {parsedImport.clientName && (
                    <div>
                      <span className="text-gray-400 font-medium">Cliente: </span>
                      <span className="font-bold text-white text-sm">{parsedImport.clientName}</span>
                    </div>
                  )}

                  {parsedImport.detectedLotteries.length > 0 && (
                    <div>
                      <span className="text-gray-400 font-medium">Sorteos detectados: </span>
                      <span className="font-bold text-yellow-500">
                        {parsedImport.detectedLotteries.map(l => l.name).join(', ')}
                      </span>
                    </div>
                  )}

                  {parsedImport.plays.length > 0 && (
                    <div>
                      <span className="text-gray-400 font-medium block mb-1">Jugadas ({parsedImport.plays.length}):</span>
                      <div className="flex flex-wrap gap-1.5 font-mono">
                        {parsedImport.plays.map((p, idx) => (
                          <span key={idx} className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                            {p.number} ({p.amount}v)
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {importText.trim() !== '' && parsedImport && parsedImport.plays.length === 0 && (
                <p className="text-center text-red-400 text-xs font-bold bg-red-950/20 py-2 rounded">
                  ⚠️ No se detectó ninguna jugada con formato válido.
                </p>
              )}
            </div>
            
            <div className="p-3 bg-gray-900 border-t border-gray-700 flex flex-col sm:flex-row justify-between gap-3">
              <button
                onClick={() => { setShowImportModal(false); setImportText(''); }}
                className="bg-gray-700 hover:bg-gray-650 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors"
              >
                Cancelar
              </button>
              <div className="flex gap-2 flex-1">
                <button
                  onClick={() => handleLoadImport(true)}
                  disabled={!parsedImport || parsedImport.plays.length === 0}
                  className="bg-sky-700/80 hover:bg-sky-600 disabled:bg-gray-800 disabled:text-gray-600 text-white px-3 py-2.5 rounded-xl text-xs lg:text-sm font-bold transition-colors flex-1 shadow-sm"
                >
                  Nuevo (Reemplazar)
                </button>
                <button
                  onClick={() => handleLoadImport(false)}
                  disabled={!parsedImport || parsedImport.plays.length === 0}
                  className="bg-teal-600 hover:bg-teal-500 disabled:bg-gray-800 disabled:text-gray-600 text-white px-3 py-2.5 rounded-xl text-xs lg:text-sm font-bold transition-colors flex-1 shadow-sm"
                >
                  Agregar a Lista Actual
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
