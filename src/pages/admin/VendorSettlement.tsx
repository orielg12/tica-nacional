import { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase';
import { useStore } from '../../store/useStore';
import { getLocalISODate, getStartOfDayUTC, getEndOfDayUTC } from '../../utils/dateUtils';
import { 
  Calculator, 
  Printer, 
  Share2, 
  CheckCircle2, 
  Clock, 
  RefreshCw, 
  Calendar, 
  DollarSign, 
  Trophy, 
  TrendingUp, 
  User, 
  AlertCircle,
  Eye
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { BluetoothSerial } from '@e-is/capacitor-bluetooth-serial';
import TicketDetailsModal from '../../components/TicketDetailsModal';

interface VendorSummary {
  vendorId: string;
  vendorName: string;
  commissionPerc: number;
  validTicketsCount: number;
  cancelledTicketsCount: number;
  grossSales: number;
  cancelledAmount: number;
  commissionAmount: number;
  payoutsAmount: number;
  payoutsCount: number;
  netDue: number; // positive = vendor owes bank, negative = bank owes vendor
  isSettled: boolean;
  settledAt?: string;
  tickets: any[];
}

export default function VendorSettlement() {
  const store = useStore();
  const [selectedDate, setSelectedDate] = useState(() => getLocalISODate());
  const [loading, setLoading] = useState(false);
  const [summaries, setSummaries] = useState<VendorSummary[]>([]);
  const [selectedVendorFilter, setSelectedVendorFilter] = useState<string>('all');
  const [viewingTicketId, setViewingTicketId] = useState<string | null>(null);
  const [expandedVendor, setExpandedVendor] = useState<string | null>(null);

  // SubAdmin isolation
  const currentUser = store.currentUser;
  const isSubAdmin = currentUser?.isSubAdmin;
  const subAdminVendorIds = isSubAdmin
    ? store.users
        .filter(u => u.parentAdminId === currentUser?.username)
        .map(u => u.username)
        .concat(currentUser?.username || '')
    : null;

  // Local settlement cache key
  const getSettlementStorageKey = (date: string, vendorId: string) => `settled_${date}_${vendorId}`;

  const loadSettlementData = async () => {
    setLoading(true);
    try {
      // 1. Fetch all tickets for the selected day
      let query = supabase
        .from('tickets')
        .select('id, ticket_number, client_name, total_amount, status, created_at, vendor_id, ticket_numbers(amount, draw_id, number_played)')
        .gte('created_at', getStartOfDayUTC(selectedDate))
        .lte('created_at', getEndOfDayUTC(selectedDate))
        .order('created_at', { ascending: false });

      if (subAdminVendorIds && subAdminVendorIds.length > 0) {
        query = query.in('vendor_id', subAdminVendorIds);
      }

      const { data: ticketsData, error: tErr } = await query;
      if (tErr) throw tErr;

      const tickets = ticketsData || [];
      const ticketIds = tickets.map(t => t.id);

      // 2. Fetch payouts for these tickets
      const payoutsMap: Record<string, number> = {};
      const payoutsCountMap: Record<string, number> = {};

      if (ticketIds.length > 0) {
        // Chunk requests to avoid URL limits
        const chunks: string[][] = [];
        for (let i = 0; i < ticketIds.length; i += 30) {
          chunks.push(ticketIds.slice(i, i + 30));
        }

        const payoutResponses = await Promise.all(
          chunks.map(chunk =>
            supabase
              .from('payouts')
              .select('ticket_id, amount, paid_by')
              .in('ticket_id', chunk)
          )
        );

        payoutResponses.forEach(({ data }) => {
          if (data) {
            data.forEach((p: any) => {
              const tid = p.ticket_id;
              const amt = parseFloat(p.amount) || 0;
              payoutsMap[tid] = (payoutsMap[tid] || 0) + amt;
              payoutsCountMap[tid] = (payoutsCountMap[tid] || 0) + 1;
            });
          }
        });
      }

      // 3. Map users to commission & friendly name
      const usersMap: Record<string, any> = {};
      store.users.forEach(u => {
        if (u.username) usersMap[u.username.toLowerCase()] = u;
      });

      // 4. Group by vendor
      const vendorGroups: Record<string, {
        validTicketsCount: number;
        cancelledTicketsCount: number;
        grossSales: number;
        cancelledAmount: number;
        payoutsAmount: number;
        payoutsCount: number;
        tickets: any[];
      }> = {};

      // Seed with registered vendors so even vendors with 0 sales show up
      store.users
        .filter(u => u.role === 'Vendedor' || u.role === 'Admin')
        .filter(u => !isSubAdmin || u.parentAdminId === currentUser?.username || u.username === currentUser?.username)
        .forEach(u => {
          const vKey = (u.username || 'anonimo').toLowerCase();
          if (!vendorGroups[vKey]) {
            vendorGroups[vKey] = {
              validTicketsCount: 0,
              cancelledTicketsCount: 0,
              grossSales: 0,
              cancelledAmount: 0,
              payoutsAmount: 0,
              payoutsCount: 0,
              tickets: []
            };
          }
        });

      // Distribute tickets into vendor buckets
      tickets.forEach(t => {
        const vKey = (t.vendor_id || 'anonimo').toLowerCase();
        if (!vendorGroups[vKey]) {
          vendorGroups[vKey] = {
            validTicketsCount: 0,
            cancelledTicketsCount: 0,
            grossSales: 0,
            cancelledAmount: 0,
            payoutsAmount: 0,
            payoutsCount: 0,
            tickets: []
          };
        }

        vendorGroups[vKey].tickets.push(t);
        const amount = parseFloat(t.total_amount) || 0;

        if (t.status === 'cancelled') {
          vendorGroups[vKey].cancelledTicketsCount += 1;
          vendorGroups[vKey].cancelledAmount += amount;
        } else {
          vendorGroups[vKey].validTicketsCount += 1;
          vendorGroups[vKey].grossSales += amount;
          
          // Check if this valid ticket had prizes paid
          const ticketPayout = payoutsMap[t.id] || 0;
          if (ticketPayout > 0) {
            vendorGroups[vKey].payoutsAmount += ticketPayout;
            vendorGroups[vKey].payoutsCount += (payoutsCountMap[t.id] || 1);
          }
        }
      });

      // 5. Compile final VendorSummary array
      const list: VendorSummary[] = Object.entries(vendorGroups).map(([vKey, data]) => {
        const userObj = usersMap[vKey];
        const vendorName = userObj?.name || userObj?.username || vKey;
        const commissionPerc = userObj?.commission !== undefined ? Number(userObj.commission) : 10;
        
        const commissionAmount = data.grossSales * (commissionPerc / 100);
        const netDue = data.grossSales - commissionAmount - data.payoutsAmount;

        const settlementStored = localStorage.getItem(getSettlementStorageKey(selectedDate, vKey));
        const isSettled = !!settlementStored;

        return {
          vendorId: vKey,
          vendorName,
          commissionPerc,
          validTicketsCount: data.validTicketsCount,
          cancelledTicketsCount: data.cancelledTicketsCount,
          grossSales: data.grossSales,
          cancelledAmount: data.cancelledAmount,
          commissionAmount,
          payoutsAmount: data.payoutsAmount,
          payoutsCount: data.payoutsCount,
          netDue,
          isSettled,
          settledAt: settlementStored || undefined,
          tickets: data.tickets
        };
      });

      // Sort: active sellers first, then alphabetical
      list.sort((a, b) => {
        if (b.grossSales !== a.grossSales) return b.grossSales - a.grossSales;
        return a.vendorName.localeCompare(b.vendorName);
      });

      setSummaries(list);

    } catch (err) {
      console.error('Error cargando cuadre de vendedores:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettlementData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  // Toggle settled status
  const handleToggleSettled = (summary: VendorSummary) => {
    const key = getSettlementStorageKey(selectedDate, summary.vendorId);
    if (summary.isSettled) {
      if (window.confirm(`¿Reabrir el cuadre de ${summary.vendorName}? Se marcará como pendiente de cobro.`)) {
        localStorage.removeItem(key);
        setSummaries(prev => prev.map(s => s.vendorId === summary.vendorId ? { ...s, isSettled: false, settledAt: undefined } : s));
      }
    } else {
      const timeStr = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      const record = `Liquidado a las ${timeStr}`;
      localStorage.setItem(key, record);
      setSummaries(prev => prev.map(s => s.vendorId === summary.vendorId ? { ...s, isSettled: true, settledAt: record } : s));
    }
  };

  // Print Settlement Voucher
  const handlePrintSettlement = (summary: VendorSummary) => {
    const formattedDate = new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-ES', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    let text = `${store.ticketHeader}
================================
COMPROBANTE DE CUADRE / CIERRE
================================
Fecha: ${formattedDate}
Cajero: ${summary.vendorName.toUpperCase()}
Usuario: @${summary.vendorId}
--------------------------------
RESUMEN OPERATIVO:
Tickets Válidos: ${summary.validTicketsCount}
Tickets Anulados: ${summary.cancelledTicketsCount} ($${summary.cancelledAmount.toFixed(2)})
--------------------------------
(+) Venta Bruta:        $${summary.grossSales.toFixed(2)}
(-) Comisión (${summary.commissionPerc}%):     -$${summary.commissionAmount.toFixed(2)}
(-) Premios Pagados:    -$${summary.payoutsAmount.toFixed(2)}
--------------------------------
${summary.netDue >= 0 ? 'TOTAL A ENTREGAR:' : 'BANCA REEMBOLSA:'}
$${Math.abs(summary.netDue).toFixed(2)}
================================
Estado: ${summary.isSettled ? 'LIQUIDADO' : 'PENDIENTE DE ENTREGA'}
${summary.settledAt ? `(${summary.settledAt})\n` : ''}
Firma Cajero: __________________

Firma Admin:  __________________
================================
${store.ticketFooter}





`;

    if (Capacitor.isNativePlatform()) {
      const targetMac = localStorage.getItem('bt_printer_mac');
      if (targetMac) {
        BluetoothSerial.connect({ address: targetMac }).then(async () => {
          await BluetoothSerial.write({ address: targetMac, value: text });
          setTimeout(() => BluetoothSerial.disconnect({ address: targetMac }), 1000);
        }).catch(() => window.print());
        return;
      }
    }

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

  // Share via WhatsApp
  const handleShareWhatsApp = (summary: VendorSummary) => {
    const netTitle = summary.netDue >= 0 ? '💵 *TOTAL A ENTREGAR A BANCA:*' : '🏦 *REEMBOLSO A FAVOR DEL CAJERO:*';
    const text = `📊 *LIQUIDACIÓN DIARIA - ${store.ticketHeader || 'BANCA'}*
📅 *Fecha:* ${selectedDate}
👤 *Cajero:* ${summary.vendorName} (@${summary.vendorId})
-----------------------------------
📈 *Venta Bruta:* $${summary.grossSales.toFixed(2)} (${summary.validTicketsCount} tickets)
${summary.cancelledTicketsCount > 0 ? `🚫 *Anulados:* ${summary.cancelledTicketsCount} tickets ($${summary.cancelledAmount.toFixed(2)})\n` : ''}🤝 *Tu Comisión (${summary.commissionPerc}%):* -$${summary.commissionAmount.toFixed(2)}
🏆 *Premios Pagados:* -$${summary.payoutsAmount.toFixed(2)}
-----------------------------------
${netTitle} *$${Math.abs(summary.netDue).toFixed(2)}*
-----------------------------------
📌 *Estado:* ${summary.isSettled ? '✅ LIQUIDADO' : '⏳ PENDIENTE DE ENTREGA'}`;

    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  // Filtered summaries
  const displayedSummaries = summaries.filter(s => {
    if (selectedVendorFilter === 'all') return true;
    return s.vendorId === selectedVendorFilter;
  });

  // Global Totals
  const totalGrossSales = displayedSummaries.reduce((sum, s) => sum + s.grossSales, 0);
  const totalCommissions = displayedSummaries.reduce((sum, s) => sum + s.commissionAmount, 0);
  const totalPayouts = displayedSummaries.reduce((sum, s) => sum + s.payoutsAmount, 0);
  const totalNetRecaudar = displayedSummaries.reduce((sum, s) => sum + (s.netDue > 0 ? s.netDue : 0), 0);
  const totalNetReembolsar = displayedSummaries.reduce((sum, s) => sum + (s.netDue < 0 ? Math.abs(s.netDue) : 0), 0);
  const totalValidTickets = displayedSummaries.reduce((sum, s) => sum + s.validTicketsCount, 0);
  const totalCancelledTickets = displayedSummaries.reduce((sum, s) => sum + s.cancelledTicketsCount, 0);

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      
      {/* HEADER */}
      <header style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{ background: '#15803d', color: 'white', padding: '0.5rem', borderRadius: '8px', display: 'flex' }}>
              <Calculator size={24} />
            </div>
            <h1 style={{ fontSize: '1.8rem', color: '#17233D', margin: 0, fontWeight: 800 }}>Cuadre por Vendedor</h1>
          </div>
          <p style={{ color: '#5b6b84', margin: '0.4rem 0 0' }}>
            Liquidación neta diaria de cajeros: Venta Bruta − Comisión − Premios Pagados = Efectivo a Entregar.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button 
            onClick={() => setSelectedDate(getLocalISODate())}
            style={{ 
              background: selectedDate === getLocalISODate() ? '#0f766e' : '#f1f5f9', 
              color: selectedDate === getLocalISODate() ? 'white' : '#475569', 
              border: 'none', 
              padding: '0.6rem 1rem', 
              borderRadius: '8px', 
              cursor: 'pointer', 
              fontWeight: 'bold',
              fontSize: '0.85rem'
            }}
          >
            Hoy
          </button>
          
          <button 
            onClick={loadSettlementData} 
            disabled={loading}
            style={{ 
              display: 'flex', 
              gap: '0.5rem', 
              alignItems: 'center', 
              background: '#3b82f6', 
              border: 'none', 
              color: '#ffffff', 
              padding: '0.6rem 1.2rem', 
              borderRadius: '8px', 
              cursor: 'pointer', 
              fontWeight: 'bold',
              boxShadow: '0 2px 4px rgba(59,130,246,0.2)'
            }}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> 
            {loading ? 'Calculando...' : 'Actualizar'}
          </button>
        </div>
      </header>

      {/* FILTROS DE OPERACIÓN */}
      <div style={{ 
        display: 'flex', 
        gap: '1rem', 
        marginBottom: '2rem', 
        background: 'white', 
        padding: '1.2rem', 
        borderRadius: '12px', 
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)', 
        border: '1px solid #e2e8f0', 
        flexWrap: 'wrap',
        alignItems: 'flex-end'
      }}>
        <div style={{ flex: '1 1 200px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', textTransform: 'uppercase', fontSize: '0.72rem', fontWeight: 800, color: '#64748b', marginBottom: '0.4rem' }}>
            <Calendar size={14} /> Fecha de Liquidación
          </label>
          <input 
            type="date" 
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontWeight: 'bold', color: '#1e293b', background: '#f8fafc' }}
          />
        </div>

        <div style={{ flex: '1 1 250px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', textTransform: 'uppercase', fontSize: '0.72rem', fontWeight: 800, color: '#64748b', marginBottom: '0.4rem' }}>
            <User size={14} /> Filtrar Vendedor
          </label>
          <select 
            value={selectedVendorFilter}
            onChange={e => setSelectedVendorFilter(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontWeight: 'bold', color: '#1e293b', background: '#f8fafc' }}
          >
            <option value="all">TODOS LOS VENDEDORES ({summaries.length})</option>
            {summaries.map(s => (
              <option key={s.vendorId} value={s.vendorId}>
                {s.vendorName.toUpperCase()} — ${s.grossSales.toFixed(2)} vendidos
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* METRICAS TOTALES DE LA BANCA */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.2rem', marginBottom: '2rem' }}>
        
        <div style={{ background: 'white', padding: '1.2rem', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase' }}>
            <span>Venta Bruta Global</span>
            <TrendingUp size={16} color="#0284c7" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#0f172a', margin: '0.3rem 0' }}>
            ${totalGrossSales.toFixed(2)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
            {totalValidTickets} tickets activos {totalCancelledTickets > 0 && `(${totalCancelledTickets} anulados)`}
          </div>
        </div>

        <div style={{ background: 'white', padding: '1.2rem', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase' }}>
            <span>Comisiones Vendedores</span>
            <DollarSign size={16} color="#eab308" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#b45309', margin: '0.3rem 0' }}>
            ${totalCommissions.toFixed(2)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
            Ganancia retenida por cajeros
          </div>
        </div>

        <div style={{ background: 'white', padding: '1.2rem', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase' }}>
            <span>Premios Pagados en Calle</span>
            <Trophy size={16} color="#dc2626" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#dc2626', margin: '0.3rem 0' }}>
            ${totalPayouts.toFixed(2)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
            Pagados directamente al cliente
          </div>
        </div>

        <div style={{ background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)', color: 'white', padding: '1.2rem', borderRadius: '12px', boxShadow: '0 4px 12px rgba(21,128,61,0.25)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 0.85, fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            <span>Neto a Recaudar Hoy</span>
            <CheckCircle2 size={18} />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 900, margin: '0.3rem 0' }}>
            ${totalNetRecaudar.toFixed(2)}
          </div>
          <div style={{ fontSize: '0.75rem', opacity: 0.85 }}>
            {totalNetReembolsar > 0 ? `(Banca debe reembolsar $${totalNetReembolsar.toFixed(2)})` : 'Efectivo neto entregable'}
          </div>
        </div>

      </div>

      {/* TABLA PRINCIPAL DE CUADRE POR VENDEDOR */}
      <div style={{ background: 'white', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 10px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0' }}>
        
        <div style={{ padding: '1.2rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.8rem' }}>
          <div>
            <h3 style={{ margin: 0, color: '#1e293b', fontSize: '1.1rem', fontWeight: 800 }}>Liquidación por Cajero</h3>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{displayedSummaries.length} vendedores registrados</span>
          </div>
        </div>

        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', minWidth: '950px', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ background: '#f8fafc', color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              <tr>
                <th style={{ padding: '1rem', borderBottom: '2px solid #e2e8f0' }}>Vendedor / Cajero</th>
                <th style={{ padding: '1rem', borderBottom: '2px solid #e2e8f0', textAlign: 'center' }}>Tickets</th>
                <th style={{ padding: '1rem', borderBottom: '2px solid #e2e8f0', textAlign: 'right' }}>(+) Venta Bruta</th>
                <th style={{ padding: '1rem', borderBottom: '2px solid #e2e8f0', textAlign: 'right' }}>(-) Comisión</th>
                <th style={{ padding: '1rem', borderBottom: '2px solid #e2e8f0', textAlign: 'right' }}>(-) Premios Pagados</th>
                <th style={{ padding: '1rem', borderBottom: '2px solid #e2e8f0', textAlign: 'right' }}>(=) Neto a Entregar</th>
                <th style={{ padding: '1rem', borderBottom: '2px solid #e2e8f0', textAlign: 'center' }}>Estado</th>
                <th style={{ padding: '1rem', borderBottom: '2px solid #e2e8f0', textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                    <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.5rem' }} />
                    <p style={{ margin: 0, fontWeight: 'bold' }}>Calculando liquidaciones del servidor...</p>
                  </td>
                </tr>
              ) : displayedSummaries.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                    <AlertCircle size={28} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
                    <p style={{ margin: 0, fontWeight: 'bold' }}>No se registraron ventas ni tickets en esta fecha.</p>
                  </td>
                </tr>
              ) : (
                displayedSummaries.map(s => {
                  const hasSales = s.grossSales > 0 || s.cancelledTicketsCount > 0 || s.payoutsAmount > 0;
                  const isExpanded = expandedVendor === s.vendorId;

                  return (
                    <tr 
                      key={s.vendorId} 
                      style={{ 
                        borderBottom: '1px solid #f1f5f9', 
                        background: s.isSettled ? '#f0fdf4' : (hasSales ? 'white' : '#f8fafc'),
                        transition: 'background-color 0.15s'
                      }}
                    >
                      {/* Vendedor */}
                      <td style={{ padding: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <div style={{ 
                            width: '36px', height: '36px', borderRadius: '50%', 
                            background: s.isSettled ? '#dcfce7' : '#e0f2fe', 
                            color: s.isSettled ? '#15803d' : '#0284c7', 
                            display: 'flex', alignItems: 'center', justifyContent: 'center', 
                            fontWeight: 900, fontSize: '0.9rem' 
                          }}>
                            {s.vendorName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.95rem' }}>
                              {s.vendorName}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                              @{s.vendorId}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Tickets (Válidos / Anulados) */}
                      <td style={{ padding: '1rem', textAlign: 'center' }}>
                        <div style={{ fontWeight: 800, color: '#1e293b' }}>
                          {s.validTicketsCount} válidos
                        </div>
                        {s.cancelledTicketsCount > 0 && (
                          <div style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: 'bold' }}>
                            {s.cancelledTicketsCount} anulado{s.cancelledTicketsCount > 1 ? 's' : ''} (${s.cancelledAmount.toFixed(2)})
                          </div>
                        )}
                      </td>

                      {/* Venta Bruta */}
                      <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 800, color: '#0f172a', fontSize: '1rem' }}>
                        ${s.grossSales.toFixed(2)}
                      </td>

                      {/* Comisión */}
                      <td style={{ padding: '1rem', textAlign: 'right' }}>
                        <div style={{ fontWeight: 800, color: '#b45309', fontSize: '0.95rem' }}>
                          -${s.commissionAmount.toFixed(2)}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#78350f' }}>
                          ({s.commissionPerc}%)
                        </div>
                      </td>

                      {/* Premios Pagados */}
                      <td style={{ padding: '1rem', textAlign: 'right' }}>
                        <div style={{ fontWeight: 800, color: s.payoutsAmount > 0 ? '#dc2626' : '#94a3b8', fontSize: '0.95rem' }}>
                          {s.payoutsAmount > 0 ? `-$${s.payoutsAmount.toFixed(2)}` : '$0.00'}
                        </div>
                        {s.payoutsCount > 0 && (
                          <div style={{ fontSize: '0.72rem', color: '#991b1b' }}>
                            ({s.payoutsCount} premio{s.payoutsCount > 1 ? 's' : ''})
                          </div>
                        )}
                      </td>

                      {/* Neto a Entregar */}
                      <td style={{ padding: '1rem', textAlign: 'right' }}>
                        {s.netDue > 0 ? (
                          <div>
                            <span style={{ 
                              background: '#dcfce7', color: '#15803d', 
                              padding: '0.35rem 0.75rem', borderRadius: '8px', 
                              fontWeight: 900, fontSize: '1.05rem', display: 'inline-block' 
                            }}>
                              +${s.netDue.toFixed(2)}
                            </span>
                            <div style={{ fontSize: '0.7rem', color: '#166534', fontWeight: 'bold', marginTop: '0.2rem' }}>
                              Cajero entrega
                            </div>
                          </div>
                        ) : s.netDue < 0 ? (
                          <div>
                            <span style={{ 
                              background: '#eff6ff', color: '#1d4ed8', 
                              padding: '0.35rem 0.75rem', borderRadius: '8px', 
                              fontWeight: 900, fontSize: '1.05rem', display: 'inline-block' 
                            }}>
                              -${Math.abs(s.netDue).toFixed(2)}
                            </span>
                            <div style={{ fontSize: '0.7rem', color: '#1e40af', fontWeight: 'bold', marginTop: '0.2rem' }}>
                              Banca reembolsa
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8', fontWeight: 800, fontSize: '0.95rem' }}>
                            $0.00
                          </span>
                        )}
                      </td>

                      {/* Estado */}
                      <td style={{ padding: '1rem', textAlign: 'center' }}>
                        <button
                          onClick={() => handleToggleSettled(s)}
                          style={{
                            background: s.isSettled ? '#dcfce7' : '#fff7ed',
                            color: s.isSettled ? '#15803d' : '#c2410c',
                            border: s.isSettled ? '1px solid #86efac' : '1px solid #fed7aa',
                            padding: '0.4rem 0.75rem',
                            borderRadius: '20px',
                            fontSize: '0.75rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                          }}
                          title={s.isSettled ? 'Clic para reabrir como pendiente' : 'Clic para marcar como liquidado'}
                        >
                          {s.isSettled ? <CheckCircle2 size={13} /> : <Clock size={13} />}
                          {s.isSettled ? 'LIQUIDADO' : 'PENDIENTE'}
                        </button>
                        {s.settledAt && (
                          <div style={{ fontSize: '0.68rem', color: '#15803d', marginTop: '0.2rem' }}>
                            {s.settledAt}
                          </div>
                        )}
                      </td>

                      {/* Acciones */}
                      <td style={{ padding: '1rem', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                          <button
                            onClick={() => handlePrintSettlement(s)}
                            style={{
                              background: '#f8fafc',
                              border: '1px solid #cbd5e1',
                              color: '#334155',
                              padding: '0.4rem 0.6rem',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontWeight: 'bold',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              fontSize: '0.75rem'
                            }}
                            title="Imprimir comprobante térmico"
                          >
                            <Printer size={14} /> Imprimir
                          </button>

                          <button
                            onClick={() => handleShareWhatsApp(s)}
                            style={{
                              background: '#25d366',
                              border: 'none',
                              color: 'white',
                              padding: '0.4rem 0.6rem',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontWeight: 'bold',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              fontSize: '0.75rem'
                            }}
                            title="Enviar resumen por WhatsApp al cajero"
                          >
                            <Share2 size={14} /> WhatsApp
                          </button>

                          {s.tickets.length > 0 && (
                            <button
                              onClick={() => setExpandedVendor(isExpanded ? null : s.vendorId)}
                              style={{
                                background: isExpanded ? '#0284c7' : '#f1f5f9',
                                border: '1px solid #cbd5e1',
                                color: isExpanded ? 'white' : '#475569',
                                padding: '0.4rem 0.6rem',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                fontSize: '0.75rem'
                              }}
                              title="Ver tickets de este vendedor"
                            >
                              <Eye size={14} /> {isExpanded ? 'Ocultar' : `Tickets (${s.tickets.length})`}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

      </div>

      {/* DETALLE DESPLEGABLE DE TICKETS DEL VENDEDOR SELECCIONADO */}
      {expandedVendor && (
        <div style={{ marginTop: '2rem', background: 'white', borderRadius: '12px', padding: '1.5rem', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.8rem' }}>
            <h4 style={{ margin: 0, color: '#0f172a', fontSize: '1.1rem', fontWeight: 800 }}>
              Tickets emitidos por @{expandedVendor} en la fecha ({displayedSummaries.find(s => s.vendorId === expandedVendor)?.tickets.length || 0})
            </h4>
            <button 
              onClick={() => setExpandedVendor(null)}
              style={{ background: '#f1f5f9', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem', color: '#64748b' }}
            >
              Cerrar lista
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.8rem' }}>
            {displayedSummaries.find(s => s.vendorId === expandedVendor)?.tickets.map(t => (
              <div 
                key={t.id}
                onClick={() => setViewingTicketId(t.id)}
                style={{
                  padding: '0.8rem',
                  borderRadius: '8px',
                  border: t.status === 'cancelled' ? '1px solid #fecaca' : '1px solid #e2e8f0',
                  background: t.status === 'cancelled' ? '#fef2f2' : '#f8fafc',
                  cursor: 'pointer',
                  transition: 'transform 0.1s, border-color 0.1s'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#0284c7', fontSize: '0.85rem' }}>
                    #{t.id.split('-')[0].toUpperCase()}
                  </span>
                  <span style={{ 
                    fontSize: '0.7rem', 
                    fontWeight: 800, 
                    padding: '0.15rem 0.4rem', 
                    borderRadius: '4px',
                    background: t.status === 'cancelled' ? '#fee2e2' : '#dcfce7',
                    color: t.status === 'cancelled' ? '#dc2626' : '#15803d'
                  }}>
                    {t.status === 'cancelled' ? 'ANULADO' : 'ACTIVO'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: '#64748b' }}>
                  <span>{new Date(t.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
                  <span style={{ fontWeight: 800, color: t.status === 'cancelled' ? '#dc2626' : '#0f172a', fontSize: '0.95rem' }}>
                    ${parseFloat(t.total_amount).toFixed(2)}
                  </span>
                </div>
                {t.client_name && (
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem' }}>
                    Cliente: <b>{t.client_name}</b>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL DETALLES DEL TICKET */}
      {viewingTicketId && (
        <TicketDetailsModal ticketId={viewingTicketId} onClose={() => setViewingTicketId(null)} />
      )}

    </div>
  );
}
