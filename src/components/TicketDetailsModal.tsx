import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { X, Loader, Share2, Gift } from 'lucide-react';
import { formatLotteryTime, isGranjitaLottery } from '../utils/lotteryRules';
import { formatAnimalDisplay } from '../utils/granjitaAnimals';
import { useStore } from '../store/useStore';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import html2canvas from 'html2canvas';

interface TicketDetailsModalProps {
  ticketId: string;
  onClose: () => void;
}

export default function TicketDetailsModal({ ticketId, onClose }: TicketDetailsModalProps) {
  const store = useStore();

  const [loading, setLoading] = useState(true);
  const [ticketData, setTicketData] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  useEffect(() => {
    if (!store.lotteriesMaster || store.lotteriesMaster.length === 0) {
      store.fetchLotteries();
    }
  }, []);

  useEffect(() => {
    const fetchInnerTicket = async () => {
      try {
        const { data, error } = await supabase.from('tickets').select('*, ticket_numbers(*)').eq('id', ticketId).single();
        if (!error && data) {
           setTicketData(data);
           setItems(data.ticket_numbers || []);
           
           const d = new Date(data.created_at);
           const ticketDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
           
           const { data: resData } = await supabase.from('results').select('*').eq('date', ticketDate);
           if (resData) setResults(resData);

           const { data: pData } = await supabase.from('payouts').select('*').eq('ticket_id', ticketId);
           if (pData) setPayouts(pData);
        }
      } catch(err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchInnerTicket();
  }, [ticketId]);

  const totalViles = items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0) || 1;
  const unitPrice = ticketData ? ((parseFloat(ticketData.total_amount) / totalViles) >= 0.24 ? 0.25 : 0.20) : 0.20;

  let totalPrizesWon = 0;
  const itemWins: Record<string, { tier: string, prize: number, multiplier: number, winNum: string, details: { tier: string, prize: number }[] }> = {};

  items.forEach(n => {
     const result = results.find(r => r.draw_id === n.draw_id);
     if (result && result.winning_number) {
        const [first, second, third] = result.winning_number.split('-');
        const numPlayed = String(n.number_played).trim();
        const tiempos = parseFloat(n.amount) || 0;

        let prizeMultiplier = 0;
        const details: { tier: string, prize: number }[] = [];

        if (numPlayed === String(first).trim()) {
           const mult = (unitPrice === 0.25 ? 14 : 11);
           prizeMultiplier += mult;
           details.push({ tier: '1er Premio', prize: tiempos * mult });
        }
        if (numPlayed === String(second).trim()) {
           prizeMultiplier += 3;
           details.push({ tier: '2do Premio', prize: tiempos * 3 });
        }
        if (numPlayed === String(third).trim()) {
           prizeMultiplier += 2;
           details.push({ tier: '3er Premio', prize: tiempos * 2 });
        }

        if (prizeMultiplier > 0) {
           const prize = tiempos * prizeMultiplier;
           const posStr = details.map(d => d.tier.replace(' Premio', '')).join(' y ') + ' Premio';
           itemWins[n.id] = { tier: posStr, prize, multiplier: prizeMultiplier, winNum: first || second || third, details };
           totalPrizesWon += prize;
        }
     }
  });

  const alreadyPaid = payouts.reduce((sum, p) => p.paid_by !== 'EXTERNAL_BANK_REIMBURSEMENT' ? sum + parseFloat(p.amount || 0) : sum, 0);
  const remainingPrize = Math.max(0, totalPrizesWon - alreadyPaid);

  const handleShareTicketImage = async () => {
    const captureElem = document.getElementById('ticket-receipt-capture');
    if (!captureElem || !ticketData) return;

    try {
      setIsGeneratingImage(true);

      const canvas = await html2canvas(captureElem, {
        scale: 3,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
      });

      const shortId = ticketId.split('-')[0].toUpperCase();
      const fileName = `ticket_${shortId}.png`;

      if (Capacitor.isNativePlatform()) {
        try {
          const base64Raw = canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
          await Filesystem.writeFile({ path: fileName, data: base64Raw, directory: Directory.Cache });
          const fileUriResult = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });
          await Share.share({ title: `Ticket #${shortId}`, text: `Ticket #${shortId}`, files: [fileUriResult.uri], dialogTitle: 'Compartir Ticket' });
          setIsGeneratingImage(false);
          return;
        } catch (nativeErr: any) {
          console.warn("Capacitor Filesystem/Share error, trying web fallback:", nativeErr);
        }
      }

      canvas.toBlob(async (blob) => {
        if (blob) {
          const file = new File([blob], fileName, { type: 'image/png' });
          if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
              await navigator.share({ files: [file], title: `Ticket #${shortId}`, text: `Ticket #${shortId}` });
              setIsGeneratingImage(false);
              return;
            } catch (e: any) {
              if (e.name !== 'AbortError') console.warn("navigator.share failed:", e);
              else { setIsGeneratingImage(false); return; }
            }
          }
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = fileName;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          alert('📷 Imagen del ticket guardada. ¡Ya puedes compartirla por WhatsApp!');
        }
        setIsGeneratingImage(false);
      }, 'image/png');

    } catch (err: any) {
      setIsGeneratingImage(false);
      console.error(err);
      alert('Error al generar la imagen del ticket: ' + (err.message || err));
    }
  };

  const getFlag = (name: string) => {
    const lower = (name || '').toLowerCase().trim();
    if (lower.includes('nica')) return '🇳🇮';
    if (lower.includes('honduras')) return '🇭🇳';
    if (lower.includes('tica')) return '🇨🇷';
    if (lower.includes('monazo')) return '🇨🇷';
    if (lower.includes('primera')) return '🇨🇷';
    if (lower.includes('nacional')) return '🇵🇦';
    if (lower.includes('anguilla')) return '🇦🇮';
    if (lower.includes('new york') || lower.includes('florida')) return '🇺🇸';
    if (lower.includes('granjita')) return '🐓';
    return '🇨🇷';
  };

  const handleSharePrizeMessage = async () => {
    if (!ticketData) return;

    // Aggregate wins per draw
    const winningDrawIds = [...new Set(items.filter(item => itemWins[item.id]).map(item => item.draw_id))];
    if (winningDrawIds.length === 0) return;

    const lines: string[] = [];
    lines.push('🎉 ¡Felicidades! Tienes un Premio 🎉');
    lines.push('');

    winningDrawIds.forEach(drawId => {
      const lotConfig = store.lotteriesMaster.find(l => l.id === drawId);
      const drawName = lotConfig?.name || String(drawId).toUpperCase();
      const drawTime = lotConfig ? formatLotteryTime(lotConfig.hour, lotConfig.minute) : '';
      const flag = getFlag(drawName);

      lines.push(`${flag} Sorteo: ${drawName}${drawTime ? ` ${drawTime}` : ''}`);

      // Jugaste line: [monto_jugado] al [numero_que_gano]
      const drawItems = items.filter(item => item.draw_id === drawId);
      const winningItemsForDraw = drawItems.filter(item => itemWins[item.id]);
      const isGranjita = isGranjitaLottery(lotConfig);

      const jugadasText = winningItemsForDraw.map(item => {
        const numDisp = isGranjita ? formatAnimalDisplay(item.number_played) : String(item.number_played).padStart(2, '0');
        const amtDisp = parseFloat(item.amount) || item.amount;
        return `${amtDisp} al ${numDisp}`;
      }).join(', ');

      lines.push(`🎫 Jugaste: ${jugadasText}`);

      // Premio line(s)
      winningItemsForDraw.forEach(item => {
        const win = itemWins[item.id];
        if (win && win.details) {
          win.details.forEach(d => {
            lines.push(`🏆 ${d.tier}: $${d.prize.toFixed(2)}`);
          });
        }
      });

      lines.push('');
    });

    lines.push(`💵 TOTAL GANADO: $${totalPrizesWon.toFixed(2)}`);

    const prizeMsg = lines.join('\n');
    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({ title: 'Premio', text: prizeMsg, dialogTitle: 'Compartir Premio' });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title: 'Premio', text: prizeMsg });
        return;
      }
      await navigator.clipboard.writeText(prizeMsg);
      alert('Mensaje de premio copiado al portapapeles.');
    } catch (e: any) {
      console.warn('Error sharing prize message:', e);
    }
  };

  // Group items by draw
  const groupedItems: Record<string, { lotteryName: string; timeStr: string; items: any[] }> = {};
  items.forEach(n => {
    const lotConfig = store.lotteriesMaster.find(l => l.id === n.draw_id);
    const lotName = lotConfig?.name || n.draw_id.toUpperCase();
    const lotTime = lotConfig ? formatLotteryTime(lotConfig.hour, lotConfig.minute) : '';
    if (!groupedItems[n.draw_id]) groupedItems[n.draw_id] = { lotteryName: lotName, timeStr: lotTime, items: [] };
    groupedItems[n.draw_id].items.push(n);
  });

  const shortId = ticketId.split('-')[0].toUpperCase();
  const ticketDate = ticketData ? new Date(ticketData.created_at) : null;

  // Format date compact: DD/MM/YYYY HH:MM
  const formatDate = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const isCancelled = ticketData?.status === 'cancelled';
  const isPaid = ticketData?.status === 'paid';
  const isWinner = totalPrizesWon > 0 || isPaid;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.7)',
      zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0.5rem',
      backdropFilter: 'blur(4px)'
    }}>
      <div style={{
        backgroundColor: '#fff',
        borderRadius: '14px',
        width: '100%',
        maxWidth: '400px',
        maxHeight: '96vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 25px 40px rgba(0,0,0,0.35)'
      }}>

        {/* ── HEADER ── */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0.65rem 1rem',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          color: '#fff',
          flexShrink: 0
        }}>
          <div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f8fafc' }}>Vista del Ticket</div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontFamily: 'monospace', fontWeight: 'bold' }}>
              #{shortId} {ticketDate ? `· ${formatDate(ticketDate)}` : ''}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px', lineHeight: 1 }}>
            <X size={22} />
          </button>
        </div>

        {/* ── STATUS BANNER ── */}
        {!loading && ticketData && (
          <>
            {isCancelled && (
              <div style={{ backgroundColor: '#dc2626', color: '#fff', padding: '0.4rem', textAlign: 'center', fontWeight: 'bold', fontSize: '0.82rem', flexShrink: 0 }}>
                ❌ TICKET ANULADO
              </div>
            )}
            {!isCancelled && isWinner && (
              <div style={{
                backgroundColor: isPaid ? '#2563eb' : '#16a34a',
                color: '#fff', padding: '0.4rem 0.8rem',
                textAlign: 'center', fontWeight: 'bold', fontSize: '0.82rem', flexShrink: 0,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <span>{isPaid ? '🎉 COBRADO' : '🏆 GANADOR'}</span>
                <span style={{ fontSize: '0.95rem' }}>PREMIO: ${totalPrizesWon.toFixed(2)}</span>
              </div>
            )}
          </>
        )}

        {/* ── BODY (scrollable) ── */}
        <div style={{ flex: 1, overflowY: 'auto', backgroundColor: '#f1f5f9', padding: '0.6rem' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
              <Loader size={28} style={{ margin: '0 auto', animation: 'spin 1s linear infinite' }} />
              <p style={{ marginTop: '0.8rem', fontSize: '0.85rem' }}>Cargando jugadas...</p>
            </div>
          ) : items.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', fontSize: '0.85rem' }}>
              Este ticket no contiene combinaciones válidas.
            </p>
          ) : (
            /* ── RECIBO (también capturado para compartir) ── */
            <div
              id="ticket-receipt-capture"
              style={{
                backgroundColor: '#ffffff',
                padding: '0.9rem 0.85rem',
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
                fontFamily: 'Courier New, Courier, monospace',
                color: '#111',
                maxWidth: '340px',
                margin: '0 auto',
              }}
            >
              {/* Cabecera recibo */}
              <div style={{ textAlign: 'center', marginBottom: '0.55rem' }}>
                <div style={{ fontSize: '1rem', fontWeight: 900, letterSpacing: '0.5px', marginBottom: '0.15rem' }}>
                  {(!store.ticketHeader || store.ticketHeader === 'TICKET DE VENTA' || /banca|oro/i.test(store.ticketHeader)) ? 'GO' : store.ticketHeader}
                </div>
                <div style={{ borderBottom: '1px dashed #000', margin: '0.35rem 0' }} />
                <div style={{ fontSize: '0.75rem', lineHeight: 1.5 }}>
                  <div>{ticketDate ? formatDate(ticketDate) : ''}</div>
                  <div style={{ fontWeight: 'bold' }}>#{shortId}</div>
                  {ticketData?.client_name && (
                    <div>Cliente: <strong>{ticketData.client_name.toUpperCase()}</strong></div>
                  )}
                </div>
                <div style={{ borderBottom: '1px dashed #000', margin: '0.35rem 0' }} />
              </div>

              {/* Jugadas agrupadas por sorteo */}
              {Object.entries(groupedItems).map(([drawId, group]) => (
                <div key={drawId} style={{ marginBottom: '0.6rem' }}>
                  {/* Nombre del sorteo */}
                  <div style={{ fontWeight: 'bold', fontSize: '0.78rem', textTransform: 'uppercase', marginBottom: '0.15rem' }}>
                    {group.lotteryName}{group.timeStr ? ` (${group.timeStr})` : ''}
                  </div>
                  <div style={{ borderBottom: '1px dashed #ccc', marginBottom: '0.2rem' }} />

                  {/* Encabezado columnas */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', fontSize: '0.68rem', fontWeight: 'bold', color: '#555', marginBottom: '0.1rem' }}>
                    <span>NÚM</span>
                    <span style={{ textAlign: 'center' }}>VILES</span>
                    <span style={{ textAlign: 'right' }}>VALOR</span>
                  </div>
                  <div style={{ borderBottom: '1px dashed #ccc', marginBottom: '0.25rem' }} />

                  {/* Filas de jugadas */}
                  {group.items.map(item => {
                    const isPalet = item.number_played && item.number_played.length === 4;
                    const amount = parseFloat(item.amount) || 0;
                    const totalCost = isPalet ? amount : amount * unitPrice;
                    const win = itemWins[item.id];

                    return (
                      <div key={item.id} style={{ marginBottom: '0.2rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', fontSize: '0.82rem', alignItems: 'center' }}>
                          <span style={{ fontWeight: 'bold' }}>
                            {isPalet ? `PAL ${item.number_played}` : item.number_played}
                          </span>
                          <span style={{ textAlign: 'center', color: '#444' }}>
                            {isPalet ? '—' : `${amount}v`}
                          </span>
                          <span style={{ textAlign: 'right', fontWeight: 'bold' }}>
                            ${totalCost.toFixed(2)}
                          </span>
                        </div>
                        {win && (
                          <div style={{
                            fontSize: '0.68rem', fontWeight: 'bold', color: '#166534',
                            backgroundColor: '#f0fdf4', padding: '1px 4px',
                            borderRadius: '3px', marginTop: '1px'
                          }}>
                            🏆 {win.tier} → ${win.prize.toFixed(2)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* Total */}
              <div style={{ borderTop: '1px dashed #000', paddingTop: '0.4rem', marginTop: '0.3rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '0.88rem' }}>
                  <span>TOTAL A PAGAR:</span>
                  <span>${parseFloat(ticketData?.total_amount || 0).toFixed(2)}</span>
                </div>
                {isWinner && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '0.88rem', color: '#166534', marginTop: '0.15rem' }}>
                      <span>PREMIO ACUMULADO:</span>
                      <span>${totalPrizesWon.toFixed(2)}</span>
                    </div>
                    {alreadyPaid > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '0.78rem', color: '#dc2626', marginTop: '0.1rem' }}>
                        <span>YA COBRADO:</span>
                        <span>-${alreadyPaid.toFixed(2)}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '0.88rem', color: '#047857', marginTop: '0.1rem' }}>
                      <span>PENDIENTE A COBRAR:</span>
                      <span>${remainingPrize.toFixed(2)}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Pie */}
              <div style={{ borderTop: '1px dashed #000', margin: '0.5rem 0 0.2rem 0' }} />
              <div style={{ textAlign: 'center', fontSize: '0.67rem', lineHeight: 1.5, color: '#555' }}>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                  {store.ticketFooter || 'REVISE SU TICKET\nSIN TICKET NO SE PAGA\nVÁLIDO POR 3 DÍAS\n* GRACIAS POR PREFERIRNOS *'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── BOTÓN COMPARTIR (siempre visible al fondo) ── */}
        {!loading && ticketData && !isCancelled && (
          <div style={{ padding: '0.55rem 0.8rem', backgroundColor: '#fff', borderTop: '1px solid #e2e8f0', flexShrink: 0 }}>
            <button
              onClick={handleShareTicketImage}
              disabled={isGeneratingImage}
              style={{
                width: '100%',
                backgroundColor: isGeneratingImage ? '#86efac' : '#25D366',
                color: 'white',
                border: 'none',
                padding: '0.65rem',
                borderRadius: '8px',
                cursor: isGeneratingImage ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                fontSize: '0.9rem',
                boxShadow: '0 2px 6px rgba(37,211,102,0.3)',
                transition: 'background-color 0.2s'
              }}
            >
              {isGeneratingImage
                ? <><Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /><span>Generando imagen...</span></>
                : <><Share2 size={18} /><span>Compartir Ticket</span></>
              }
            </button>
            {isWinner && (
              <button
                onClick={handleSharePrizeMessage}
                disabled={isGeneratingImage}
                style={{
                  width: '100%',
                  backgroundColor: '#ff9800',
                  color: 'white',
                  border: 'none',
                  padding: '0.65rem',
                  marginTop: '0.5rem',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  fontSize: '0.9rem',
                  boxShadow: '0 2px 6px rgba(255,152,0,0.3)',
                  transition: 'background-color 0.2s'
                }}
              >
                <Gift size={18} />
                <span>Compartir Premio</span>
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
