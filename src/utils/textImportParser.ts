export interface ParsedPlay {
  number: string;
  amount: number;
  lotteryId?: string | null;
}

export interface ParseResult {
  clientName: string;
  plays: ParsedPlay[];
  detectedLotteryNames: string[];
}

/**
 * Universal parser for lottery plays pasted from WhatsApp, SMS or text lists.
 * Handles:
 * 1. Multi-pair space/newline separated strings: "2 31 2 29 2 17 2 05 1 01 1 02" 
 *    (where token 1 = amount/tiempos, token 2 = number played)
 * 2. Standard formats: "45 10v", "45-10", "10x45", "45:10", "45=10", "10 del 45", "49(4)", "45/10", "45.10"
 */
export function parseImportText(
  importText: string,
  invertOrder: boolean = false
): ParseResult {
  if (!importText || !importText.trim()) {
    return { clientName: '', plays: [], detectedLotteryNames: [] };
  }

  const rawLines = importText.split('\n');
  let clientName = '';
  const plays: ParsedPlay[] = [];
  const detectedLotteryNames: string[] = [];

  // 1. Try extracting explicit client name if label exists
  const nameMatch = importText.match(/(?:Nombre|Cliente|Name|Vendedor|Cajero|Jugador)\s*[:\-=]\s*(.+)/i);
  if (nameMatch) {
    clientName = nameMatch[1].trim();
  }

  // 2. Check if the ENTIRE text is dot-notation plays: "19.4 12.2 16.2 14.2" or on newlines
  const cleanFullText = importText.replace(/[\r\n,]+/g, ' ').trim();
  const allTokens = cleanFullText.split(/\s+/).filter(Boolean);
  
  const isAllDotNotation = allTokens.length >= 1 && allTokens.every(t => /^\d{1,2}\.\d+$/.test(t));
  if (isAllDotNotation) {
    for (const token of allTokens) {
      const dotMatch = token.match(/^(\d{1,2})\.(\d+(?:\.\d+)?)$/);
      if (dotMatch) {
        let num: string;
        let amt: number;
        if (invertOrder) {
          amt = parseFloat(dotMatch[1]);
          num = dotMatch[2].padStart(2, '0');
        } else {
          num = dotMatch[1].padStart(2, '0');
          amt = parseFloat(dotMatch[2]);
        }
        if (!isNaN(amt) && amt > 0 && num) {
          plays.push({ number: num, amount: amt });
        }
      }
    }
    return { clientName, plays, detectedLotteryNames };
  }

  // 2b. Check if the ENTIRE text is a space/newline-separated sequence of pure numbers
  // e.g. "2 31 2 29 2 17 2 05  2 35 1 01 1 02 1 03 1 04  1 06  1 08 1 09  1 53 1 45 1 54 1 21 1 12 1 13 1 07"
  const isPureNumberSequence = allTokens.length >= 2 && 
    allTokens.length % 2 === 0 && 
    allTokens.every(t => /^\d+(\.\d+)?$/.test(t)) &&
    allTokens.filter((_, idx) => idx % 2 === 1).every(t => /^\d{1,2}$/.test(t));

  if (isPureNumberSequence) {
    for (let i = 0; i < allTokens.length - 1; i += 2) {
      const amt = parseFloat(allTokens[i]);
      const numRaw = allTokens[i + 1];
      if (!isNaN(amt) && amt > 0 && numRaw !== undefined) {
        const num = numRaw.padStart(2, '0');
        plays.push({ number: num, amount: amt });
      }
    }
    return { clientName, plays, detectedLotteryNames };
  }

  // 3. Line by line processing
  for (let rawLine of rawLines) {
    let line = rawLine.trim();
    if (!line) continue;

    // Skip decorative dividers or system messages
    if (/^-+$/.test(line) || /^=+$/.test(line) || /^\*+$/.test(line)) continue;
    if (/^(codigo|verificacion|total|monto\s*minimo|procesar|confirmo)/i.test(line)) continue;

    // Detect client name if first non-empty line is pure name
    if (!clientName && plays.length === 0 && !detectedLotteryNames.length) {
      const cleanLine = line.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}]/gu, '').trim();
      if (/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/i.test(cleanLine) && cleanLine.length >= 2 && cleanLine.length <= 30) {
        clientName = cleanLine;
        continue;
      }
    }

    // Check if line contains one or more dot-notation plays: "19.4" or "19.4 12.2 16.2 14.2" or "19.4, 12.2"
    const dotTokens = line.split(/[,\s]+/).filter(Boolean);
    if (dotTokens.length >= 1 && dotTokens.every(t => /^\d{1,2}\.\d+$/.test(t))) {
      for (const token of dotTokens) {
        const dotMatch = token.match(/^(\d{1,2})\.(\d+(?:\.\d+)?)$/);
        if (dotMatch) {
          let num: string;
          let amt: number;
          if (invertOrder) {
            amt = parseFloat(dotMatch[1]);
            num = dotMatch[2].padStart(2, '0');
          } else {
            num = dotMatch[1].padStart(2, '0');
            amt = parseFloat(dotMatch[2]);
          }
          if (!isNaN(amt) && amt > 0 && num) {
            plays.push({ number: num, amount: amt });
          }
        }
      }
      continue;
    }

    // Check if line itself contains a sequence of numeric pairs: "2 31 2 29 2 17 2 05"
    const lineTokens = line.split(/\s+/).filter(Boolean);
    if (lineTokens.length >= 4 && 
        lineTokens.length % 2 === 0 && 
        lineTokens.every(t => /^\d+(\.\d+)?$/.test(t)) &&
        lineTokens.filter((_, idx) => idx % 2 === 1).every(t => /^\d{1,2}$/.test(t))) {
      for (let i = 0; i < lineTokens.length - 1; i += 2) {
        const amt = parseFloat(lineTokens[i]);
        const numRaw = lineTokens[i + 1];
        if (!isNaN(amt) && amt > 0 && numRaw !== undefined) {
          const num = numRaw.padStart(2, '0');
          plays.push({ number: num, amount: amt });
        }
      }
      continue;
    }

    // Standard pattern matching for single line
    const lineClean = line.replace(/\s*v(?:iles)?\s*$/i, '').trim();
    let matched = false;
    let firstVal = '';
    let secondVal = '';
    let isDelFormat = false;

    // Format: "10 del 25" or "10 al 25" (amount DEL number)
    const delMatch = lineClean.match(/^(\d+(?:\.\d+)?)\s+(?:del|al|de|el)\s+(\d{1,2})$/i);
    if (delMatch) {
      firstVal = delMatch[1];
      secondVal = delMatch[2];
      isDelFormat = true;
      matched = true;
    }

    // Format: "45-10" or "45/10" or "45 10" or "45x10" or "45:10" or "45=10" or "45,10" or "45.10"
    if (!matched) {
      const pairMatch = lineClean.match(/^(\d{1,2})\s*[-–—\/x*X:=|\s,\.]\s*(\d+(?:\.\d+)?)$/);
      if (pairMatch) {
        firstVal = pairMatch[1];
        secondVal = pairMatch[2];
        matched = true;
      }
    }

    // Format: "49(4)"
    if (!matched) {
      const parenMatch = lineClean.match(/^(\d{1,2})\s*\((\d+(?:\.\d+)?)\)$/);
      if (parenMatch) {
        firstVal = parenMatch[1];
        secondVal = parenMatch[2];
        matched = true;
      }
    }

    if (matched) {
      let num: string;
      let amt: number;

      if (isDelFormat) {
        amt = parseFloat(firstVal);
        num = secondVal.padStart(2, '0');
      } else if (invertOrder) {
        amt = parseFloat(firstVal);
        num = secondVal.padStart(2, '0');
      } else {
        num = firstVal.padStart(2, '0');
        amt = parseFloat(secondVal);
      }

      if (!isNaN(amt) && amt > 0 && num) {
        plays.push({ number: num, amount: amt });
      }
    }
  }

  return { clientName, plays, detectedLotteryNames };
}
