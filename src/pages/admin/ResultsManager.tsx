import { getLocalISODate, getStartOfDayUTC, getEndOfDayUTC } from '../../utils/dateUtils';
import { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase';
import { formatLotteryTime, isGranjitaLottery } from '../../utils/lotteryRules';
import { GRANJITA_ANIMALS, formatAnimalDisplay } from '../../utils/granjitaAnimals';
import { useStore } from '../../store/useStore';
import { Printer, RefreshCw, Trophy, Zap, Trash2 } from 'lucide-react';
import { syncAutoResults } from '../../services/autoResultsService';

export default function ResultsManager() {
  const store = useStore();
  const [lotteryId, setLotteryId] = useState(store.lotteriesMaster[0]?.id || '1');
  const [selectedDate, setSelectedDate] = useState(getLocalISODate());
  const [prizes, setPrizes] = useState({ first: '', second: '', third: '' });
  const [historyFilterDate, setHistoryFilterDate] = useState('');
  const [historyFilterLottery, setHistoryFilterLottery] = useState('');
  const [loading, setLoading] = useState(false);
  const [dbResults, setDbResults] = useState<any[]>([]);
  const [syncingAuto, setSyncingAuto] = useState(false);
  const [autoSummaryModal, setAutoSummaryModal] = useState<any[] | null>(null);

  const handleAutoSyncAll = async () => {
    setSyncingAuto(true);
    try {
      const summary = await syncAutoResults(selectedDate);
      setAutoSummaryModal(summary);
      fetchCurrentWinningNumbers();
      fetchHistory();
      fetchPlays();
    } catch (e) {
      console.error("Auto sync error:", e);
      alert("No se pudo completar la sincronización automática.");
    } finally {
      setSyncingAuto(false);
    }
  };

  const handleDeleteResult = async (drawId: string, resDate: string) => {
    if (!confirm("¿Deseas eliminar este resultado registrado para permitir una nueva carga o corrección?")) return;
    try {
      setLoading(true);
      await supabase.from('results').delete().eq('draw_id', drawId).eq('date', resDate);
      fetchHistory();
      fetchCurrentWinningNumbers();
      fetchPlays();
      alert("Resultado eliminado correctamente.");
    } catch (e) {
      console.error("Error eliminando resultado:", e);
      alert("No se pudo eliminar el resultado.");
    } finally {
      setLoading(false);
    }
  };

  // States for real-time calculations
  const [plays, setPlays] = useState<any[]>([]);
  const [paletPlays, setPaletPlays] = useState<any[]>([]);
  const [loadingPlays, setLoadingPlays] = useState(false);
  const [payoutDetails, setPayoutDetails] = useState<any>({
    totalSales: 0,
    totalPrizes: 0,
    netBalance: 0,
    winnersCount: 0,
    winnersList: [],
    quinielaSales: 0,
    quinielaPrizes: 0,
    paletSales: 0,
    paletPrizes: 0
  });

  // Fetch all active plays for the selected date and lottery
  const fetchPlays = async () => {
    setLoadingPlays(true);
    try {
      const { data, error } = await supabase
        .from('ticket_numbers')
        .select('*, ticket:ticket_id(*, ticket_numbers(amount))')
        .eq('draw_id', lotteryId)
        .gte('created_at', getStartOfDayUTC(selectedDate))
        .lte('created_at', getEndOfDayUTC(selectedDate));
      
      if (!error && data) {
        // Filter out plays from cancelled tickets
        const activePlays = data.filter((tn: any) => tn.ticket && tn.ticket.status !== 'cancelled');
        setPlays(activePlays);
      } else {
        setPlays([]);
      }

      // Fetch Palet Plays for this draw & date
      const { data: pData } = await supabase
        .from('palet_plays')
        .select('*, palet_ticket:ticket_id(*)')
        .gte('created_at', getStartOfDayUTC(selectedDate))
        .lte('created_at', getEndOfDayUTC(selectedDate));

      if (pData) {
        const activePaletPlays = pData.filter((pp: any) => 
          pp.palet_ticket && 
          pp.palet_ticket.draw_id === lotteryId && 
          pp.palet_ticket.status !== 'cancelled'
        );
        setPaletPlays(activePaletPlays);
      } else {
        setPaletPlays([]);
      }
    } catch (e) {
      console.error("Error fetching plays:", e);
    } finally {
      setLoadingPlays(false);
    }
  };

  const fetchCurrentWinningNumbers = async () => {
    try {
      const { data, error } = await supabase
        .from('results')
        .select('winning_number')
        .eq('draw_id', lotteryId)
        .eq('date', selectedDate)
        .maybeSingle();

      if (!error && data && data.winning_number) {
        const [first, second, third] = data.winning_number.split('-');
        setPrizes({
          first: first || '',
          second: second || '',
          third: third || ''
        });
      } else {
        setPrizes({ first: '', second: '', third: '' });
      }
    } catch (e) {
      console.error("Error fetching current winning numbers:", e);
      setPrizes({ first: '', second: '', third: '' });
    }
  };

  const fetchHistory = async () => {
    try {
      let query = supabase
        .from('results')
        .select('*')
        .order('date', { ascending: false });

      if (historyFilterDate) {
        query = query.eq('date', historyFilterDate);
      }
      if (historyFilterLottery) {
        query = query.eq('draw_id', historyFilterLottery);
      }

      const { data, error } = await query.limit(50);
      if (!error && data) {
        setDbResults(data);
      }
    } catch (err) {
      console.error("Error fetching history from Supabase:", err);
    }
  };

  useEffect(() => {
    fetchPlays();
    fetchCurrentWinningNumbers();
  }, [selectedDate, lotteryId]);

  useEffect(() => {
    fetchHistory();
  }, [historyFilterDate, historyFilterLottery]);

  // Calculate prizes in real-time as the admin inputs the winning numbers
  useEffect(() => {
    const firstNum = prizes.first.trim();
    const secondNum = prizes.second.trim();
    const thirdNum = prizes.third.trim();
    
    let quinielaSales = 0;
    let quinielaPrizes = 0;
    let paletSales = 0;
    let paletPrizes = 0;
    const winnersMap: Record<string, any> = {};

    // 1. Evaluate Quinielas
    plays.forEach((play) => {
      // Infer saleMode for this ticket dynamically
      let playSaleMode = 0.20;
      if (play.ticket) {
        const allTicketNumbers = play.ticket.ticket_numbers || [];
        const totalViles = allTicketNumbers.reduce((sum: number, tn: any) => sum + parseFloat(tn.amount || '0'), 0) || 1;
        const totalAmount = parseFloat(play.ticket.total_amount) || 0;
        playSaleMode = (totalAmount / totalViles) >= 0.24 ? 0.25 : 0.20;
      }

      // Calculate sales for this bet (amount of viles * playSaleMode)
      const playSales = parseFloat(play.amount) * playSaleMode;
      quinielaSales += playSales;

      const numPlayed = String(play.number_played).trim();
      let multiplier = 0;
      const matchTiers: string[] = [];

      if (firstNum && numPlayed === firstNum) {
        multiplier += (playSaleMode === 0.25 ? 14 : 11);
        matchTiers.push("1er");
      }
      if (secondNum && numPlayed === secondNum) {
        multiplier += 3;
        matchTiers.push("2do");
      }
      if (thirdNum && numPlayed === thirdNum) {
        multiplier += 2;
        matchTiers.push("3er");
      }

      if (multiplier > 0) {
        const prize = parseFloat(play.amount) * multiplier;
        quinielaPrizes += prize;

        const ticketId = play.ticket_id;
        const client = play.ticket?.client_name || 'General';
        const vendor = play.ticket?.vendor_id || 'Anónimo';

        if (!winnersMap[ticketId]) {
          winnersMap[ticketId] = {
            ticketId,
            shortId: ticketId.split('-')[0].toUpperCase(),
            vendor,
            client,
            plays: []
          };
        }
        winnersMap[ticketId].plays.push({
          number: play.number_played,
          amount: play.amount,
          prize,
          tier: matchTiers.join(' y ')
        });
      }
    });

    // 2. Evaluate Palets
    paletPlays.forEach((pPlay) => {
      const amt = parseFloat(pPlay.amount || '0');
      paletSales += amt;

      const n1 = String(pPlay.num1).padStart(2, '0');
      const n2 = String(pPlay.num2).padStart(2, '0');
      let pPrize = 0;
      const pTiers: string[] = [];

      if (firstNum && secondNum) {
        if ((n1 === firstNum && n2 === secondNum) || (n1 === secondNum && n2 === firstNum)) {
          pPrize += amt * 500;
          pTiers.push("Palet 1ro-2do ($500)");
        }
      }
      if (secondNum && thirdNum) {
        if ((n1 === secondNum && n2 === thirdNum) || (n1 === thirdNum && n2 === secondNum)) {
          pPrize += amt * 100;
          pTiers.push("Palet 2do-3ro ($100)");
        }
      }
      if (firstNum && thirdNum) {
        if ((n1 === firstNum && n2 === thirdNum) || (n1 === thirdNum && n2 === firstNum)) {
          pPrize += amt * 500;
          pTiers.push("Palet 1ro-3ro ($500)");
        }
      }

      if (pPrize > 0) {
        paletPrizes += pPrize;
        const ticketId = pPlay.ticket_id;
        const client = pPlay.palet_ticket?.client_name || 'General';
        const vendor = pPlay.palet_ticket?.vendor_id || 'Anónimo';

        if (!winnersMap[ticketId]) {
          winnersMap[ticketId] = {
            ticketId,
            shortId: ticketId.split('-')[0].toUpperCase(),
            vendor,
            client,
            plays: []
          };
        }
        winnersMap[ticketId].plays.push({
          number: `PALET ${pPlay.numbers}`,
          amount: amt,
          prize: pPrize,
          tier: pTiers.join(' y ')
        });
      }
    });

    const totalSales = quinielaSales + paletSales;
    const totalPrizes = quinielaPrizes + paletPrizes;
    const winnersList = Object.values(winnersMap);

    setPayoutDetails({
      totalSales,
      totalPrizes,
      netBalance: totalSales - totalPrizes,
      winnersCount: winnersList.length,
      winnersList,
      quinielaSales,
      quinielaPrizes,
      paletSales,
      paletPrizes
    });
  }, [plays, paletPlays, prizes.first, prizes.second, prizes.third, store.saleMode]);

  const handleSubmit = async () => {
    const isGranjita = isGranjitaLottery(lotteryId);
    if (isGranjita) {
      if (!prizes.first) {
        alert("Debes seleccionar el animal ganador de La Granjita.");
        return;
      }
    } else {
      if (!prizes.first || !prizes.second || !prizes.third) {
        alert("Debes llenar los 3 números ganadores.");
        return;
      }
    }

    const winningNumStr = isGranjita ? prizes.first : `${prizes.first}-${prizes.second}-${prizes.third}`;
    setLoading(true);
    
    try {
      const { error } = await supabase.from('results').upsert({
        draw_id: lotteryId,
        date: selectedDate,
        winning_number: winningNumStr
      }, { onConflict: 'draw_id,date' });

      // ALWAYS SAVE LOCALLY PARA EL MODO OFFLINE
      store.addResult({
         id: `res-${Date.now()}`,
         lotteryId: lotteryId,
         date: selectedDate,
         winning_number: winningNumStr
      });

      if (!error) {
        alert("Resultados publicados con éxito en la Nube.");
      } else {
         console.warn("No Supabase connection.");
         alert("Resultados guardados en Memoria Local Offline.");
      }
      fetchPlays(); // Refresh plays
      fetchHistory(); // Refresh history
      
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrintResults = () => {
    const lotName = store.lotteriesMaster.find(l => l.id === lotteryId)?.name || lotteryId;
    const formattedDate = new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-ES');
    let text = `${store.ticketHeader}\n--------------------------------\nRESULTADOS DEL SORTEO\nFecha: ${formattedDate}\nLotería: ${lotName.toUpperCase()}\n--------------------------------\n`;
    text += `1er Premio: ${prizes.first || '--'}\n`;
    text += `2do Premio: ${prizes.second || '--'}\n`;
    text += `3er Premio: ${prizes.third || '--'}\n`;
    text += `--------------------------------\n`;
    text += `Total Vendido: $${payoutDetails.totalSales.toFixed(2)}\n`;
    text += `Premios a Pagar: $${payoutDetails.totalPrizes.toFixed(2)}\n`;
    text += `Balance Banca: $${payoutDetails.netBalance.toFixed(2)}\n`;
    text += `Tickets Ganadores: ${payoutDetails.winnersCount}\n`;
    text += `--------------------------------\n\n`;
    text += `${store.ticketFooter}\n\n\n\n\n\n`;

    let printDiv = document.getElementById('print-section');
    if (!printDiv) {
      printDiv = document.createElement('div');
      printDiv.id = 'print-section';
      printDiv.className = 'print-only';
      document.body.appendChild(printDiv);
    }
    printDiv.innerHTML = `<pre style="font-family:monospace;white-space:pre-wrap;font-size:14px;color:black;text-align:left;">${text}</pre>`;
    setTimeout(() => {
       window.print();
    }, 50);
  };

  return (
    <div style={{ padding: '2rem' }}>
      <header style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', color: '#17233D', margin: 0 }}>Carga de Resultados</h1>
          <p style={{ color: '#5b6b84', margin: '0.5rem 0 0' }}>Sube los números ganadores o sincroniza automáticamente de las loterías oficiales.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
          <button 
            onClick={handleAutoSyncAll} 
            disabled={syncingAuto}
            style={{ 
              display: 'flex', gap: '0.5rem', alignItems: 'center', 
              background: 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)', 
              border: 'none', color: '#ffffff', padding: '0.6rem 1.2rem', 
              borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold',
              boxShadow: '0 4px 10px rgba(234, 179, 8, 0.3)'
            }}
          >
             <Zap size={18} className={syncingAuto ? "animate-spin" : "animate-bounce"} /> 
             {syncingAuto ? "Sincronizando Premios..." : "⚡ Auto-Cargar Premios"}
          </button>

          <button onClick={() => { fetchPlays(); fetchCurrentWinningNumbers(); fetchHistory(); }} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: '#0d9488', border: 'none', color: '#ffffff', padding: '0.6rem 1.2rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
             <RefreshCw size={16} /> ↻ Actualizar
          </button>
        </div>
      </header>

      {/* Grid de Dos Columnas Principal */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem', alignItems: 'start' }}>
        
        {/* COLUMNA 1: Formulario de Carga */}
        <div className="surface" style={{ background: 'white', padding: '1.5rem', borderRadius: '10px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
          <h3 style={{ margin: '0 0 1.2rem', color: '#17233d', fontSize: '1.2rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>Registrar Ganadores</h3>
          
          <div style={{ marginBottom: '1.2rem' }}>
            <label style={{ display: 'block', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 'bold', color: '#8b9bb4', marginBottom: '0.4rem' }}>Fecha del Sorteo</label>
            <input 
              type="date" 
              value={selectedDate} 
              onChange={(e) => setSelectedDate(e.target.value)} 
              style={{ width: '100%', padding: '0.8rem', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontWeight: 'bold', background: '#f8fafc' }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 'bold', color: '#8b9bb4', marginBottom: '0.4rem' }}>Lotería Evaluada</label>
            <select 
              value={lotteryId}
              onChange={(e) => setLotteryId(e.target.value)}
              style={{ width: '100%', padding: '0.8rem', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontWeight: 'bold', background: '#f8fafc' }}
            >
              {store.lotteriesMaster.map(l => (
                <option key={l.id} value={l.id}>{l.name} - {formatLotteryTime(l.hour, l.minute)}</option>
              ))}
            </select>
          </div>
          
          {isGranjitaLottery(lotteryId) ? (
            <div style={{ marginBottom: '2rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', color: '#0d9488', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
                🐓 Animal Ganador (La Granjita)
              </label>
              <select
                value={prizes.first}
                onChange={(e) => setPrizes({ first: e.target.value, second: '', third: '' })}
                style={{ width: '100%', padding: '0.9rem', fontSize: '1.1rem', fontWeight: 'bold', borderRadius: '8px', border: '2px solid #0d9488', background: '#f0fdf4', outline: 'none', cursor: 'pointer' }}
              >
                <option value="">-- Selecciona el Animal Ganador --</option>
                {GRANJITA_ANIMALS.map(a => (
                  <option key={a.id} value={a.number}>
                    [{a.number}] {a.emoji} {a.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#16a34a', textTransform: 'uppercase', marginBottom: '0.4rem' }}>1er Premio</label>
                <input 
                  type="text" 
                  maxLength={2} 
                  value={prizes.first}
                  onChange={(e) => setPrizes(prev => ({...prev, first: e.target.value.replace(/\D/g, '')}))}
                  placeholder="00" 
                  style={{ width: '100%', padding: '0.8rem', fontSize: '1.5rem', fontWeight: 'bold', textAlign: 'center', borderRadius: '6px', border: '2px solid #16a34a', outline: 'none', background: '#f0fdf4' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#2563eb', textTransform: 'uppercase', marginBottom: '0.4rem' }}>2do Premio</label>
                <input 
                  type="text" 
                  maxLength={2} 
                  value={prizes.second}
                  onChange={(e) => setPrizes(prev => ({...prev, second: e.target.value.replace(/\D/g, '')}))}
                  placeholder="00" 
                  style={{ width: '100%', padding: '0.8rem', fontSize: '1.5rem', fontWeight: 'bold', textAlign: 'center', borderRadius: '6px', border: '2px solid #2563eb', outline: 'none', background: '#eff6ff' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', marginBottom: '0.4rem' }}>3er Premio</label>
                <input 
                  type="text" 
                  maxLength={2} 
                  value={prizes.third}
                  onChange={(e) => setPrizes(prev => ({...prev, third: e.target.value.replace(/\D/g, '')}))}
                  placeholder="00" 
                  style={{ width: '100%', padding: '0.8rem', fontSize: '1.5rem', fontWeight: 'bold', textAlign: 'center', borderRadius: '6px', border: '2px solid #cbd5e1', outline: 'none', background: '#f8fafc' }}
                />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.8rem' }}>
            <button 
              onClick={handleSubmit}
              disabled={loading}
              style={{ flex: 2, background: '#10b981', color: 'white', border: 'none', padding: '0.9rem', fontSize: '1.1rem', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer', boxShadow: '0 4px 6px rgba(16,185,129,0.2)' }}
            >
              {loading ? 'Publicando...' : 'Publicar Resultados'}
            </button>
            <button 
              onClick={handlePrintResults}
              disabled={!prizes.first}
              style={{ flex: 1, background: '#3b82f6', color: 'white', border: 'none', padding: '0.9rem', borderRadius: '6px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.4rem', fontWeight: 'bold' }}
              title="Imprimir ticket de resultados"
            >
              <Printer size={20} />
            </button>
          </div>
        </div>

        {/* COLUMNA 2: Detalles de Ganadores de la Banca (Tiempo Real) */}
        <div className="surface" style={{ background: '#1e293b', color: 'white', padding: '1.5rem', borderRadius: '10px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', border: '1px solid #334155' }}>
          <h3 style={{ margin: '0 0 1.2rem', color: '#38bdf8', fontSize: '1.2rem', borderBottom: '1px solid #334155', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Trophy size={20} /> Balance y Premiados (Banca)
          </h3>

          {loadingPlays ? (
             <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', fontWeight: 'bold' }}>Calculando apuntes...</div>
          ) : (
             <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                
                {/* Cuadros Rápidos de Métricas Financieras */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.8rem' }}>
                   <div style={{ background: '#0f172a', padding: '0.8rem', borderRadius: '8px', border: '1px solid #1e293b', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase' }}>Vendido</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 'black', color: '#38bdf8', marginTop: '0.2rem' }}>
                         ${payoutDetails.totalSales.toFixed(2)}
                      </div>
                   </div>
                   <div style={{ background: '#0f172a', padding: '0.8rem', borderRadius: '8px', border: '1px solid #1e293b', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase' }}>Premios</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 'black', color: '#f43f5e', marginTop: '0.2rem' }}>
                         ${payoutDetails.totalPrizes.toFixed(2)}
                      </div>
                   </div>
                   <div style={{ 
                      background: payoutDetails.netBalance >= 0 ? 'rgba(16,185,129,0.15)' : 'rgba(244,63,94,0.15)', 
                      padding: '0.8rem', 
                      borderRadius: '8px', 
                      border: payoutDetails.netBalance >= 0 ? '1px solid #10b981' : '1px solid #f43f5e',
                      textAlign: 'center' 
                   }}>
                      <div style={{ fontSize: '0.7rem', color: '#cbd5e1', fontWeight: 'bold', textTransform: 'uppercase' }}>Balance</div>
                      <div style={{ 
                         fontSize: '1.2rem', 
                         fontWeight: 'black', 
                         color: payoutDetails.netBalance >= 0 ? '#10b981' : '#f43f5e', 
                         marginTop: '0.2rem' 
                      }}>
                         ${payoutDetails.netBalance.toFixed(2)}
                      </div>
                   </div>
                </div>

                {/* DESGLOSE POR MODALIDAD (TIEMPOS VS PALETS) */}
                {(payoutDetails.paletSales > 0 || payoutDetails.paletPrizes > 0) && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', fontSize: '0.75rem' }}>
                    <div style={{ background: '#0f172a', padding: '0.6rem', borderRadius: '6px', border: '1px solid #334155' }}>
                      <div style={{ color: '#38bdf8', fontWeight: 'bold' }}>🎲 Tiempos:</div>
                      <div style={{ color: '#e2e8f0', marginTop: '0.2rem' }}>Ventas: ${payoutDetails.quinielaSales.toFixed(2)} | Premios: ${payoutDetails.quinielaPrizes.toFixed(2)}</div>
                    </div>
                    <div style={{ background: '#0f172a', padding: '0.6rem', borderRadius: '6px', border: '1px solid #334155' }}>
                      <div style={{ color: '#f59e0b', fontWeight: 'bold' }}>🎯 Palets:</div>
                      <div style={{ color: '#e2e8f0', marginTop: '0.2rem' }}>Ventas: ${payoutDetails.paletSales.toFixed(2)} | Premios: ${payoutDetails.paletPrizes.toFixed(2)}</div>
                    </div>
                  </div>
                )}

                <div style={{ background: '#0f172a', padding: '1rem', borderRadius: '8px', border: '1px solid #334155' }}>
                   <div style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 'bold' }}>Tickets Ganadores Encontrados:</div>
                   <div style={{ fontSize: '1.8rem', fontWeight: 'black', color: 'white', marginTop: '0.2rem' }}>
                      {payoutDetails.winnersCount} <span style={{ fontSize: '0.9rem', color: '#64748b' }}>de {new Set(plays.map(p=>p.ticket_id)).size} vendidos</span>
                   </div>
                </div>

                {/* Lista de Tickets Ganadores */}
                <div>
                   <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Desglose de Premiados</label>
                   <div style={{ maxHeight: '200px', overflowY: 'auto', background: '#0f172a', borderRadius: '8px', border: '1px solid #334155', padding: '0.5rem' }} className="no-scrollbar">
                      {payoutDetails.winnersList.length === 0 ? (
                         <div style={{ fontStyle: 'italic', color: '#475569', fontSize: '0.85rem', textAlign: 'center', padding: '2rem' }}>
                            {prizes.first ? "Ningún ticket resultó ganador." : "Digita los premios a la izquierda para simular."}
                         </div>
                      ) : (
                         payoutDetails.winnersList.map((win: any, idx: number) => (
                            <div key={idx} style={{ padding: '0.6rem 0.5rem', borderBottom: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.8rem' }}>
                               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontWeight: 'bold', color: '#38bdf8', fontFamily: 'monospace' }}>Ticket #{win.shortId}</span>
                                  <span style={{ color: '#10b981', fontWeight: 'black' }}>
                                     +${win.plays.reduce((s: number, p: any) => s + p.prize, 0).toFixed(2)}
                                  </span>
                               </div>
                               <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '0.75rem' }}>
                                  <span>Cajero: <strong style={{ color: '#e2e8f0' }}>{win.vendor.toUpperCase()}</strong></span>
                                  <span>Cliente: <strong style={{ color: '#e2e8f0' }}>{win.client}</strong></span>
                                </div>
                                <div style={{ color: '#e2e8f0', fontSize: '0.75rem', fontStyle: 'italic', marginTop: '0.1rem' }}>
                                   {win.plays.map((p: any, pIdx: number) => (
                                      <span key={pIdx}>Jugó {p.number} ({p.amount}v) y gana {p.tier} ({p.prize}t){pIdx < win.plays.length - 1 ? ', ' : ''}</span>
                                   ))}
                                </div>
                            </div>
                         ))
                      )}
                   </div>
                </div>

             </div>
          )}
        </div>
        
      </div>

      {/* Historial de Resultados Guardados */}
      {dbResults.length > 0 && (
        <div className="surface" style={{ background: 'white', padding: '1.5rem', borderRadius: '10px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', marginTop: '2rem' }}>
           <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginBottom: '1.2rem' }}>
             <h3 style={{ margin: 0, color: '#17233d', fontSize: '1.2rem' }}>Historial General de Resultados</h3>
             <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 180px' }}>
                  <input 
                    type="date" 
                    value={historyFilterDate} 
                    onChange={(e) => setHistoryFilterDate(e.target.value)} 
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', background: '#f8fafc', fontWeight: 'bold' }}
                  />
                </div>
               <div style={{ flex: '1 1 180px' }}>
                 <select 
                   value={historyFilterLottery}
                   onChange={(e) => setHistoryFilterLottery(e.target.value)}
                   style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', background: '#f8fafc', height: '100%' }}
                 >
                   <option value="">Todos los sorteos</option>
                   {store.lotteriesMaster.map(l => (
                     <option key={l.id} value={l.id}>{l.name} - {formatLotteryTime(l.hour, l.minute)}</option>
                   ))}
                 </select>
               </div>
             </div>
           </div>
           <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#5b6b84', background: '#f8fafc' }}>
                  <th style={{ padding: '0.8rem' }}>Fecha</th>
                  <th style={{ padding: '0.8rem' }}>Lotería</th>
                  <th style={{ padding: '0.8rem' }}>Números Ganadores</th>
                  <th style={{ padding: '0.8rem', textAlign: 'center' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {dbResults.map((r, i) => {
                  const lotInfo = store.lotteriesMaster.find(l => l.id === r.draw_id || l.id === r.lotteryId);
                  const lotName = lotInfo ? `${lotInfo.name} (${formatLotteryTime(lotInfo.hour, lotInfo.minute)})` : (r.draw_id || r.lotteryId);
                  const isGranjita = isGranjitaLottery(r.draw_id || r.lotteryId);
                  const winningDisplay = isGranjita ? formatAnimalDisplay(r.winning_number) : r.winning_number;
                  const drawIdVal = r.draw_id || r.lotteryId;
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.8rem', color: '#1e293b' }}>{r.date}</td>
                      <td style={{ padding: '0.8rem', fontWeight: 'bold', color: '#1e293b' }}>{lotName}</td>
                      <td style={{ padding: '0.8rem', color: '#10b981', fontWeight: 800, fontSize: '1rem', fontFamily: 'monospace' }}>{winningDisplay}</td>
                      <td style={{ padding: '0.8rem', textAlign: 'center' }}>
                        <button
                          onClick={() => handleDeleteResult(drawIdVal, r.date)}
                          title="Eliminar este resultado para corregirlo o permitir recarga"
                          style={{
                            background: '#fee2e2',
                            border: '1px solid #fca5a5',
                            color: '#dc2626',
                            padding: '0.35rem 0.6rem',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            fontSize: '0.75rem',
                            fontWeight: 'bold'
                          }}
                        >
                          <Trash2 size={14} /> Borrar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
        </div>
      )}
      {/* MODAL RESUMEN AUTO-PREMIOS */}
      {autoSummaryModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#ffffff', borderRadius: '16px', maxWidth: '500px', width: '100%', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1.25rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800 }}>
              ⚡ Premiaciones Auto-Sincronizadas ({selectedDate})
            </h3>
            <div style={{ maxHeight: '320px', overflowY: 'auto', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {autoSummaryModal.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.8rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: '#1e293b' }}>{item.name}</div>
                    <div style={{ fontSize: '0.75rem', color: item.status === 'updated' ? '#15803d' : '#64748b' }}>{item.message}</div>
                  </div>
                  <div style={{ fontFamily: 'monospace', fontWeight: 'bold', fontSize: '0.95rem', background: item.winningNumber ? '#dcfce7' : '#f1f5f9', color: item.winningNumber ? '#15803d' : '#94a3b8', padding: '0.3rem 0.6rem', borderRadius: '6px' }}>
                    {item.winningNumber || '--'}
                  </div>
                </div>
              ))}
            </div>
            <button 
              onClick={() => setAutoSummaryModal(null)} 
              style={{ width: '100%', padding: '0.8rem', background: '#0d9488', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.95rem' }}
            >
              ACEPTAR Y REGRESAR
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
