/**
 * Calcula el monto a pagar para cada categoría de premios basándose en la cantidad de viles/tiempos:
 * 1ro: 11
 * 2do: 3
 * 3ro: 2
 */
export function calculatePrizes(amount: number) {
  return {
    first: Number((amount * 11).toFixed(2)),
    second: Number((amount * 3).toFixed(2)),
    third: Number((amount * 2).toFixed(2)),
  };
}

/**
 * Agrupa números por Decenas. Ej. dada la decena 0, retorna 00, 01, ..., 09.
 * Dada la decena 1, retorna 10, 11, ..., 19.
 */
export function getDecadeNumbers(decadeIndex: number): string[] {
  if (decadeIndex < 0 || decadeIndex > 9) return [];
  const numbers = [];
  for (let i = 0; i < 10; i++) {
    numbers.push(`${decadeIndex}${i}`);
  }
  return numbers;
}
