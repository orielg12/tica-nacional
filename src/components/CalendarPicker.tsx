import { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, X } from 'lucide-react';

interface CalendarPickerProps {
  selectedDate: string; 
  onSelect: (date: string) => void;
  placeholder?: string;
}

export default function CalendarPicker({ selectedDate, onSelect, placeholder = "Seleccionar Fecha" }: CalendarPickerProps) {
  const [show, setShow] = useState(false);
  const selected = selectedDate ? new Date(selectedDate + 'T12:00:00Z') : new Date();
  const [currentMonth, setCurrentMonth] = useState(new Date(selected.getFullYear(), selected.getMonth(), 1));

  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const startDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();

  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));

  const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

  const handleSelect = (day: number) => {
    const d = new Date(Date.UTC(currentMonth.getFullYear(), currentMonth.getMonth(), day, 12, 0, 0));
    const iso = d.toISOString().split('T')[0];
    onSelect(iso);
    setShow(false);
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <button 
        type="button"
        onClick={() => setShow(!show)}
        className="input-base"
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          cursor: 'pointer',
          textAlign: 'left'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CalendarIcon size={18} color="var(--primary-color)" />
          <span>{selectedDate ? selectedDate : placeholder}</span>
        </div>
        {selectedDate && (
           <div 
             onClick={(e) => { e.stopPropagation(); onSelect(''); }}
             style={{ padding: '0 4px', color: 'var(--text-secondary)' }}
           >
             <X size={16} />
           </div>
        )}
      </button>

      {show && (
        <>
          <div 
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 }} 
            onClick={() => setShow(false)} 
          />
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 50,
            background: 'var(--surface-color)', padding: '1rem',
            borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)',
            minWidth: '280px', border: '1px solid var(--surface-light)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <button type="button" onClick={prevMonth} style={{ color: 'var(--text-primary)' }}><ChevronLeft size={20}/></button>
              <span style={{ fontWeight: 'bold' }}>{monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}</span>
              <button type="button" onClick={nextMonth} style={{ color: 'var(--text-primary)' }}><ChevronRight size={20}/></button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center', marginBottom: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <div>Do</div><div>Lu</div><div>Ma</div><div>Mi</div><div>Ju</div><div>Vi</div><div>Sa</div>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
              {Array.from({ length: startDay }).map((_, i) => <div key={`empty-${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dIso = new Date(Date.UTC(currentMonth.getFullYear(), currentMonth.getMonth(), day, 12, 0, 0)).toISOString().split('T')[0];
                const isSelected = selectedDate === dIso;
                return (
                  <button
                    type="button"
                    key={day}
                    onClick={() => handleSelect(day)}
                    style={{
                      padding: '0.5rem 0',
                      background: isSelected ? 'var(--primary-color)' : 'transparent',
                      color: isSelected ? '#000' : 'var(--text-primary)',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      fontWeight: isSelected ? 'bold' : 'normal'
                    }}
                  >
                    {day}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
