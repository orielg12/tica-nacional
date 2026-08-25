import { supabase } from '../utils/supabase';
import { useStore } from '../store/useStore';
import { formatAnimalDisplay } from '../utils/granjitaAnimals';
import { isGranjitaLottery } from '../utils/lotteryRules';
import { getPanamaLocalISODate } from '../utils/dateUtils';

export interface PendingWinner {
  key_id: string;
  ticket_id: string;
  ticket_number?: number;
  number: string;
  grossPrize: number;       // Premio bruto total ganado
  alreadyPaid: number;      // Lo que ya se pagó (en cash o en jugadas)
  remainingPrize: number;   // Lo que queda por pagar
  reimbursement: number;    // Cobertura externa
  client: string | null;
  description: string;
}

export async function fetchPendingWinners(vendorId: string): Promise<PendingWinner[]> {
  // 1. Fetch all active + paid tickets (paid could still have partial balance)
  const { data: tickets, error: tErr } = await supabase
    .from('tickets')
    .select('id, ticket_number, client_name, total_amount, created_at, status, ticket_numbers(id, draw_id, number_played, amount, covers(excess_amount))')
    .eq('vendor_id', vendorId)
    .eq('is_bank_prize', false)
    .in('status', ['active', 'paid']);


  if (tErr) throw tErr;
  if (!tickets || tickets.length === 0) return [];

  const dates = [...new Set(tickets.map((t: any) => getPanamaLocalISODate(new Date(t.created_at))))];

  // 2. Fetch results for those dates
  const { data: results, error: rErr } = await supabase
    .from('results')
    .select('draw_id, date, winning_number')
    .in('date', dates);

  if (rErr) throw rErr;

  // 3. Fetch all payouts for these tickets to calculate already-paid amounts
  const ticketIds = tickets.map((t: any) => t.id);
  const { data: payouts, error: pErr } = await supabase
    .from('payouts')
    .select('ticket_id, amount, paid_by')
    .in('ticket_id', ticketIds);

  if (pErr) throw pErr;

  // Build a map of paid amounts per ticket (excluding external bank reimbursements)
  const paidMap: Record<string, number> = {};
  payouts?.forEach((p: any) => {
    if (p.paid_by !== 'EXTERNAL_BANK_REIMBURSEMENT') {
      paidMap[p.ticket_id] = (paidMap[p.ticket_id] || 0) + parseFloat(p.amount || '0');
    }
  });

  // 4. Process matches
  const consolidated: Record<string, PendingWinner> = {};

  tickets.forEach((ticket: any) => {
    const ticketDate = getPanamaLocalISODate(new Date(ticket.created_at));

    const totalViles = ticket.ticket_numbers?.reduce((sum: number, tn: any) => sum + parseFloat(tn.amount || '0'), 0) || 1;
    const inferredMode = (ticket.total_amount / totalViles) >= 0.24 ? 0.25 : 0.20;

    ticket.ticket_numbers?.forEach((item: any) => {
      const result = results?.find((r: any) => r.draw_id === item.draw_id && r.date === ticketDate);
      if (!result) return;

      const [first, second, third] = result.winning_number.split('-');
      const numPlayed = String(item.number_played).trim();
      let prizeMultiplier = 0;
      const posArr: string[] = [];

      if (numPlayed === String(first).trim()) {
        prizeMultiplier += inferredMode === 0.25 ? 14 : 11;
        posArr.push('1er');
      }
      if (numPlayed === String(second).trim()) {
        prizeMultiplier += 3;
        posArr.push('2do');
      }
      if (numPlayed === String(third).trim()) {
        prizeMultiplier += 2;
        posArr.push('3er');
      }

      if (prizeMultiplier > 0) {
        const lotteryObj = useStore.getState().lotteriesMaster.find(l => l.id === item.draw_id);
        const lotteryName = lotteryObj?.name || item.draw_id;
        const isGranjita = isGranjitaLottery(lotteryObj);
        const awardAmount = parseFloat(item.amount) * prizeMultiplier;
        const pos = isGranjita ? 'Ganador' : posArr.join(' y ');
        const displayPlayed = isGranjita ? formatAnimalDisplay(item.number_played) : item.number_played;
        const desc = `${displayPlayed} (${pos} en ${lotteryName})`;

        let coveredAward = 0;
        if (item.covers && item.covers.length > 0) {
          const totalCoverForNumber = item.covers.reduce((sum: number, cov: any) => sum + parseFloat(cov.excess_amount || 0), 0);
          coveredAward = totalCoverForNumber * prizeMultiplier;
        }

        if (!consolidated[ticket.id]) {
          consolidated[ticket.id] = {
            key_id: ticket.id,
            ticket_id: ticket.id,
            ticket_number: ticket.ticket_number,
            number: item.number_played,
            grossPrize: 0,
            alreadyPaid: paidMap[ticket.id] || 0,
            remainingPrize: 0,
            reimbursement: 0,
            client: ticket.client_name,
            description: [] as any
          };
        } else {
          consolidated[ticket.id].number = 'Múltiple';
        }

        consolidated[ticket.id].grossPrize += awardAmount;
        consolidated[ticket.id].reimbursement += coveredAward;
        (consolidated[ticket.id].description as any).push(desc);
      }
    });
  });

  // Calculate remaining prize and filter out fully paid tickets
  const list: PendingWinner[] = [];
  Object.values(consolidated).forEach(c => {
    c.remainingPrize = Math.max(0, c.grossPrize - c.alreadyPaid);
    c.description = (c.description as any as string[]).join(' | ');
    if (c.remainingPrize > 0) {
      list.push(c);
    }
  });

  return list;
}
