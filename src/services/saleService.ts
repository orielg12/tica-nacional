import { getLocalISODate, getStartOfDayUTC, getEndOfDayUTC } from '../utils/dateUtils';
import { supabase } from '../utils/supabase';
import { type CartItem } from '../store/useStore';
import { formatAnimalDisplay } from '../utils/granjitaAnimals';
import { isGranjitaLottery } from '../utils/lotteryRules';

export async function processSale(
  vendorId: string,
  clientName: string,
  totalAmount: number,
  cart: CartItem[],
  payWithPrizeTicketId?: string | null, // Optional: deduct cost from a winning ticket
  ticketDate?: string // Optional: target sale date (YYYY-MM-DD) for future sales
) {
  try {
    if (cart.length === 0) {
      throw new Error("El carrito está vacío.");
    }

    const targetDateStr = ticketDate || getLocalISODate();
    const now = new Date();
    let createdAtISO: string;
    if (ticketDate) {
      const [year, month, day] = ticketDate.split('-').map(Number);
      const targetDate = new Date(year, month - 1, day, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
      createdAtISO = targetDate.toISOString();
    } else {
      createdAtISO = now.toISOString();
    }

    // 1. Consult Limits from risk_limits table
    const { data: allRiskLimits } = await supabase
      .from('risk_limits')
      .select('number_played, max_limit');
      
    const globalLimitRecord = allRiskLimits?.find(r => r.number_played === 'GLOBAL_LIMIT');
    const limit = globalLimitRecord ? parseFloat(globalLimitRecord.max_limit) : 1000000;

    const hardLimitsMap: Record<string, number> = {};
    allRiskLimits?.forEach(r => {
      if (r.number_played && r.number_played !== 'GLOBAL_LIMIT') {
        hardLimitsMap[r.number_played] = parseFloat(r.max_limit);
      }
    });

    // 2. Fetch target date's accumulated plays for all selected numbers and lotteries in a single query
    const numbers = Array.from(new Set(cart.map(item => item.number)));
    const lotteryIds = Array.from(new Set(cart.flatMap(item => (item.lotteries || []).map(l => l.id))));

    const { data: todaysPlays, error: fetchPlaysError } = await supabase
      .from('ticket_numbers')
      .select('amount, draw_id, number_played')
      .in('draw_id', lotteryIds)
      .in('number_played', numbers)
      .gte('created_at', getStartOfDayUTC(targetDateStr))
      .lte('created_at', getEndOfDayUTC(targetDateStr));

    if (fetchPlaysError) {
      console.warn("Error fetching plays for limit check, defaulting to 0:", fetchPlaysError);
    }

    // Build a map of accumulated times played per lottery and number
    const accumulatedMap: Record<string, number> = {};
    todaysPlays?.forEach(play => {
      const key = `${play.draw_id}_${play.number_played}`;
      accumulatedMap[key] = (accumulatedMap[key] || 0) + parseFloat(play.amount);
    });

    // 3. Insert Ticket Header
    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .insert({
        vendor_id: vendorId || 'anon-vendor-000',
        client_name: clientName || null,
        total_amount: totalAmount,
        status: 'active',
        created_at: createdAtISO
      })
      .select('id')
      .single();

    if (ticketError) throw ticketError;
    const ticketId = ticket.id;

    // Get saleMode from store dynamically
    const { useStore } = await import('../store/useStore');
    const state = useStore.getState();
    const saleMode = state.saleMode || 0.20;

    // 4. Separate cart items into normal plays and palet plays
    const normalItems = cart.filter(i => !i.isPalet);
    const paletItems = cart.filter(i => i.isPalet);

    const tnInserts: any[] = [];
    
    for (const item of normalItems) {
      const lotteries = item.lotteries || [];
      if (lotteries.length === 0) throw new Error("Un número en el carrito no tiene sorteo asignado.");
      
      for (const lottery of lotteries) {
        const key = `${lottery.id}_${item.number}`;
        const currentAccumulated = accumulatedMap[key] || 0;
        
        const accumulatedDollars = currentAccumulated * saleMode;
        const itemDollars = item.amount * saleMode;
        
        // Check hard limits per animal or per number
        const isGranjita = isGranjitaLottery(lottery);
        const hardLimit = isGranjita 
          ? (hardLimitsMap[`ANIMAL_${item.number}`] ?? hardLimitsMap['ANIMAL_DEFAULT'])
          : (hardLimitsMap[item.number] ?? hardLimitsMap['NUMBER_DEFAULT']);

        if (hardLimit !== undefined && hardLimit > 0) {
          if (accumulatedDollars + itemDollars > hardLimit + 0.001) {
            const displayLabel = isGranjita ? formatAnimalDisplay(item.number) : `el número ${item.number}`;
            throw new Error(`⚠️ El límite para ${displayLabel} es de $${hardLimit.toFixed(2)}. Ya se han vendido $${accumulatedDollars.toFixed(2)} en el sorteo ${lottery.name}.`);
          }
        }

        const paddedNum = item.number.padStart(2, '0');
        const numberSpecificLimit = hardLimitsMap[`NUM_${paddedNum}`] ?? hardLimitsMap[paddedNum];
        const effectiveCoverLimit = numberSpecificLimit !== undefined ? numberSpecificLimit : limit;

        let coverAmountDollars = 0;
        if (accumulatedDollars + itemDollars > effectiveCoverLimit) {
           coverAmountDollars = (accumulatedDollars + itemDollars) - effectiveCoverLimit;
           if (coverAmountDollars > itemDollars) {
              coverAmountDollars = itemDollars;
           }
        }

        // Update local map to correctly calculate covers for subsequent identical numbers
        accumulatedMap[key] = currentAccumulated + item.amount;

        tnInserts.push({
          ticket_id: ticketId,
          draw_id: lottery.id,
          number_played: item.number,
          amount: item.amount,
          created_at: createdAtISO,
          _excess: coverAmountDollars // temporary field for matching covers
        });
      }
    }

    // 5. Batch Insert Ticket Numbers for normal plays (if any)
    let insertedTNs: any[] = [];
    if (tnInserts.length > 0) {
      const payload = tnInserts.map(({ _excess, ...rest }) => rest);
      const { data, error: tnError } = await supabase
        .from('ticket_numbers')
        .insert(payload)
        .select('id, draw_id, number_played, amount');

      if (tnError) throw tnError;
      insertedTNs = data || [];
    }

    // 5b. Insert Palet plays (if any)
    for (const pItem of paletItems) {
      const lotteries = pItem.lotteries || [];
      const numParts = pItem.number.split('-');
      const n1 = pItem.num1 || numParts[0] || '00';
      const n2 = pItem.num2 || numParts[1] || '00';

      for (const lottery of lotteries) {
        const { data: pTicket, error: pTicketErr } = await supabase
          .from('palet_tickets')
          .insert({
            vendor_id: vendorId || 'anon-vendor-000',
            client_name: clientName || null,
            draw_id: lottery.id,
            date: targetDateStr,
            created_at: createdAtISO,
            status: 'active',
            total_amount: pItem.amount
          })
          .select('id')
          .single();

        if (!pTicketErr && pTicket) {
          await supabase.from('palet_plays').insert({
            ticket_id: pTicket.id,
            numbers: `${n1}-${n2}`,
            num1: n1,
            num2: n2,
            amount: pItem.amount
          });
        }
      }
    }

    // 6. Batch Insert Covers (if any)
    const coversInserts: any[] = [];
    const telegramAlerts: Array<{ number: string, excess: number }> = [];

    // Map inserted ticket numbers by key
    const insertedMap: Record<string, string[]> = {};
    insertedTNs?.forEach((tn: any) => {
      const key = `${tn.draw_id}_${tn.number_played}`;
      if (!insertedMap[key]) {
        insertedMap[key] = [];
      }
      insertedMap[key].push(tn.id);
    });

    const usedIndices: Record<string, number> = {};
    tnInserts.forEach(insertedObj => {
      const excess = insertedObj._excess;
      if (excess > 0) {
        const key = `${insertedObj.draw_id}_${insertedObj.number_played}`;
        const ids = insertedMap[key];
        const index = usedIndices[key] || 0;
        if (ids && ids[index]) {
          coversInserts.push({
            ticket_number_id: ids[index],
            excess_amount: excess
          });
          telegramAlerts.push({
            number: insertedObj.number_played,
            excess: excess
          });
          usedIndices[key] = index + 1;
        }
      }
    });

    if (coversInserts.length > 0) {
      const { error: coversError } = await supabase
        .from('covers')
        .insert(coversInserts);
      if (coversError) {
        console.error("Error inserting covers in batch:", coversError);
      }
    }

    // 7. Send consolidated Telegram alerts asynchronously (in the background)
    if (telegramAlerts.length > 0) {
      const token = state.telegramToken || '8423828162:AAHt_SOIsO9a94LxPzdfbeqqvqj3tmZuX2A';
      const chatId = state.telegramChatId || '716975040';
      
      if (token && chatId) {
        let text = `🚨 <b>ALERTA DE RIESGO</b>\nEl vendedor <b>${vendorId}</b> realizó una venta.\nSe generaron los siguientes excesos pasados a la banca de respaldo:\n`;
        telegramAlerts.forEach(alert => {
          text += `- Número <b>${alert.number}</b>: Exceso de <b>$${alert.excess.toFixed(2)}</b>\n`;
        });
        
        fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: 'HTML'
          })
        }).catch(e => console.error("Error sending Telegram alert:", e));
      }
    }

    // 8. If paying with prize: register a partial payment against the winning ticket
    if (payWithPrizeTicketId && totalAmount > 0) {
      // Fetch the winning ticket's remaining prize to calculate the correct deduction
      const { fetchPendingWinners } = await import('./prizeService');
      const winners = await fetchPendingWinners(vendorId);
      const winnerInfo = winners.find(w => w.ticket_id === payWithPrizeTicketId);
      const prizeRemaining = winnerInfo?.remainingPrize || 0;
      const deductedAmount = Math.min(totalAmount, prizeRemaining);

      if (deductedAmount > 0) {
        const vendorDbId = state.currentUser?.id || vendorId;
        const { error: prizePayoutError } = await supabase.from('payouts').insert({
          ticket_id: payWithPrizeTicketId,
          amount: deductedAmount,
          paid_by: String(vendorDbId)
        });
        if (prizePayoutError) {
          console.error('Error registering prize deduction:', prizePayoutError);
        }

        // If the full prize was consumed, mark the winning ticket as paid
        if (deductedAmount >= prizeRemaining) {
          await supabase.from('tickets').update({ status: 'paid' }).eq('id', payWithPrizeTicketId);
        }
      }
    }

    return { success: true, ticketId };

  } catch (error) {
    console.error('Error procesando venta online:', error);
    throw error;
  }
}
