import { useStore } from '../../store/useStore';
import { Sparkles, Flame, Clock, Filter } from 'lucide-react';
import { useMemo, useState } from 'react';

export default function ForecastsView() {
  const store = useStore();
  const [selectedLotteryId, setSelectedLotteryId] = useState<string>('ALL');

  const { hotNumbers, overdueNumbers, pyramidRows, recommended } = useMemo(() => {
    // Filter results by lottery
    const relevantResults = selectedLotteryId === 'ALL' 
      ? store.results 
      : store.results.filter(r => r.lotteryId === selectedLotteryId);

    // 1. Hot & Overdue Numbers
    const frequency: Record<string, number> = {};
    const lastSeen: Record<string, number> = {}; 
    
    for (let i = 0; i <= 99; i++) {
      const numStr = i.toString().padStart(2, '0');
      frequency[numStr] = 0;
      lastSeen[numStr] = 0;
    }

    relevantResults.forEach(r => {
      const num = r.winning_number;
      if (num && frequency[num] !== undefined) {
        frequency[num]++;
        const dateMs = new Date(r.date).getTime();
        if (dateMs > lastSeen[num]) {
          lastSeen[num] = dateMs;
        }
      }
    });

    const allNumbers = Object.keys(frequency);
    
    // Hot: highest frequency
    const hotNumbers = [...allNumbers].sort((a, b) => frequency[b] - frequency[a]).slice(0, 5);
    
    // Overdue: oldest lastSeen
    const overdueNumbers = [...allNumbers].sort((a, b) => lastSeen[a] - lastSeen[b]).slice(0, 5);

    // 2. Pyramid Logic
    const today = new Date();
    const dd = today.getDate().toString().padStart(2, '0');
    const mm = (today.getMonth() + 1).toString().padStart(2, '0');
    const yyyy = today.getFullYear().toString();
    
    let baseString = (dd + mm + yyyy).replace(/\D/g, ''); // length 8
    
    // Prepend the most recent winning number to add randomness based on results
    const sortedResults = [...relevantResults].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (sortedResults.length > 0 && sortedResults[0].winning_number) {
      const wnum = sortedResults[0].winning_number.replace(/\D/g, '');
      baseString = wnum + baseString; // E.g. "45" + "19062026"
    }

    const rows: string[] = [baseString];
    let currentRow = baseString;

    let failsafe = 0;
    while (currentRow.length > 2 && failsafe < 100) {
      failsafe++;
      let nextRow = "";
      for (let i = 0; i < currentRow.length - 1; i++) {
        let sum = parseInt(currentRow[i]) + parseInt(currentRow[i + 1]);
        if (isNaN(sum)) sum = 0;
        nextRow += (sum % 10).toString(); // modulo 10
      }
      rows.push(nextRow);
      currentRow = nextRow;
    }

    const recs = new Set<string>();
    if (rows.length >= 1) recs.add(rows[rows.length - 1]); // Final 2 digits
    if (rows.length >= 2) {
      const preFinal = rows[rows.length - 2];
      recs.add(preFinal.substring(0, 2));
      recs.add(preFinal.substring(1, 3));
    }
    if (rows.length >= 3) {
        recs.add(rows[rows.length - 3].substring(1, 3));
    }
    
    const recommended = Array.from(recs).slice(0, 4);

    return { hotNumbers, overdueNumbers, pyramidRows: rows, recommended };
  }, [store.results, selectedLotteryId]);

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] overflow-y-auto w-full">
      {/* HEADER */}
      <div className="flex-none bg-gradient-to-r from-amber-600 to-orange-500 p-6 lg:p-8 shadow-md">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Sparkles className="text-amber-100" size={32} />
          <div>
            <h1 className="text-2xl lg:text-3xl font-black text-white tracking-tight">Pirámides y Pronósticos</h1>
            <p className="text-amber-100/90 text-sm lg:text-base mt-1 font-medium">Análisis matemático de probabilidades</p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 lg:p-8 max-w-5xl mx-auto w-full space-y-6">
        
        {/* FILTER BAR */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
          <Filter size={20} className="text-gray-400" />
          <span className="font-bold text-gray-700">Analizar Sorteo:</span>
          <select 
            value={selectedLotteryId} 
            onChange={e => setSelectedLotteryId(e.target.value)}
            className="flex-1 max-w-xs p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 font-medium text-gray-800 outline-none"
          >
            <option value="ALL">🌟 Todos los Sorteos (Global)</option>
            {store.lotteriesMaster.map(lot => (
              <option key={lot.id} value={lot.id}>{lot.name}</option>
            ))}
          </select>
        </div>

        {/* PYRAMID SECTION */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="bg-amber-50 p-4 border-b border-amber-100 flex items-center gap-2">
            <Sparkles className="text-amber-500" size={20} />
            <h2 className="text-lg font-bold text-amber-900">La Pirámide de la Suerte</h2>
          </div>
          <div className="p-6 lg:p-8 flex flex-col md:flex-row gap-8 items-center justify-center">
            
            <div className="flex flex-col items-center gap-1 font-mono text-lg lg:text-xl font-bold tracking-[0.3em] text-gray-700 bg-gray-50 p-6 rounded-xl border border-gray-200">
              {pyramidRows.map((row, idx) => (
                <div key={idx} className={idx === pyramidRows.length - 1 ? 'text-amber-600 text-2xl font-black scale-110' : ''}>
                  {row}
                </div>
              ))}
            </div>

            <div className="flex flex-col items-center md:items-start gap-4">
              <div className="text-center md:text-left">
                 <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Cruces Recomendados</h3>
                 <p className="text-xs text-gray-500 max-w-xs mt-1">Sugeridos a partir del análisis cruzado de fecha y último resultado.</p>
              </div>
              <div className="flex flex-wrap gap-3 justify-center md:justify-start">
                {recommended.map((num, idx) => (
                  <div key={idx} className="bg-amber-500 text-white text-3xl font-black font-mono px-4 py-3 rounded-xl shadow-lg border-b-4 border-amber-700">
                    {num}
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* STATISTICS SECTION */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-10">
          
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-red-50 p-4 border-b border-red-100 flex items-center gap-2">
              <Flame className="text-red-500" size={20} />
              <h2 className="text-lg font-bold text-red-900">Números Calientes</h2>
            </div>
            <div className="p-6">
              <p className="text-xs text-gray-500 mb-4">Números que más han salido en el historial.</p>
              <div className="flex flex-wrap gap-3">
                {hotNumbers.map((num, idx) => (
                  <div key={idx} className="bg-red-100 text-red-700 text-xl font-black font-mono px-4 py-2 rounded-lg border border-red-200 flex flex-col items-center shadow-sm">
                    <span>{num}</span>
                    <span className="text-[10px] font-sans font-normal opacity-70 mt-1 uppercase tracking-wider">Top {idx + 1}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-blue-50 p-4 border-b border-blue-100 flex items-center gap-2">
              <Clock className="text-blue-500" size={20} />
              <h2 className="text-lg font-bold text-blue-900">Números Atrasados</h2>
            </div>
            <div className="p-6">
              <p className="text-xs text-gray-500 mb-4">Números que tienen más tiempo sin salir (Fríos).</p>
              <div className="flex flex-wrap gap-3">
                {overdueNumbers.map((num, idx) => (
                  <div key={idx} className="bg-blue-100 text-blue-700 text-xl font-black font-mono px-4 py-2 rounded-lg border border-blue-200 flex flex-col items-center shadow-sm">
                    <span>{num}</span>
                    <span className="text-[10px] font-sans font-normal opacity-70 mt-1 uppercase tracking-wider">Frío</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
