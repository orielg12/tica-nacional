import { useState } from 'react';
import { formatLotteryTime, type LotteryDay } from '../../utils/lotteryRules';
import { useStore } from '../../store/useStore';
import { Trash2, Plus, Edit2, Save, X } from 'lucide-react';

const ALL_DAYS: LotteryDay[] = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export default function LotteryManager() {
  const store = useStore();
  const lotteries = store.lotteriesMaster;
  const isSuperAdmin = !store.currentUser?.isSubAdmin;
  const canManageLotteries = isSuperAdmin || store.currentUser?.allowManageLotteries === true;

  // Form state
  const [newName, setNewName] = useState('');
  const [newTime, setNewTime] = useState(''); // HH:MM
  const [selectedDays, setSelectedDays] = useState<LotteryDay[]>([]);
  const [closeMinutes, setCloseMinutes] = useState(10);
  const [editingId, setEditingId] = useState<string | null>(null);

  if (!canManageLotteries) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', backgroundColor: '#f4f7f6', minHeight: '100%' }}>
        <div style={{ backgroundColor: '#fff', padding: '2.5rem', borderRadius: '12px', maxWidth: '500px', margin: '0 auto', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h3 style={{ color: '#dc2626', marginBottom: '1rem', fontSize: '1.2rem' }}>⛔ Acceso Restringido</h3>
          <p style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: '1.5' }}>
            No tienes permisos para crear o modificar sorteos. Esta función solo puede ser habilitada por el <strong>Administrador Principal</strong>.
          </p>
        </div>
      </div>
    );
  }

  const toggle = (id: string) => {
    store.toggleMasterLottery(id);
  };

  const remove = (id: string) => {
    if (window.confirm("¿Estás seguro de eliminar este sorteo?")) {
      store.deleteMasterLottery(id);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newTime) {
      alert('Nombre y hora son obligatorios');
      return;
    }
    
    const [h, m] = newTime.split(':').map(Number);
    const newDays = selectedDays.length > 0 && selectedDays.length < 7 ? selectedDays : undefined;

    if (editingId) {
      const success = await store.editMasterLottery(editingId, {
        name: newName,
        hour: h,
        minute: m,
        days: newDays,
        closeMinutes: closeMinutes
      });
      if (success) {
        setNewName('');
        setNewTime('');
        setSelectedDays([]);
        setCloseMinutes(10);
        setEditingId(null);
        alert('Sorteo actualizado exitosamente');
      }
      return;
    }
    const newId = `${h}${m}-${newName.toLowerCase().replace(/\s+/g, '')}`;

    if (lotteries.some(l => l.id === newId)) {
      alert('Ya existe un sorteo con este nombre y hora.');
      return;
    }

    const success = await store.addMasterLottery({
      id: newId,
      name: newName,
      hour: h,
      minute: m,
      isActive: true,
      days: newDays,
      closeMinutes: closeMinutes
    });

    if (success) {
      setNewName('');
      setNewTime('');
      setSelectedDays([]);
      setCloseMinutes(10);
      alert('Sorteo creado exitosamente');
    }
  };

  const toggleDay = (day: LotteryDay) => {
    if (selectedDays.includes(day)) {
      setSelectedDays(selectedDays.filter(d => d !== day));
    } else {
      setSelectedDays([...selectedDays, day]);
    }
  };

  const handleEdit = (lottery: any) => {
    setEditingId(lottery.id);
    setNewName(lottery.name);
    setNewTime(`${lottery.hour.toString().padStart(2, '0')}:${lottery.minute.toString().padStart(2, '0')}`);
    setSelectedDays(lottery.days || []);
    setCloseMinutes(lottery.closeMinutes ?? 10);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setNewName('');
    setNewTime('');
    setSelectedDays([]);
    setCloseMinutes(10);
  };

  return (
    <div style={{ padding: '2rem', backgroundColor: '#f4f7f6', minHeight: '100%', color: '#333' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: '1rem 1.5rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#17233D', fontWeight: 'bold' }}>Gestor de Sorteos (Loterías)</h2>
          <span style={{ fontSize: '0.85rem', color: '#6c757d' }}>
            Crea, habilita o elimina sorteos. El cierre se configura por sorteo.
          </span>
        </div>
      </div>

      {/* Nuevo/Editar Sorteo Form */}
      <div style={{ backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', padding: '1.5rem', marginBottom: '1.5rem', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#17233D', fontWeight: 'bold' }}>
            {editingId ? '✏️ Editar Sorteo' : '➕ Agregar Nuevo Sorteo'}
          </h3>
          {editingId && (
            <button 
              type="button" 
              onClick={cancelEdit} 
              style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#64748b', cursor: 'pointer', padding: '0.3rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', fontWeight: 'bold' }}
            >
              <X size={16} /> Cancelar Edición
            </button>
          )}
        </div>

        <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#64748b', marginBottom: '0.35rem' }}>Nombre del Sorteo</label>
              <input 
                type="text" 
                value={newName} 
                onChange={e => setNewName(e.target.value)}
                placeholder="Ej. Sorteo Extra"
                style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f172a', fontWeight: '600', fontSize: '0.9rem', outline: 'none' }}
              />
            </div>
            <div style={{ width: '140px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#64748b', marginBottom: '0.35rem' }}>Hora (24h)</label>
              <input 
                type="time" 
                value={newTime} 
                onChange={e => setNewTime(e.target.value)}
                style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f172a', fontWeight: 'bold', fontSize: '0.9rem', outline: 'none' }}
              />
            </div>
            <div style={{ width: '140px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#64748b', marginBottom: '0.35rem' }}>Cierre (min)</label>
              <input 
                type="number" 
                value={closeMinutes} 
                onChange={e => setCloseMinutes(parseInt(e.target.value) || 0)}
                min={0}
                max={60}
                style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f172a', fontWeight: 'bold', fontSize: '0.9rem', outline: 'none' }}
              />
            </div>
          </div>
          
          <div>
             <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#64748b', marginBottom: '0.4rem' }}>
               Días que juega <span style={{ fontWeight: 'normal', color: '#94a3b8' }}>(Dejar vacío para TODOS LOS DÍAS)</span>
             </label>
             <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
               {ALL_DAYS.map(day => {
                 const isSelected = selectedDays.includes(day);
                 return (
                   <button 
                     key={day}
                     type="button"
                     onClick={() => toggleDay(day)}
                     style={{ 
                       padding: '0.4rem 0.8rem', 
                       fontSize: '0.8rem',
                       fontWeight: 'bold',
                       borderRadius: '6px',
                       cursor: 'pointer',
                       background: isSelected ? '#0f766e' : '#f8fafc',
                       border: isSelected ? '1px solid #0f766e' : '1px solid #cbd5e1',
                       color: isSelected ? '#ffffff' : '#475569',
                       transition: 'all 0.15s ease'
                     }}
                   >
                     {day.substring(0,3)}
                   </button>
                 );
               })}
             </div>
          </div>

          <div>
            <button 
              type="submit" 
              style={{ 
                display: 'inline-flex', 
                alignItems: 'center', 
                gap: '0.5rem', 
                padding: '0.7rem 1.4rem', 
                borderRadius: '6px', 
                border: 'none', 
                fontWeight: 'bold', 
                fontSize: '0.9rem', 
                color: '#ffffff', 
                background: editingId ? '#d97706' : '#0f766e', 
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
              }}
            >
               {editingId ? <><Save size={16} /> Guardar Cambios</> : <><Plus size={16} /> Crear Sorteo</>}
            </button>
          </div>
        </form>
      </div>

      {/* Lista de Sorteos */}
      <div style={{ backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', padding: '1.5rem', border: '1px solid #e2e8f0' }}>
        <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.05rem', color: '#17233D', fontWeight: 'bold' }}>
          Sorteos Registrados ({lotteries.length})
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {lotteries.map(l => (
            <div 
              key={l.id} 
              style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                padding: '0.8rem 1rem', 
                backgroundColor: '#f8fafc', 
                borderRadius: '8px', 
                border: '1px solid #e2e8f0',
                flexWrap: 'wrap',
                gap: '0.8rem'
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                 <span style={{ fontWeight: 'bold', fontSize: '0.95rem', color: '#17233D' }}>{l.name}</span>
                 <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                   ⏰ {formatLotteryTime(l.hour, l.minute)} {l.days ? `• Solo ${l.days.join(', ')}` : '• Todos los días'} — Cierra {l.closeMinutes ?? 10} min antes
                 </span>
              </div>
              
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button 
                  onClick={() => toggle(l.id)}
                  style={{ 
                    fontSize: '0.8rem', 
                    padding: '0.4rem 0.8rem', 
                    minWidth: '105px', 
                    borderRadius: '6px', 
                    fontWeight: 'bold', 
                    cursor: 'pointer',
                    background: l.isActive ? '#dcfce7' : '#fee2e2',
                    color: l.isActive ? '#15803d' : '#dc2626',
                    border: l.isActive ? '1px solid #86efac' : '1px solid #fca5a5'
                  }}
                >
                  {l.isActive ? '● Activa' : '○ Deshabilitada'}
                </button>
                
                <button
                  onClick={() => handleEdit(l)}
                  style={{ 
                    padding: '0.4rem 0.6rem', 
                    background: '#e0f2fe', 
                    color: '#0284c7', 
                    border: '1px solid #bae6fd', 
                    borderRadius: '6px', 
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title="Editar Sorteo"
                >
                  <Edit2 size={16} />
                </button>

                <button
                  onClick={() => remove(l.id)}
                  style={{ 
                    padding: '0.4rem 0.6rem', 
                    background: '#fee2e2', 
                    color: '#dc2626', 
                    border: '1px solid #fecaca', 
                    borderRadius: '6px', 
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title="Eliminar Sorteo"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}

          {lotteries.length === 0 && (
            <p style={{ color: '#94a3b8', textAlign: 'center', padding: '1.5rem', margin: 0, fontStyle: 'italic' }}>
              No hay sorteos configurados.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
