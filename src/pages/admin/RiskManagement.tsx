import { getLocalISODate, getStartOfDayUTC, getEndOfDayUTC } from '../../utils/dateUtils';
import { useState, useEffect } from 'react';
import { Save, AlertTriangle, ExternalLink, Trash2, PlusCircle, ShieldAlert } from 'lucide-react';
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

  const fetchRiskData = async () => {
     try {
       // Fetch global limit & animal hard limits from risk_limits table
       const { data: limitsData } = await supabase
         .from('risk_limits')
         .select('*');

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
       }

       // Fetch today's ticket numbers directly for overflow calculations
       const today = getLocalISODate();
       const { data: numbersData } = await supabase
         .from('ticket_numbers')
         .select('number_played, amount')
         .gte('created_at', getStartOfDayUTC(today))
         .lte('created_at', getEndOfDayUTC(today));
         
       if (!numbersData) return;

       const numberTally: Record<string, number> = {};
       numbersData.forEach(t => {
         if (!numberTally[t.number_played]) numberTally[t.number_played] = 0;
         numberTally[t.number_played] += parseFloat(t.amount);
       });

       const newOverflows = [];
       let newTotalPassed = 0;

       for (const num in numberTally) {
         if (numberTally[num] > currentLimitDb) {
           const passed = numberTally[num] - currentLimitDb;
           newTotalPassed += passed;
           newOverflows.push({
             num,
             totalSales: numberTally[num].toFixed(2),
             internalRisk: currentLimitDb.toFixed(2),
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
  }, []);

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

  return (
    <div style={{ padding: '2rem', backgroundColor: '#f4f7f6', minHeight: '100%', color: '#333' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: '1rem 1.5rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1.5rem' }}>
         <div>
           <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#17233D' }}>Gestión de Riesgo y Limitantes</h2>
           <span style={{ fontSize: '0.85rem', color: '#6c757d' }}>Configura topes por número de lotería y limitantes para animales en La Granjita.</span>
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

           {/* Tabla de Límites Específicos */}
           <h5 style={{ margin: '0 0 0.5rem 0', color: '#374151', fontSize: '0.9rem' }}>Límites Específicos Configurados:</h5>
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

        {/* PANEL 2: RESPALDO GLOBAL Y BANCA EXTERNA */}
        <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '1.5rem', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', alignSelf: 'start' }}>
           <h4 style={{ margin: '0 0 1rem 0', color: '#17233D', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertTriangle size={18} color="#ffaa00" /> Respaldo Global / Banca Externa
           </h4>
           
           <div style={{ marginBottom: '1.2rem' }}>
             <label style={{ fontSize: '0.85rem', color: '#6c757d', marginBottom: '0.4rem', display: 'block' }}>Monto Máximo de Retención Interna ($)</label>
             <input 
               type="number" 
               value={globalLimitInput}
               onChange={(e) => setGlobalLimitInput(Number(e.target.value))}
               placeholder={`Actual DB: $${currentLimitDb}`}
               style={{ width: '100%', padding: '0.8rem', borderRadius: '6px', border: '1px solid #e9ecef', fontSize: '1.1rem', fontWeight: 'bold', color: '#17233D' }} 
             />
           </div>

           <div style={{ marginBottom: '1.2rem' }}>
             <label style={{ fontSize: '0.85rem', color: '#6c757d', marginBottom: '0.4rem', display: 'block' }}>Nombre de Banca Externa</label>
             <input 
               type="text" 
               value={bankNameInput}
               onChange={(e) => setBankNameInput(e.target.value)}
               placeholder="Ej. Loteka, JPS, Don Pedro..."
               style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid #e9ecef', fontSize: '0.9rem' }} 
             />
           </div>

           <button 
             onClick={handleSaveGlobalLimit}
             style={{ backgroundColor: '#28a745', color: '#fff', padding: '0.6rem 1rem', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem', border: 'none', cursor: 'pointer', width: '100%', justifyContent: 'center' }}
           >
             <Save size={16} /> Guardar Respaldo Global
           </button>

           <hr style={{ border: 'none', borderTop: '1px solid #e9ecef', margin: '1.5rem 0' }} />

           <h4 style={{ margin: '0 0 1rem 0', color: '#17233D', fontSize: '0.95rem' }}>
             Números en Respaldo Hoy {totalPassed > 0 && <span style={{ color: '#d97706', fontSize: '0.85rem' }}>(Total: ${totalPassed.toFixed(2)})</span>}
           </h4>
           <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
             <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
               <thead>
                 <tr style={{ backgroundColor: '#f8f9fa', color: '#495057', textAlign: 'left' }}>
                   <th style={{ padding: '0.6rem' }}>Número</th>
                   <th style={{ padding: '0.6rem' }}>Venta Total</th>
                   <th style={{ padding: '0.6rem' }}>A Respaldo</th>
                 </tr>
               </thead>
               <tbody>
                 {overflows.map((o, idx) => (
                   <tr key={idx} style={{ borderBottom: '1px solid #e9ecef' }}>
                     <td style={{ padding: '0.6rem', fontWeight: 800, color: '#dc3545' }}>{o.num}</td>
                     <td style={{ padding: '0.6rem', fontWeight: 600 }}>${o.totalSales}</td>
                     <td style={{ padding: '0.6rem', fontWeight: 'bold', color: '#d97706', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <ExternalLink size={14} /> ${o.passedToExternal}
                     </td>
                   </tr>
                 ))}
                 {overflows.length === 0 && (
                   <tr><td colSpan={3} style={{ padding: '1rem', textAlign: 'center', color: '#6c757d', fontStyle: 'italic' }}>No hay números excedidos hoy.</td></tr>
                 )}
               </tbody>
             </table>
           </div>
        </div>

      </div>

    </div>
  );
}
