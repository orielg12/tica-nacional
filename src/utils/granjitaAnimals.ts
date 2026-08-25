export interface GranjitaAnimal {
  id: string;
  number: string; // Text string: "00", "0", "01" ... "36"
  name: string;
  emoji: string;
}

export const GRANJITA_ANIMALS: GranjitaAnimal[] = [
  { id: '00', number: '00', name: 'Ballena',  emoji: '🐋' },
  { id: '0',  number: '0',  name: 'Delfín',   emoji: '🐬' },
  { id: '1',  number: '1',  name: 'Carnero',  emoji: '🐏' },
  { id: '2',  number: '2',  name: 'Toro',     emoji: '🐂' },
  { id: '3',  number: '3',  name: 'Ciempiés', emoji: '🐛' },
  { id: '4',  number: '4',  name: 'Alacrán',  emoji: '🦂' },
  { id: '5',  number: '5',  name: 'León',     emoji: '🦁' },
  { id: '6',  number: '6',  name: 'Rana',     emoji: '🐸' },
  { id: '7',  number: '7',  name: 'Perico',   emoji: '🦜' },
  { id: '8',  number: '8',  name: 'Ratón',    emoji: '🐭' },
  { id: '9',  number: '9',  name: 'Águila',   emoji: '🦅' },
  { id: '10', number: '10', name: 'Tigre',    emoji: '🐅' },
  { id: '11', number: '11', name: 'Gato',     emoji: '🐈' },
  { id: '12', number: '12', name: 'Caballo',  emoji: '🐎' },
  { id: '13', number: '13', name: 'Mono',     emoji: '🐒' },
  { id: '14', number: '14', name: 'Paloma',   emoji: '🕊️' },
  { id: '15', number: '15', name: 'Zorro',    emoji: '🦊' },
  { id: '16', number: '16', name: 'Oso',      emoji: '🐻' },
  { id: '17', number: '17', name: 'Pavo',     emoji: '🦃' },
  { id: '18', number: '18', name: 'Burro',    emoji: '🫏' },
  { id: '19', number: '19', name: 'Chivo',    emoji: '🐐' },
  { id: '20', number: '20', name: 'Cochino',  emoji: '🐖' },
  { id: '21', number: '21', name: 'Gallo',    emoji: '🐓' },
  { id: '22', number: '22', name: 'Camello',  emoji: '🐪' },
  { id: '23', number: '23', name: 'Cebra',    emoji: '🦓' },
  { id: '24', number: '24', name: 'Iguana',   emoji: '🦎' },
  { id: '25', number: '25', name: 'Gallina',  emoji: '🐔' },
  { id: '26', number: '26', name: 'Vaca',     emoji: '🐄' },
  { id: '27', number: '27', name: 'Perro',    emoji: '🐕' },
  { id: '28', number: '28', name: 'Zamuro',   emoji: '🦅' },
  { id: '29', number: '29', name: 'Elefante', emoji: '🐘' },
  { id: '30', number: '30', name: 'Caimán',   emoji: '🐊' },
  { id: '31', number: '31', name: 'Lapa',     emoji: '🦡' },
  { id: '32', number: '32', name: 'Ardilla',  emoji: '🐿️' },
  { id: '33', number: '33', name: 'Pescado',  emoji: '🐟' },
  { id: '34', number: '34', name: 'Venado',   emoji: '🦌' },
  { id: '35', number: '35', name: 'Jirafa',   emoji: '🦒' },
  { id: '36', number: '36', name: 'Culebra',  emoji: '🐍' },
];

/**
 * Busca un animal por su número (como texto).
 * IMPORTANTE: Las cadenas "0" y "00" son distintas.
 * También acepta dígito simple: "8" → encuentra Ratón ('8'), y "08" → encuentra Ratón ('8').
 */
export function getAnimalByNumber(numStr: string): GranjitaAnimal | undefined {
  if (numStr === undefined || numStr === null) return undefined;
  const s = String(numStr).trim();
  if (s === '00') return GRANJITA_ANIMALS.find(a => a.number === '00');
  if (s === '0') return GRANJITA_ANIMALS.find(a => a.number === '0');

  // Coincidencia directa
  const exact = GRANJITA_ANIMALS.find(a => a.number === s);
  if (exact) return exact;

  // Si viene con cero delante ej. "08", buscar "8"
  if (s.startsWith('0') && s.length === 2) {
    const unpadded = s.substring(1);
    return GRANJITA_ANIMALS.find(a => a.number === unpadded);
  }

  return undefined;
}

/**
 * Devuelve el nombre formateado para ticket o UI: ej. "15 - Zorro"
 */
export function formatAnimalDisplay(numStr: string): string {
  const animal = getAnimalByNumber(numStr);
  if (animal) {
    return `${animal.number} - ${animal.name}`;
  }
  return numStr;
}
