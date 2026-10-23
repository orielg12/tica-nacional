import { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '../../store/useStore';
import { supabase } from '../../utils/supabase';
import { getStartOfDayUTC, getEndOfDayUTC, getLocalISODate } from '../../utils/dateUtils';
import { Handshake, Download, FileSpreadsheet, TrendingUp, TrendingDown, DollarSign, PieChart, BarChart3, RefreshCw, ShieldCheck, AlertTriangle, CheckCircle2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';

// ── Tipos ──
interface MonthRow {
  month: string;        // 'Jun 2026'
  monthKey: string;     // '2026-06'
  gross: number;
  commissions: number;
  prizes: number;
  netBank: number;
  operatorCut: number;
  partnerCut: number;
  reinvestCut: number;
  ownerCut: number;
  tickets: number;
}

// ── Colores ──
const COLORS = {
  operador: '#10b981',    // verde
  socio:    '#8b5cf6',    // morado
  reinv:    '#3b82f6',    // azul
  dueno:    '#f59e0b',    // ámbar
  premios:  '#ef4444',    // rojo
  ventas:   '#0d9488',    // teal
  comision: '#6366f1',    // índigo
};

// ── SVG Pie Chart ──
function MiniPieChart({ slices, size = 180 }: { slices: { label: string; value: number; color: string }[]; size?: number }) {
  const total = slices.reduce((s, sl) => s + sl.value, 0);
  if (total <= 0) return <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>Sin datos</div>;

  const cx = size / 2, cy = size / 2, r = size / 2 - 6;
  let cumAngle = -Math.PI / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {slices.filter(s => s.value > 0).map((sl, i) => {
        const angle = (sl.value / total) * 2 * Math.PI;
        const x1 = cx + r * Math.cos(cumAngle);
        const y1 = cy + r * Math.sin(cumAngle);
        cumAngle += angle;
        const x2 = cx + r * Math.cos(cumAngle);
        const y2 = cy + r * Math.sin(cumAngle);
        const largeArc = angle > Math.PI ? 1 : 0;
        const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
        return <path key={i} d={d} fill={sl.color} stroke="#fff" strokeWidth="2" />;
      })}
      <circle cx={cx} cy={cy} r={r * 0.38} fill="#fff" />
    </svg>
  );
}

// ── SVG Bar Chart ──
function MiniBarChart({ data, height = 200 }: { data: { label: string; bars: { value: number; color: string }[] }[]; height?: number }) {
  if (data.length === 0) return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>Sin datos mensuales</div>;

  const allVals = data.flatMap(d => d.bars.map(b => b.value));
  const maxVal = Math.max(...allVals, 1);

  return (
    <div style={{ width: '100%', height }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${data.length * 80} ${height}`} preserveAspectRatio="none">
        {data.map((group, gi) => {
          const groupX = gi * 80;
          const barW = 70 / group.bars.length;
          return group.bars.map((bar, bi) => {
            const barH = maxVal > 0 ? (bar.value / maxVal) * (height - 30) : 0;
            return (
              <g key={`${gi}-${bi}`}>
                <rect
                  x={groupX + 5 + bi * barW}
                  y={height - 20 - barH}
                  width={barW - 2}
                  height={Math.max(barH, 0)}
                  fill={bar.color}
                  rx="2"
                />
              </g>
            );
          });
        })}
        {data.map((group, gi) => (
          <text key={`label-${gi}`} x={gi * 80 + 40} y={height - 4} textAnchor="middle" fontSize="9" fill="#64748b" fontWeight="bold">
            {group.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ── Componente principal ──
export default function PartnerReports() {
  const store = useStore();
  const {
    partnerModeActive,
    partnerCapital,
    partnerSplit,
    partnerReinvestPct,
    partnerOperatorCommissionPct
  } = store;

  const effectiveCapital = partnerCapital > 0 ? partnerCapital : 5000;
  const operatorPct = partnerOperatorCommissionPct ?? 10;
  const partnerPct = partnerSplit > 0 ? partnerSplit : 50;
  const reinvestPct = partnerReinvestPct ?? 0;
  const ownerPct = Math.max(0, 100 - partnerPct - reinvestPct);

  // Fechas: default desde 1 de junio hasta hoy
  const [startDate, setStartDate] = useState('2026-06-01');
  const [endDate, setEndDate] = useState(getLocalISODate());
  const [loading, setLoading] = useState(false);
  const [monthRows, setMonthRows] = useState<MonthRow[]>([]);
  const [totals, setTotals] = useState({ gross: 0, commissions: 0, prizes: 0, netBank: 0, operatorCut: 0, partnerCut: 0, reinvestCut: 0, ownerCut: 0, tickets: 0 });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Obtener todos los tickets paginados
      let allTickets: any[] = [];
      let from = 0;
      const step = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('tickets')
          .select('id, created_at, vendor_id, total_amount, status, ticket_numbers(amount)')
          .gte('created_at', getStartOfDayUTC(startDate))
          .lte('created_at', getEndOfDayUTC(endDate))
          .order('created_at', { ascending: false })
          .range(from, from + step - 1);
        if (error || !data || data.length === 0) break;
        allTickets.push(...data);
        if (data.length < step) break;
        from += step;
      }

      const activeTickets = allTickets.filter(t => t.status !== 'cancelled');
      const ticketIds = activeTickets.map(t => t.id);

      // Obtener payouts
      let allPayouts: any[] = [];
      const chunkSize = 100;
      for (let i = 0; i < ticketIds.length; i += chunkSize) {
        const chunk = ticketIds.slice(i, i + chunkSize);
        const { data } = await supabase
          .from('payouts')
          .select('ticket_id, amount, paid_by')
          .in('ticket_id', chunk);
        if (data) allPayouts.push(...data);
      }

      // Mapa de comisiones
      const commissionMap: Record<string, number> = {};
      const usernameMap: Record<string, string> = {};
      store.users.forEach(u => {
        if (u.username) {
          commissionMap[u.username] = u.commission;
          usernameMap[u.id.toString()] = u.username;
          usernameMap[u.username] = u.username;
        }
        commissionMap[u.id.toString()] = u.commission;
      });

      // Agrupar por mes
      const monthMap: Record<string, { gross: number; commissions: number; prizes: number; tickets: number }> = {};

      activeTickets.forEach(t => {
        const amount = parseFloat(t.total_amount) || 0;
        const created = new Date(t.created_at);
        const monthKey = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}`;

        if (!monthMap[monthKey]) monthMap[monthKey] = { gross: 0, commissions: 0, prizes: 0, tickets: 0 };
        monthMap[monthKey].gross += amount;
        monthMap[monthKey].tickets += 1;

        // Comisión del vendedor
        const rawVid = t.vendor_id?.toString() || '';
        const vid = usernameMap[rawVid] || rawVid;
        const commPct = commissionMap[vid] ?? commissionMap[rawVid] ?? 0;
        monthMap[monthKey].commissions += amount * (commPct / 100);
      });

      // Premios por mes
      allPayouts.forEach(p => {
        if (p.paid_by === 'EXTERNAL_BANK_REIMBURSEMENT') return;
        const ticket = activeTickets.find(t => t.id === p.ticket_id);
        if (!ticket) return;
        const created = new Date(ticket.created_at);
        const monthKey = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}`;
        if (!monthMap[monthKey]) monthMap[monthKey] = { gross: 0, commissions: 0, prizes: 0, tickets: 0 };
        monthMap[monthKey].prizes += parseFloat(p.amount) || 0;
      });

      // Construir rows
      const monthNames: Record<string, string> = {
        '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr', '05': 'May', '06': 'Jun',
        '07': 'Jul', '08': 'Ago', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic'
      };

      const rows: MonthRow[] = Object.entries(monthMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, val]) => {
          const [year, monthNum] = key.split('-');
          const netBank = val.gross - val.commissions - val.prizes;
          const operatorCutVal = val.gross * (operatorPct / 100);
          const netAfterOperator = netBank - operatorCutVal;
          const partnerCutVal = netAfterOperator > 0 ? netAfterOperator * (partnerPct / 100) : 0;
          const reinvestCutVal = netAfterOperator > 0 ? netAfterOperator * (reinvestPct / 100) : 0;
          const ownerCutVal = netAfterOperator > 0 ? netAfterOperator * (ownerPct / 100) : 0;

          return {
            month: `${monthNames[monthNum]} ${year}`,
            monthKey: key,
            gross: val.gross,
            commissions: val.commissions,
            prizes: val.prizes,
            netBank,
            operatorCut: operatorCutVal,
            partnerCut: partnerCutVal,
            reinvestCut: reinvestCutVal,
            ownerCut: ownerCutVal,
            tickets: val.tickets,
          };
        });

      setMonthRows(rows);

      // Totales
      const t = rows.reduce((acc, r) => ({
        gross: acc.gross + r.gross,
        commissions: acc.commissions + r.commissions,
        prizes: acc.prizes + r.prizes,
        netBank: acc.netBank + r.netBank,
        operatorCut: acc.operatorCut + r.operatorCut,
        partnerCut: acc.partnerCut + r.partnerCut,
        reinvestCut: acc.reinvestCut + r.reinvestCut,
        ownerCut: acc.ownerCut + r.ownerCut,
        tickets: acc.tickets + r.tickets,
      }), { gross: 0, commissions: 0, prizes: 0, netBank: 0, operatorCut: 0, partnerCut: 0, reinvestCut: 0, ownerCut: 0, tickets: 0 });

      setTotals(t);
    } catch (err) {
      console.error('Error fetching partner data:', err);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, operatorPct, partnerPct, reinvestPct, ownerPct]);

  useEffect(() => {
    fetchData();
  }, []);

  const handleRefresh = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchData(), 300);
  };

  // ── Exportar Excel ──
  const exportExcel = () => {
    const summaryData = [
      ['REPORTE DE SOCIO CAPITALISTA'],
      ['Período', `${startDate} → ${endDate}`],
      ['Capital de Respaldo', `$${effectiveCapital.toFixed(2)}`],
      ['Tu Comisión Operativa', `${operatorPct}%`],
      ['% del Socio sobre utilidad neta', `${partnerPct}%`],
      ['% Reinversión', `${reinvestPct}%`],
      ['% Dueño sobre utilidad neta', `${ownerPct}%`],
      [],
      ['RESUMEN GLOBAL'],
      ['Venta Bruta', `$${totals.gross.toFixed(2)}`],
      ['Comisiones Vendedores', `$${totals.commissions.toFixed(2)}`],
      ['Premios Pagados', `$${totals.prizes.toFixed(2)}`],
      ['Ganancia Neta Banca', `$${totals.netBank.toFixed(2)}`],
      [],
      ['DISTRIBUCIÓN'],
      [`Tu ${operatorPct}% Operación`, `$${totals.operatorCut.toFixed(2)}`],
      [`Socio ${partnerPct}%`, `$${totals.partnerCut.toFixed(2)}`],
      [`Reinversión ${reinvestPct}%`, `$${totals.reinvestCut.toFixed(2)}`],
      [`Dueño ${ownerPct}%`, `$${totals.ownerCut.toFixed(2)}`],
      [],
      ['TU GANANCIA TOTAL', `$${(totals.operatorCut + totals.ownerCut).toFixed(2)}`],
    ];

    const monthlyData = [
      ['Mes', 'Tickets', 'Venta Bruta', 'Comisiones', 'Premios', 'Neto Banca', `Operador (${operatorPct}%)`, `Socio (${partnerPct}%)`, `Reinversión (${reinvestPct}%)`, `Dueño (${ownerPct}%)`],
      ...monthRows.map(r => [
        r.month, r.tickets, r.gross.toFixed(2), r.commissions.toFixed(2), r.prizes.toFixed(2), r.netBank.toFixed(2), r.operatorCut.toFixed(2), r.partnerCut.toFixed(2), r.reinvestCut.toFixed(2), r.ownerCut.toFixed(2)
      ]),
      ['TOTAL', totals.tickets, totals.gross.toFixed(2), totals.commissions.toFixed(2), totals.prizes.toFixed(2), totals.netBank.toFixed(2), totals.operatorCut.toFixed(2), totals.partnerCut.toFixed(2), totals.reinvestCut.toFixed(2), totals.ownerCut.toFixed(2)],
    ];

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
    ws1['!cols'] = [{ wch: 35 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Resumen');

    const ws2 = XLSX.utils.aoa_to_sheet(monthlyData);
    ws2['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Mensual');

    XLSX.writeFile(wb, `Reporte_Socio_${startDate}_${endDate}.xlsx`);
  };

  // ── Exportar PDF ──
  const exportPDF = () => {
    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();

    // Header
    doc.setFillColor(23, 35, 61); // #17233D
    doc.rect(0, 0, pageW, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.text('REPORTE DE SOCIO CAPITALISTA', 14, 18);
    doc.setFontSize(10);
    doc.text(`Período: ${startDate}  →  ${endDate}`, 14, 28);

    doc.setTextColor(0, 0, 0);
    let y = 45;

    // Config
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('CONFIGURACIÓN', 14, y); y += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Capital de Respaldo: $${effectiveCapital.toFixed(2)}`, 14, y); y += 5;
    doc.text(`Comisión Operativa (tú): ${operatorPct}%   |   Socio: ${partnerPct}%   |   Reinversión: ${reinvestPct}%   |   Dueño: ${ownerPct}%`, 14, y); y += 10;

    // Resumen financiero
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('RESUMEN FINANCIERO', 14, y); y += 7;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');

    const summaryRows = [
      [`Tickets Procesados:`, `${totals.tickets}`],
      [`Venta Bruta:`, `$${totals.gross.toFixed(2)}`],
      [`Comisiones Vendedores:`, `-$${totals.commissions.toFixed(2)}`],
      [`Premios Pagados:`, `-$${totals.prizes.toFixed(2)}`],
      [`Ganancia Neta Banca:`, `$${totals.netBank.toFixed(2)}`],
    ];
    summaryRows.forEach(([label, val]) => {
      doc.text(label, 14, y);
      doc.text(val, 90, y);
      y += 5;
    });
    y += 5;

    // Distribución
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('DISTRIBUCIÓN DE UTILIDADES', 14, y); y += 7;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');

    const distRows = [
      [`Tu ${operatorPct}% Operación:`, `$${totals.operatorCut.toFixed(2)}`, COLORS.operador],
      [`Socio ${partnerPct}%:`, `$${totals.partnerCut.toFixed(2)}`, COLORS.socio],
      [`Reinversión ${reinvestPct}%:`, `$${totals.reinvestCut.toFixed(2)}`, COLORS.reinv],
      [`Dueño ${ownerPct}%:`, `$${totals.ownerCut.toFixed(2)}`, COLORS.dueno],
    ];
    distRows.forEach(([label, val]) => {
      doc.text(label, 14, y);
      doc.text(val, 90, y);
      y += 5;
    });
    y += 3;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(16, 185, 129);
    doc.text(`TU GANANCIA TOTAL: $${(totals.operatorCut + totals.ownerCut).toFixed(2)}`, 14, y);
    doc.setTextColor(139, 92, 246);
    doc.text(`GANANCIA SOCIO: $${totals.partnerCut.toFixed(2)}`, 110, y);
    y += 12;

    // Tabla mensual
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('DESGLOSE MENSUAL', 14, y); y += 7;

    // Headers tabla
    doc.setFontSize(7);
    doc.setFillColor(241, 245, 249);
    doc.rect(10, y - 4, pageW - 20, 7, 'F');
    const cols = ['Mes', 'Tickets', 'Bruto', 'Comisiones', 'Premios', 'Neto', `Oper ${operatorPct}%`, `Socio ${partnerPct}%`, `Reinv ${reinvestPct}%`, `Dueño ${ownerPct}%`];
    const colX = [12, 32, 48, 66, 84, 102, 120, 140, 157, 175];
    cols.forEach((c, i) => doc.text(c, colX[i], y));
    y += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    monthRows.forEach(r => {
      if (y > 275) { doc.addPage(); y = 20; }
      const vals = [r.month, `${r.tickets}`, `$${r.gross.toFixed(0)}`, `$${r.commissions.toFixed(0)}`, `$${r.prizes.toFixed(0)}`, `$${r.netBank.toFixed(0)}`, `$${r.operatorCut.toFixed(0)}`, `$${r.partnerCut.toFixed(0)}`, `$${r.reinvestCut.toFixed(0)}`, `$${r.ownerCut.toFixed(0)}`];
      // Color de fila según neto
      if (r.netBank >= 0) { doc.setTextColor(21, 128, 61); } else { doc.setTextColor(185, 28, 28); }
      vals.forEach((v, i) => doc.text(v, colX[i], y));
      doc.setTextColor(0, 0, 0);
      y += 5;
    });

    // Footer
    y += 5;
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`Generado: ${new Date().toLocaleString('es')}  |  Sistema GO Lottery`, 14, y);

    doc.save(`Reporte_Socio_${startDate}_${endDate}.pdf`);
  };

  // Datos para gráficos
  const pieSlices = [
    { label: `Operador ${operatorPct}%`, value: totals.operatorCut, color: COLORS.operador },
    { label: `Socio ${partnerPct}%`, value: totals.partnerCut, color: COLORS.socio },
    { label: `Reinversión ${reinvestPct}%`, value: totals.reinvestCut, color: COLORS.reinv },
    { label: `Dueño ${ownerPct}%`, value: totals.ownerCut, color: COLORS.dueno },
  ];

  const pieFlujoSlices = [
    { label: 'Comisiones Vendedores', value: totals.commissions, color: COLORS.comision },
    { label: 'Premios Pagados', value: totals.prizes, color: COLORS.premios },
    { label: 'Ganancia Neta', value: Math.max(totals.netBank, 0), color: COLORS.ventas },
  ];

  const barData = monthRows.map(r => ({
    label: r.month.slice(0, 3),
    bars: [
      { value: r.gross, color: COLORS.ventas },
      { value: r.prizes, color: COLORS.premios },
      { value: Math.max(r.netBank, 0), color: COLORS.operador },
    ]
  }));

  const payoutRatio = totals.gross > 0 ? ((totals.prizes / totals.gross) * 100) : 0;
  const isHealthy = totals.netBank > 0;
  const roiSocio = effectiveCapital > 0 ? ((totals.partnerCut / effectiveCapital) * 100) : 0;
  const tuGananciaTotal = totals.operatorCut + totals.ownerCut;

  // ── Card helper ──
  const StatCard = ({ label, value, icon, color, sub }: { label: string; value: string; icon: React.ReactNode; color: string; sub?: string }) => (
    <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '1.15rem', border: `1.5px solid ${color}22`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <div style={{ backgroundColor: `${color}18`, borderRadius: '8px', padding: '0.4rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
        <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>{label}</span>
      </div>
      <span style={{ fontSize: '1.55rem', fontWeight: 900, color, lineHeight: 1.1 }}>{value}</span>
      {sub && <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600 }}>{sub}</span>}
    </div>
  );

  return (
    <div style={{ padding: '2rem', backgroundColor: '#f4f7f6', minHeight: '100%', color: '#333' }}>

      {/* Banner de Modo Propuesta / Activación */}
      {!partnerModeActive && (
        <div style={{ backgroundColor: '#f5f3ff', border: '1.5px solid #8b5cf6', borderRadius: '10px', padding: '1rem 1.25rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Handshake size={24} color="#8b5cf6" />
            <div>
              <strong style={{ color: '#5b21b6', fontSize: '0.95rem' }}>Modo Propuesta para Inversionista ($5,000)</strong>
              <div style={{ fontSize: '0.78rem', color: '#6d28d9' }}>
                Estás viendo la simulación real de la sociedad con tus números desde el 1 de junio. Puedes descargar el informe en PDF o Excel para mostrárselo al socio.
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              store.updatePartnerConfig(true, effectiveCapital, partnerPct, reinvestPct, operatorPct);
              alert('¡Módulo de Socio activado oficialmente con los valores de la propuesta!');
            }}
            style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', backgroundColor: '#7c3aed', color: '#fff', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}
          >
            Activar Módulo Oficialmente
          </button>
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: '1rem 1.5rem', borderRadius: '10px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Handshake size={26} color="#8b5cf6" />
          <div>
            <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#17233D', fontWeight: 800 }}>Reportes de Socio</h2>
            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>División de ganancias y rendimiento de inversión</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem', fontWeight: 600 }} />
          <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>→</span>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem', fontWeight: 600 }} />
          <button onClick={handleRefresh} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.4rem 0.85rem', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#475569', fontSize: '0.8rem', fontWeight: 700, cursor: loading ? 'default' : 'pointer' }}>
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            {loading ? 'Cargando...' : 'Buscar'}
          </button>
        </div>
      </div>

      {/* ── Config Resumen ── */}
      <div style={{ backgroundColor: '#faf5ff', borderRadius: '10px', padding: '0.85rem 1.25rem', marginBottom: '1.25rem', border: '1.5px solid #ddd6fe', display: 'flex', gap: '1.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <ShieldCheck size={20} color="#8b5cf6" />
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#6d28d9' }}>Configuración Activa:</span>
        <span style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 600 }}>Capital: <strong style={{ color: '#17233D' }}>${effectiveCapital.toFixed(2)}</strong></span>
        <span style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 600 }}>Tu Operación: <strong style={{ color: COLORS.operador }}>{operatorPct}%</strong></span>
        <span style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 600 }}>Socio: <strong style={{ color: COLORS.socio }}>{partnerPct}%</strong></span>
        <span style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 600 }}>Reinversión: <strong style={{ color: COLORS.reinv }}>{reinvestPct}%</strong></span>
        <span style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 600 }}>Tú (Dueño): <strong style={{ color: COLORS.dueno }}>{ownerPct}%</strong></span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
          <RefreshCw size={32} style={{ animation: 'spin 1s linear infinite', marginBottom: '1rem' }} />
          <p>Cargando datos financieros del período...</p>
        </div>
      ) : (
        <>
          {/* ── Estado de la Banca ── */}
          <div style={{ 
            backgroundColor: isHealthy ? '#f0fdf4' : '#fef2f2', 
            borderRadius: '10px', padding: '0.85rem 1.25rem', marginBottom: '1.25rem', 
            border: `1.5px solid ${isHealthy ? '#86efac' : '#fca5a5'}`,
            display: 'flex', gap: '0.75rem', alignItems: 'center' 
          }}>
            {isHealthy ? <CheckCircle2 size={22} color="#16a34a" /> : <AlertTriangle size={22} color="#dc2626" />}
            <div>
              <span style={{ fontSize: '0.95rem', fontWeight: 800, color: isHealthy ? '#15803d' : '#b91c1c' }}>
                {isHealthy ? '✅ Banca Saludable — Generando Ganancias' : '⚠️ Banca en Rojo — Período con Pérdidas'}
              </span>
              <div style={{ fontSize: '0.75rem', color: isHealthy ? '#166534' : '#991b1b', marginTop: '0.15rem' }}>
                Retorno de premios: {payoutRatio.toFixed(1)}% 
                {payoutRatio < 70 ? ' (excelente)' : payoutRatio < 80 ? ' (saludable)' : payoutRatio < 90 ? ' (elevado)' : ' (peligroso)'}
                {' | '}Margen neto: {totals.gross > 0 ? ((totals.netBank / totals.gross) * 100).toFixed(1) : '0'}%
              </div>
            </div>
          </div>

          {/* ── Tarjetas Principales ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(195px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <StatCard label="Venta Bruta" value={`$${totals.gross.toFixed(2)}`} icon={<DollarSign size={18} color={COLORS.ventas} />} color={COLORS.ventas} sub={`${totals.tickets} tickets`} />
            <StatCard label="Premios Pagados" value={`$${totals.prizes.toFixed(2)}`} icon={<TrendingDown size={18} color={COLORS.premios} />} color={COLORS.premios} sub={`${payoutRatio.toFixed(1)}% de ventas`} />
            <StatCard label="Neto Banca" value={`$${totals.netBank.toFixed(2)}`} icon={isHealthy ? <TrendingUp size={18} color={COLORS.operador} /> : <TrendingDown size={18} color={COLORS.premios} />} color={isHealthy ? COLORS.operador : COLORS.premios} sub="Después de comisiones y premios" />
            <StatCard label={`Tu Ganancia Total`} value={`$${tuGananciaTotal.toFixed(2)}`} icon={<DollarSign size={18} color={COLORS.operador} />} color={COLORS.operador} sub={`${operatorPct}% oper. + ${ownerPct}% dueño`} />
            <StatCard label={`Ganancia Socio`} value={`$${totals.partnerCut.toFixed(2)}`} icon={<Handshake size={18} color={COLORS.socio} />} color={COLORS.socio} sub={`ROI: ${roiSocio.toFixed(1)}% sobre $${partnerCapital.toFixed(0)}`} />
            {reinvestPct > 0 && (
              <StatCard label={`Reinversión Banca`} value={`$${totals.reinvestCut.toFixed(2)}`} icon={<TrendingUp size={18} color={COLORS.reinv} />} color={COLORS.reinv} sub={`${reinvestPct}% para crecer`} />
            )}
          </div>

          {/* ── Gráficos ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
            
            {/* Pie de Distribución de Utilidad */}
            <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.03)', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <PieChart size={18} color="#8b5cf6" />
                <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#17233D', fontWeight: 700 }}>Distribución de Utilidad Neta</h4>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                <MiniPieChart slices={pieSlices} size={175} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {pieSlices.filter(s => s.value > 0).map((sl, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <div style={{ width: 12, height: 12, borderRadius: '3px', backgroundColor: sl.color, flexShrink: 0 }} />
                      <span style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 600 }}>{sl.label}</span>
                      <span style={{ fontSize: '0.82rem', color: '#17233D', fontWeight: 800, marginLeft: 'auto', paddingLeft: '0.5rem' }}>${sl.value.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Pie del Flujo del Dinero */}
            <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.03)', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <PieChart size={18} color="#0d9488" />
                <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#17233D', fontWeight: 700 }}>Flujo del Dinero (Venta Bruta)</h4>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                <MiniPieChart slices={pieFlujoSlices} size={175} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {pieFlujoSlices.filter(s => s.value > 0).map((sl, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <div style={{ width: 12, height: 12, borderRadius: '3px', backgroundColor: sl.color, flexShrink: 0 }} />
                      <span style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 600 }}>{sl.label}</span>
                      <span style={{ fontSize: '0.82rem', color: '#17233D', fontWeight: 800, marginLeft: 'auto', paddingLeft: '0.5rem' }}>${sl.value.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Bar chart mensual */}
            <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.03)', border: '1px solid #e2e8f0', gridColumn: monthRows.length > 3 ? 'span 2' : undefined }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <BarChart3 size={18} color="#3b82f6" />
                <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#17233D', fontWeight: 700 }}>Rendimiento Mensual</h4>
                <div style={{ display: 'flex', gap: '0.6rem', marginLeft: 'auto', fontSize: '0.68rem', fontWeight: 700 }}>
                  <span style={{ color: COLORS.ventas }}>■ Ventas</span>
                  <span style={{ color: COLORS.premios }}>■ Premios</span>
                  <span style={{ color: COLORS.operador }}>■ Neto</span>
                </div>
              </div>
              <MiniBarChart data={barData} height={180} />
            </div>
          </div>

          {/* ── Tabla Mensual Detallada ── */}
          <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.03)', marginBottom: '1.5rem', border: '1px solid #e2e8f0', overflowX: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h4 style={{ margin: 0, fontSize: '1rem', color: '#17233D', fontWeight: 700 }}>📊 Desglose Mensual Completo</h4>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={exportExcel} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 0.9rem', borderRadius: '8px', border: '1.5px solid #16a34a', backgroundColor: '#f0fdf4', color: '#15803d', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>
                  <FileSpreadsheet size={15} /> Descargar Excel
                </button>
                <button onClick={exportPDF} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 0.9rem', borderRadius: '8px', border: '1.5px solid #dc2626', backgroundColor: '#fef2f2', color: '#b91c1c', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>
                  <Download size={15} /> Descargar PDF
                </button>
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '0.65rem 0.5rem', color: '#475569', fontWeight: 700 }}>Mes</th>
                  <th style={{ textAlign: 'right', padding: '0.65rem 0.5rem', color: '#475569', fontWeight: 700 }}>Tickets</th>
                  <th style={{ textAlign: 'right', padding: '0.65rem 0.5rem', color: '#475569', fontWeight: 700 }}>Venta Bruta</th>
                  <th style={{ textAlign: 'right', padding: '0.65rem 0.5rem', color: '#475569', fontWeight: 700 }}>Comisiones</th>
                  <th style={{ textAlign: 'right', padding: '0.65rem 0.5rem', color: '#475569', fontWeight: 700 }}>Premios</th>
                  <th style={{ textAlign: 'right', padding: '0.65rem 0.5rem', color: '#475569', fontWeight: 700 }}>Neto Banca</th>
                  <th style={{ textAlign: 'right', padding: '0.65rem 0.5rem', color: COLORS.operador, fontWeight: 700 }}>Oper. {operatorPct}%</th>
                  <th style={{ textAlign: 'right', padding: '0.65rem 0.5rem', color: COLORS.socio, fontWeight: 700 }}>Socio {partnerPct}%</th>
                  {reinvestPct > 0 && <th style={{ textAlign: 'right', padding: '0.65rem 0.5rem', color: COLORS.reinv, fontWeight: 700 }}>Reinv. {reinvestPct}%</th>}
                  <th style={{ textAlign: 'right', padding: '0.65rem 0.5rem', color: COLORS.dueno, fontWeight: 700 }}>Dueño {ownerPct}%</th>
                </tr>
              </thead>
              <tbody>
                {monthRows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: i % 2 === 0 ? '#fff' : '#fafbfc' }}>
                    <td style={{ padding: '0.6rem 0.5rem', fontWeight: 700, color: '#17233D' }}>{r.month}</td>
                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', color: '#475569' }}>{r.tickets}</td>
                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', fontWeight: 700, color: '#17233D' }}>${r.gross.toFixed(2)}</td>
                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', color: '#64748b' }}>${r.commissions.toFixed(2)}</td>
                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', color: COLORS.premios, fontWeight: 600 }}>${r.prizes.toFixed(2)}</td>
                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', fontWeight: 800, color: r.netBank >= 0 ? '#15803d' : '#b91c1c' }}>${r.netBank.toFixed(2)}</td>
                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', fontWeight: 700, color: COLORS.operador }}>${r.operatorCut.toFixed(2)}</td>
                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', fontWeight: 700, color: COLORS.socio }}>${r.partnerCut.toFixed(2)}</td>
                    {reinvestPct > 0 && <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', fontWeight: 700, color: COLORS.reinv }}>${r.reinvestCut.toFixed(2)}</td>}
                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', fontWeight: 700, color: COLORS.dueno }}>${r.ownerCut.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2.5px solid #17233D', backgroundColor: '#f8fafc' }}>
                  <td style={{ padding: '0.7rem 0.5rem', fontWeight: 900, color: '#17233D', fontSize: '0.85rem' }}>TOTAL</td>
                  <td style={{ padding: '0.7rem 0.5rem', textAlign: 'right', fontWeight: 800, color: '#17233D' }}>{totals.tickets}</td>
                  <td style={{ padding: '0.7rem 0.5rem', textAlign: 'right', fontWeight: 900, color: '#17233D', fontSize: '0.85rem' }}>${totals.gross.toFixed(2)}</td>
                  <td style={{ padding: '0.7rem 0.5rem', textAlign: 'right', fontWeight: 700, color: '#64748b' }}>${totals.commissions.toFixed(2)}</td>
                  <td style={{ padding: '0.7rem 0.5rem', textAlign: 'right', fontWeight: 800, color: COLORS.premios }}>${totals.prizes.toFixed(2)}</td>
                  <td style={{ padding: '0.7rem 0.5rem', textAlign: 'right', fontWeight: 900, color: totals.netBank >= 0 ? '#15803d' : '#b91c1c', fontSize: '0.85rem' }}>${totals.netBank.toFixed(2)}</td>
                  <td style={{ padding: '0.7rem 0.5rem', textAlign: 'right', fontWeight: 900, color: COLORS.operador, fontSize: '0.85rem' }}>${totals.operatorCut.toFixed(2)}</td>
                  <td style={{ padding: '0.7rem 0.5rem', textAlign: 'right', fontWeight: 900, color: COLORS.socio, fontSize: '0.85rem' }}>${totals.partnerCut.toFixed(2)}</td>
                  {reinvestPct > 0 && <td style={{ padding: '0.7rem 0.5rem', textAlign: 'right', fontWeight: 900, color: COLORS.reinv, fontSize: '0.85rem' }}>${totals.reinvestCut.toFixed(2)}</td>}
                  <td style={{ padding: '0.7rem 0.5rem', textAlign: 'right', fontWeight: 900, color: COLORS.dueno, fontSize: '0.85rem' }}>${totals.ownerCut.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* ── Resumen Final para compartir ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
            {/* Tu resumen */}
            <div style={{ backgroundColor: '#f0fdf4', borderRadius: '10px', padding: '1.25rem', border: '1.5px solid #86efac' }}>
              <h4 style={{ margin: '0 0 0.75rem 0', color: '#15803d', fontSize: '1rem', fontWeight: 800 }}>🏆 Tu Resumen (Operador/Dueño)</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.82rem', color: '#166534' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Comisión Operativa ({operatorPct}% de bruto):</span><strong>${totals.operatorCut.toFixed(2)}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Utilidad como Dueño ({ownerPct}% de neto):</span><strong>${totals.ownerCut.toFixed(2)}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #22c55e', paddingTop: '0.4rem', marginTop: '0.2rem' }}>
                  <span style={{ fontWeight: 900, fontSize: '1rem' }}>💰 TOTAL TUYO:</span>
                  <strong style={{ fontSize: '1.2rem', color: '#15803d' }}>${tuGananciaTotal.toFixed(2)}</strong>
                </div>
              </div>
            </div>

            {/* Resumen del Socio */}
            <div style={{ backgroundColor: '#faf5ff', borderRadius: '10px', padding: '1.25rem', border: '1.5px solid #c4b5fd' }}>
              <h4 style={{ margin: '0 0 0.75rem 0', color: '#7c3aed', fontSize: '1rem', fontWeight: 800 }}>🤝 Resumen del Socio</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.82rem', color: '#5b21b6' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Capital invertido:</span><strong>${effectiveCapital.toFixed(2)}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Ganancia ({partnerPct}% de neto):</span><strong>${totals.partnerCut.toFixed(2)}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>ROI del período:</span><strong>{roiSocio.toFixed(1)}%</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #a78bfa', paddingTop: '0.4rem', marginTop: '0.2rem' }}>
                  <span style={{ fontWeight: 900, fontSize: '1rem' }}>💰 TOTAL SOCIO:</span>
                  <strong style={{ fontSize: '1.2rem', color: '#7c3aed' }}>${totals.partnerCut.toFixed(2)}</strong>
                </div>
              </div>
            </div>
          </div>

          {/* ── Botones de descarga grandes ── */}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <button onClick={exportExcel} style={{ flex: 1, minWidth: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', padding: '1rem', borderRadius: '10px', border: '2px solid #16a34a', backgroundColor: '#f0fdf4', color: '#15803d', fontSize: '0.95rem', fontWeight: 800, cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.03)' }}>
              <FileSpreadsheet size={22} /> Descargar Reporte Excel (.xlsx)
            </button>
            <button onClick={exportPDF} style={{ flex: 1, minWidth: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', padding: '1rem', borderRadius: '10px', border: '2px solid #dc2626', backgroundColor: '#fef2f2', color: '#b91c1c', fontSize: '0.95rem', fontWeight: 800, cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.03)' }}>
              <Download size={22} /> Descargar Reporte PDF
            </button>
          </div>
        </>
      )}
    </div>
  );
}
