import { getLocalISODate, getStartOfDayUTC, getEndOfDayUTC } from '../../utils/dateUtils';
import { useState, useEffect } from 'react';
import { Save, AlertTriangle, ExternalLink, Trash2, PlusCircle, ShieldAlert, Hash } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useStore } from '../../store/useStore';
import { GRANJITA_ANIMALS, formatAnimalDisplay } from '../../utils/granjitaAnimals';

export default function RiskManagement() {
  const store = useStore();
  const [globalLimitInput, setGlobalLimitInput] = useState<number | ''>('');
  const [currentLimitDb, setCurrentLimitDb] = useState<number>(100);
  const [overflows, setOverflows] = useState<any[]>([]);
  const [totalPassed, setTotalPassed] = useState(0);
  const [bankNameInput, setBankNameInput] = useState(store.externalBankName);

  // Granjita Hard Limits State
  const [animalDefaultLimit, setAnimalDefaultLimit] = useState<number | ''>('');
  const [animalLimitsList, setAnimalLimitsList] = useState<{ id?: string, key: string, animalNum: string, limit: number }[]>([]);
  const [selectedAnimalNum, setSelectedAnimalNum] = useState<string>('00');
  const [customAnimalLimitInput, setCustomAnimalLimitInput] = useState<number | ''>('');

  // Specific Number Backup Limits State
  const [numberLimitsList, setNumberLimitsList] = useState<{ id?: string, key: string, num: string, limit: number }[]>([]);
  const [customNumInput, setCustomNumInput] = useState<string>('');
  const [customNumLimitInput, setCustomNumLimitInput] = useState<number | ''>('');

  const fetchRiskData = async () => {
     try {
       // Fetch global limit, animal limits & specific number limits from risk_limits table
       const { data: limitsData } = await supabase
         .from('risk_limits')
         .select('*');

       const numLimitMap: Record<string, number> = {};

       if (limitsData) {
         const globalRec = limitsData.find((r: any) => r.number_played === 'GLOBAL_LIMIT');
         const limit = globalRec ? parseFloat(globalRec.max_limit) : 100;
         setCurrentLimitDb(limit);
         setGlobalLimitInput(prev => prev === '' ? limit : prev);

         const defAnimalRec = limitsData.find((r: any) => r.number_played === 'ANIMAL_DEFAULT');
         if (defAnimalRec) {
           setAnimalDefaultLimit(parseFloat(defAnimalRec.max_limit));
         }

         const customAnimalRecs = limitsData
           .filter((r: any) => r.number_played && r.number_played.startsWith('ANIMAL_') && r.number_played !== 'ANIMAL_DEFAULT')
           .map((r: any) => ({
             id: r.id,
             key: r.number_played,
             animalNum: r.number_played.replace('ANIMAL_', ''),
             limit: parseFloat(r.max_limit)
           }));
         setAnimalLimitsList(customAnimalRecs);

         // Specific Number Limits (e.g. NUM_25 or plain numeric strings)
         const customNumRecs = limitsData
           .filter((r: any) => r.number_played && (r.number_played.startsWith('NUM_') || (/^\d{2}$/.test(r.number_played) && !r.number_played.startsWith('ANIMAL_'))))
           .map((r: any) => {
             const cleanNum = r.number_played.replace('NUM_', '').padStart(2, '0');
             const parsedLimit = parseFloat(r.max_limit);
             numLimitMap[cleanNum] = parsedLimit;
             return {
               id: r.id,
               key: r.number_played,
               num: cleanNum,
               limit: parsedLimit
             };
           });
         setNumberLimitsList(customNumRecs);
       }

       // Fetch today's ticket numbers directly for overflow calculations
       const today = getLocalISODate();
       const { data: numbersData } = await supabase
         .from('ticket_numbers')
         .select('number_played, amount, ticket:ticket_id(status)')
         .gte('created_at', getStartOfDayUTC(today))
         .lte('created_at', getEndOfDayUTC(today));
         
       if (!numbersData) return;

       const numberTally: Record<string, number> = {};
       numbersData.forEach((t: any) => {
         if (t.ticket && t.ticket.status === 'cancelled') return;
         const numStr = String(t.number_played).padStart(2, '0');
         if (!numberTally[numStr]) numberTally[numStr] = 0;
         numberTally[numStr] += parseFloat(t.amount || '0');
       });

       const newOverflows: any[] = [];
       let newTotalPassed = 0;

       for (const num in numberTally) {
         // Check if this number has a specific backup limit, otherwise use global limit
         const effectiveLimit = numLimitMap[num] !== undefined ? numLimitMap[num] : currentLimitDb;
         const isSpecific = numLimitMap[num] !== undefined;

         if (numberTally[num] > effectiveLimit) {
           const passed = numberTally[num] - effectiveLimit;
           newTotalPassed += passed;
           newOverflows.push({
             num,
             totalSales: numberTally[num].toFixed(2),
             internalRisk: effectiveLimit.toFixed(2),
             isSpecificLimit: isSpecific,
             passedToExternal: passed.toFixed(2),
             bankName: store.externalBankName
           });
         }
       }
       
       newOverflows.sort((a, b) => parseFloat(b.passedToExternal) - parseFloat(a.passedToExternal));
       setOverflows(newOverflows);
       setTotalPassed(newTotalPassed);
     } catch (error) {
       console.error("Error updating risk realtime:", error);
     }
  };

  useEffect(() => {
    fetchRiskData();
    const interval = setInterval(fetchRiskData, 5000);
    return () => clearInterval(interval);
  }, [currentLimitDb]);

  const handleSaveGlobalLimit = async () => {
     try {
       const { data: existing } = await supabase.from('risk_limits')
         .select('id')
         .eq('number_played', 'GLOBAL_LIMIT')
         .maybeSingle();
         
       if (existing) {
         const { error } = await supabase.from('risk_limits')
           .update({ max_limit: globalLimitInput })
           .eq('id', existing.id);
         if (error) throw error;
       } else {
         const { error } = await supabase.from('risk_limits')
           .insert({ number_played: 'GLOBAL_LIMIT', max_limit: globalLimitInput === '' ? 100 : globalLimitInput });
         if (error) throw error;
       }
       
       store.setExternalBankName(bankNameInput);
       alert("Límite global y nombre de banca externa guardados correctamente.");
       fetchRiskData();
     } catch(err) {
       console.error("Save error:", err);
       alert("Hubo un error guardando los datos.");
     }
  };

  const handleSaveAnimalDefaultLimit = async () => {
    try {
      if (animalDefaultLimit === '' || isNaN(Number(animalDefaultLimit))) {
        alert("Ingresa un monto válido.");
        return;
      }
      const { data: existing } = await supabase.from('risk_limits')
        .select('id')
        .eq('number_played', 'ANIMAL_DEFAULT')
        .maybeSingle();

      if (existing) {
        await supabase.from('risk_limits')
          .update({ max_limit: animalDefaultLimit })
          .eq('id', existing.id);
      } else {
        await supabase.from('risk_limits')
          .insert({ number_played: 'ANIMAL_DEFAULT', max_limit: animalDefaultLimit });
      }
      alert("Límite por defecto para La Granjita actualizado.");
      fetchRiskData();
    } catch (err: any) {
      alert("Error al guardar límite por defecto: " + err.message);
    }
  };

  const handleAddCustomAnimalLimit = async () => {
    if (customAnimalLimitInput === '' || isNaN(Number(customAnimalLimitInput))) {
      alert("Ingresa un tope en dólares válido.");
      return;
    }
    const key = `ANIMAL_${selectedAnimalNum}`;
    try {
      const { data: existing } = await supabase.from('risk_limits')
        .select('id')
        .eq('number_played', key)
        .maybeSingle();

      if (existing) {
        await supabase.from('risk_limits')
          .update({ max_limit: customAnimalLimitInput })
          .eq('id', existing.id);
      } else {
        await supabase.from('risk_limits')
          .insert({ number_played: key, max_limit: customAnimalLimitInput });
      }

      setCustomAnimalLimitInput('');
      fetchRiskData();
      alert(`Límite para ${formatAnimalDisplay(selectedAnimalNum)} configurado en $${Number(customAnimalLimitInput).toFixed(2)}.`);
    } catch (err: any) {
      alert("Error al guardar límite de animal: " + err.message);
    }
  };

  const handleDeleteAnimalLimit = async (key: string) => {
    if (!window.confirm("¿Eliminar este límite específico? Se aplicará el límite por defecto.")) return;
    try {
      await supabase.from('risk_limits').delete().eq('number_played', key);
      fetchRiskData();
    } catch (err: any) {
      alert("Error al eliminar: " + err.message);
    }
  };

  // Specific Number Backup Handlers
  const handleAddCustomNumberLimit = async () => {
    const rawNum = customNumInput.trim();
    if (!rawNum || isNaN(Number(rawNum)) || Number(rawNum) < 0 || Number(rawNum) > 99) {
      alert("Por favor ingresa un número válido entre 00 y 99.");
      return;
    }
    if (customNumLimitInput === '' || isNaN(Number(customNumLimitInput)) || Number(customNumLimitInput) < 0) {
      alert("Ingresa un límite válido en dólares ($) para este número (ej. $0 para respaldar todo, o $10.00).");
      return;
    }

    const paddedNum = rawNum.padStart(2, '0');
    const key = `NUM_${paddedNum}`;

    try {
      const { data: existing } = await supabase.from('risk_limits')
        .select('id')
        .eq('number_played', key)
        .maybeSingle();

      if (existing) {
        await supabase.from('risk_limits')
          .update({ max_limit: customNumLimitInput })
          .eq('id', existing.id);
      } else {
        await supabase.from('risk_limits')
          .insert({ number_played: key, max_limit: customNumLimitInput });
      }

      setCustomNumInput('');
      setCustomNumLimitInput('');
      fetchRiskData();
      alert(`✅ Límite de respaldo para el número ${paddedNum} fijado en $${Number(customNumLimitInput).toFixed(2)}.`);
    } catch (err: any) {
      alert("Error al guardar límite de número: " + err.message);
    }
  };

  const handleDeleteNumberLimit = async (key: string, num: string) => {
    if (!window.confirm(`¿Eliminar el límite de respaldo específico para el número ${num}? Se aplicará el límite global.`)) return;
    try {
      await supabase.from('risk_limits').delete().eq('number_played', key);
      fetchRiskData();
    } catch (err: any) {
      alert("Error al eliminar: " + err.message);
    }
  };

  return (
    <div style={{ padding: '2rem', backgroundColor: '#f4f7f6', minHeight: '100%', color: '#333' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: '1rem 1.5rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1.5rem' }}>
         <div>
           <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#17233D' }}>Gestión de Riesgo y Limitantes</h2>
           <span style={{ fontSize: '0.85rem', color: '#6c757d' }}>Configura topes por número de lotería, respaldo específico y limitantes para animales en La Granjita.</span>
         </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        
        {/* PANEL 1: LIMITANTES LA GRANJITA */}
        <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '1.5rem', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', alignSelf: 'start' }}>
           <h4 style={{ margin: '0 0 1rem 0', color: '#0d9488', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
              <ShieldAlert size={20} color="#0d9488" /> 🐓 Limitantes de Venta: La Granjita
           </h4>

           {/* Límite por defecto por animal */}
           <div style={{ marginBottom: '1.5rem', background: '#f0fdf4', padding: '1rem', borderRadius: '8px', border: '1px solid #ccfbf1' }}>
             <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#0f766e', marginBottom: '0.4rem', display: 'block' }}>
               Límite Máximo General por Animal ($)
             </label>
             <div style={{ display: 'flex', gap: '0.5rem' }}>
               <input 
                 type="number" 
                 value={animalDefaultLimit}
                 onChange={(e) => setAnimalDefaultLimit(e.target.value ? Number(e.target.value) : '')}
                 placeholder="Ej. $50.00 por animal"
                 style={{ flex: 1, padding: '0.6rem', borderRadius: '6px', border: '1px solid #99f6e4', fontSize: '1rem', fontWeight: 'bold', outline: 'none' }}
               />
               <button 
                 onClick={handleSaveAnimalDefaultLimit}
                 style={{ background: '#0d9488', color: '#fff', border: 'none', borderRadius: '6px', padding: '0.6rem 1rem', fontWeight: 'bold', cursor: 'pointer' }}
               >
                 Guardar
               </button>
             </div>
             <span style={{ fontSize: '0.75rem', color: '#0f766e', marginTop: '0.4rem', display: 'block' }}>
               Si se asigna (ej. $50.00), ningún animal podrá vender más de esa cantidad por sorteo.
             </span>
           </div>

           {/* Añadir Límite Específico a un Animal */}
           <div style={{ marginBottom: '1.5rem', background: '#fafafa', padding: '1rem', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
             <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#374151', marginBottom: '0.4rem', display: 'block' }}>
               Establecer Límite Específico a un Animal
             </label>
             <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.8rem' }}>
               <select
                 value={selectedAnimalNum}
                 onChange={(e) => setSelectedAnimalNum(e.target.value)}
                 style={{ flex: 1, padding: '0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 'bold', outline: 'none' }}
               >
                 {GRANJITA_ANIMALS.map(a => (
                   <option key={a.id} value={a.number}>
                     [{a.number}] {a.emoji} {a.name}
                   </option>
                 ))}
               </select>
               <input 
                 type="number" 
                 value={customAnimalLimitInput}
                 onChange={(e) => setCustomAnimalLimitInput(e.target.value ? Number(e.target.value) : '')}
                 placeholder="Tope $"
                 style={{ width: '120px', padding: '0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.95rem', fontWeight: 'bold', outline: 'none' }}
               />
               <button 
                 onClick={handleAddCustomAnimalLimit}
                 style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', padding: '0.6rem 1rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}
               >
                 <PlusCircle size={16} /> Fijar
               </button>
             </div>
           </div>

           {/* Tabla de Límites Específicos de Animales */}
           <h5 style={{ margin: '0 0 0.5rem 0', color: '#374151', fontSize: '0.9rem' }}>Límites Específicos Configurados (Animales):</h5>
           <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '6px' }}>
             <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
               <thead>
                 <tr style={{ background: '#f3f4f6', color: '#4b5563', textAlign: 'left' }}>
                   <th style={{ padding: '0.6rem' }}>Animal</th>
                   <th style={{ padding: '0.6rem' }}>Límite Máximo ($)</th>
                   <th style={{ padding: '0.6rem', textAlign: 'center' }}>Acción</th>
                 </tr>
               </thead>
               <tbody>
                 {animalLimitsList.length === 0 ? (
                   <tr>
                     <td colSpan={3} style={{ padding: '1rem', textAlign: 'center', color: '#9ca3af', fontStyle: 'italic' }}>
                       Sin límites específicos. Aplica el límite general.
                     </td>
                   </tr>
                 ) : (
                   animalLimitsList.map(item => (
                     <tr key={item.key} style={{ borderBottom: '1px solid #f3f4f6' }}>
                       <td style={{ padding: '0.6rem', fontWeight: 'bold', color: '#0f766e' }}>
                         {formatAnimalDisplay(item.animalNum)}
                       </td>
                       <td style={{ padding: '0.6rem', fontWeight: 'bold', color: '#dc2626' }}>
                         ${item.limit.toFixed(2)}
                       </td>
                       <td style={{ padding: '0.6rem', textAlign: 'center' }}>
                         <button 
                           onClick={() => handleDeleteAnimalLimit(item.key)}
                           style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                           title="Eliminar Límite"
                         >
                           <Trash2 size={16} />
                         </button>
                       </td>
                     </tr>
                   ))
                 )}
               </tbody>
             </table>
           </div>

        </div>

        {/* PANEL 2: RESPALDO GLOBAL, RESPALDO ESPECÍFICO Y BANCA EXTERNA */}
        <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '1.5rem', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', alignSelf: 'start' }}>
           <h4 style={{ margin: '0 0 1rem 0', color: '#17233D', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
              <AlertTriangle size={20} color="#ffaa00" /> Respaldo / Banca Externa
           </h4>
           
           {/* Respaldo Global */}
           <div style={{ marginBottom: '1.2rem' }}>
             <label style={{ fontSize: '0.85rem', color: '#6c757d', marginBottom: '0.4rem', display: 'block', fontWeight: 'bold' }}>
               Monto Máximo de Retención Global Interna ($)
             </label>
             <input 
               type="number" 
               value={globalLimitInput}
               onChange={(e) => setGlobalLimitInput(e.target.value ? Number(e.target.value) : '')}
               placeholder={`Actual DB: $${currentLimitDb}`}
               style={{ width: '100%', padding: '0.8rem', borderRadius: '6px', border: '1px solid #e9ecef', fontSize: '1.1rem', fontWeight: 'bold', color: '#17233D', boxSizing: 'border-box' }} 
             />
           </div>

           <div style={{ marginBottom: '1.2rem' }}>
             <label style={{ fontSize: '0.85rem', color: '#6c757d', marginBottom: '0.4rem', display: 'block', fontWeight: 'bold' }}>
               Nombre de Banca Externa
             </label>
             <input 
               type="text" 
               value={bankNameInput}
               onChange={(e) => setBankNameInput(e.target.value)}
               placeholder="Ej. Loteka, JPS, Don Pedro..."
               style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid #e9ecef', fontSize: '0.9rem', boxSizing: 'border-box' }} 
             />
           </div>

           <button 
             onClick={handleSaveGlobalLimit}
             style={{ backgroundColor: '#28a745', color: '#fff', padding: '0.6rem 1rem', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem', border: 'none', cursor: 'pointer', width: '100%', justifyContent: 'center' }}
           >
             <Save size={16} /> Guardar Respaldo Global
           </button>

           <hr style={{ border: 'none', borderTop: '1px solid #e9ecef', margin: '1.5rem 0' }} />

           {/* SECCIÓN NUEVA: RESPALDO ESPECÍFICO POR NÚMERO (00-99) */}
           <div style={{ background: '#fefce8', padding: '1rem', borderRadius: '8px', border: '1px solid #fef08a', marginBottom: '1.2rem' }}>
             <h5 style={{ margin: '0 0 0.5rem 0', color: '#854d0e', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.95rem' }}>
               <Hash size={16} /> Respaldar un Número en Específico
             </h5>
             <span style={{ fontSize: '0.75rem', color: '#a16207', display: 'block', marginBottom: '0.6rem' }}>
               Define un tope de retención propio para cualquier número (00-99). Si colocas $0.00, el 100% de ese número pasará a respaldo.
             </span>

             <div style={{ display: 'flex', gap: '0.5rem' }}>
               <input 
                 type="text"
                 maxLength={2}
                 value={customNumInput}
                 onChange={(e) => setCustomNumInput(e.target.value.replace(/\D/g, ''))}
                 placeholder="Número (00-99)"
                 style={{ width: '120px', padding: '0.6rem', borderRadius: '6px', border: '1px solid #fde047', fontSize: '0.95rem', fontWeight: 'bold', textAlign: 'center', outline: 'none' }}
               />
               <input 
                 type="number" 
                 value={customNumLimitInput}
                 onChange={(e) => setCustomNumLimitInput(e.target.value ? Number(e.target.value) : '')}
                 placeholder="Retención Max $"
                 style={{ flex: 1, padding: '0.6rem', borderRadius: '6px', border: '1px solid #fde047', fontSize: '0.95rem', fontWeight: 'bold', outline: 'none' }}
               />
               <button 
                 onClick={handleAddCustomNumberLimit}
                 style={{ background: '#ca8a04', color: '#fff', border: 'none', borderRadius: '6px', padding: '0.6rem 1rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}
               >
                 <PlusCircle size={16} /> Fijar
               </button>
             </div>

             {/* Tabla de números con respaldo específico */}
             {numberLimitsList.length > 0 && (
               <div style={{ marginTop: '0.8rem', maxHeight: '140px', overflowY: 'auto', border: '1px solid #fef08a', borderRadius: '6px', background: '#fff' }}>
                 <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                   <thead>
                     <tr style={{ background: '#fef9c3', color: '#854d0e', textAlign: 'left' }}>
                       <th style={{ padding: '0.4rem 0.6rem' }}>Número</th>
                       <th style={{ padding: '0.4rem 0.6rem' }}>Retención ($)</th>
                       <th style={{ padding: '0.4rem 0.6rem', textAlign: 'center' }}>Acción</th>
                     </tr>
                   </thead>
                   <tbody>
                     {numberLimitsList.map(item => (
                       <tr key={item.key} style={{ borderBottom: '1px solid #fef9c3' }}>
                         <td style={{ padding: '0.4rem 0.6rem', fontWeight: 'bold', color: '#17233D', fontFamily: 'monospace', fontSize: '0.95rem' }}>
                           #{item.num}
                         </td>
                         <td style={{ padding: '0.4rem 0.6rem', fontWeight: 'bold', color: item.limit === 0 ? '#dc2626' : '#ca8a04' }}>
                           ${item.limit.toFixed(2)} {item.limit === 0 ? '(100% a Respaldo)' : ''}
                         </td>
                         <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center' }}>
                           <button 
                             onClick={() => handleDeleteNumberLimit(item.key, item.num)}
                             style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                             title="Eliminar Respaldo Específico"
                           >
                             <Trash2 size={14} />
                           </button>
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
             )}
           </div>

           <h4 style={{ margin: '0 0 1rem 0', color: '#17233D', fontSize: '0.95rem' }}>
             Números en Respaldo Hoy {totalPassed > 0 && <span style={{ color: '#d97706', fontSize: '0.85rem' }}>(Total: ${totalPassed.toFixed(2)})</span>}
           </h4>
           <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
             <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
               <thead>
                 <tr style={{ backgroundColor: '#f8f9fa', color: '#495057', textAlign: 'left' }}>
                   <th style={{ padding: '0.6rem' }}>Número</th>
                   <th style={{ padding: '0.6rem' }}>Venta Total</th>
                   <th style={{ padding: '0.6rem' }}>Tope Interno</th>
                   <th style={{ padding: '0.6rem' }}>A Respaldo</th>
                 </tr>
               </thead>
               <tbody>
                 {overflows.map((o, idx) => (
                   <tr key={idx} style={{ borderBottom: '1px solid #e9ecef' }}>
                     <td style={{ padding: '0.6rem', fontWeight: 800, color: '#dc3545', fontFamily: 'monospace', fontSize: '1rem' }}>
                       {o.num}
                     </td>
                     <td style={{ padding: '0.6rem', fontWeight: 600 }}>${o.totalSales}</td>
                     <td style={{ padding: '0.6rem', fontSize: '0.75rem', color: '#64748b' }}>
                       ${o.internalRisk} {o.isSpecificLimit ? <span style={{ color: '#ca8a04', fontWeight: 'bold' }}>(Específico)</span> : '(Global)'}
                     </td>
                     <td style={{ padding: '0.6rem', fontWeight: 'bold', color: '#d97706', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <ExternalLink size={14} /> ${o.passedToExternal}
                     </td>
                   </tr>
                 ))}
                 {overflows.length === 0 && (
                   <tr><td colSpan={4} style={{ padding: '1rem', textAlign: 'center', color: '#6c757d', fontStyle: 'italic' }}>No hay números excedidos hoy.</td></tr>
                 )}
               </tbody>
             </table>
           </div>
        </div>

      </div>

    </div>
  );
}
