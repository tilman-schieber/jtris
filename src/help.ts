// In-game help pages. The first pages follow the order of MODES.
// Text uses only characters the pixel font has (A-Z 0-9 space - : . ! / % < > + , ?).

export interface HelpPage {
  title: string;
  /** Paragraphs, word-wrapped when drawn; '' adds a blank line. */
  text: string[];
}

export const HELP_PAGES: HelpPage[] = [
  {
    title: 'A-TYPE',
    text: [
      'THE CLASSIC. PLAY AS LONG AS YOU CAN.',
      '',
      'EVERY 10 LINES THE LEVEL GOES UP AND PIECES FALL FASTER. LEVEL 29 IS THE FAMOUS KILL SCREEN.',
      '',
      'CLEAR 4 LINES AT ONCE FOR A TETRIS - IT IS WORTH FAR MORE THAN 4 SINGLES.',
    ],
  },
  {
    title: 'B-TYPE',
    text: [
      'CLEAR 25 LINES TO WIN.',
      '',
      'SET HEIGHT IN THE MENU TO START ON A PILE OF RANDOM GARBAGE. THE LEVEL STAYS THE SAME ALL GAME.',
      '',
      'WIN TO LAUNCH THE ROCKET! MORE GARBAGE AND MORE POINTS MEAN MORE FIREWORKS.',
    ],
  },
  {
    title: 'SPRINT',
    text: [
      'CLEAR 40 LINES AS FAST AS YOU CAN.',
      '',
      'THE HIGH SCORE TABLE RANKS BY TIME.',
      '',
      'TIP: MODERN RULES WITH HARD DROP AND HOLD ARE MUCH FASTER.',
    ],
  },
  {
    title: 'ULTRA',
    text: [
      'YOU HAVE 2 MINUTES.',
      '',
      'SCORE AS MANY POINTS AS POSSIBLE BEFORE TIME RUNS OUT. TETRISES AND HIGHER LEVELS PAY THE MOST.',
    ],
  },
  {
    title: '20G',
    text: [
      'MAXIMUM GRAVITY: PIECES DROP TO THE FLOOR THE MOMENT THEY APPEAR. SLIDE AND ROTATE THEM BEFORE THEY LOCK.',
      '',
      'ALWAYS USES MODERN RULES.',
      '',
      'CLEAR 100 LINES, THEN SURVIVE 60 SECONDS WITH AN INVISIBLE STACK TO LAUNCH THE ROCKET.',
    ],
  },
  {
    title: 'HATE',
    text: [
      'THE GAME STUDIES YOUR STACK AND ALWAYS GIVES YOU THE WORST POSSIBLE PIECE. THERE IS NO PREVIEW.',
      '',
      'THE HIGH SCORE TABLE RANKS BY LINES. EVERY LINE IS AN ACHIEVEMENT.',
    ],
  },
  {
    title: 'VERSUS',
    text: [
      'TWO PLAYERS, ONE KEYBOARD. BOTH GET THE SAME PIECES.',
      '',
      'CLEARING 2 OR MORE LINES SENDS GARBAGE TO YOUR OPPONENT - A TETRIS SENDS 4. CLEAR LINES TO CANCEL GARBAGE COMING AT YOU.',
      '',
      '1P: W A S D, Q ROTATE LEFT, SPACE DROP, E HOLD',
      '2P: ARROWS, . ROTATE LEFT, RIGHT SHIFT DROP, / HOLD',
    ],
  },
  {
    title: 'RULES',
    text: [
      'CLASSIC: PLAYS LIKE THE NES. NO HOLD, NO HARD DROP, NO WALL KICKS. PIECES LOCK THE MOMENT THEY LAND.',
      '',
      'MODERN: HOLD, HARD DROP, GHOST PIECE, 5 NEXT PIECES, WALL KICKS AND A SHORT LOCK DELAY. BONUS POINTS FOR T-SPINS, COMBOS AND BACK-TO-BACK CLEARS.',
      '',
      'DAILY SEED: EVERYONE GETS THE SAME PIECES TODAY.',
    ],
  },
  {
    title: 'STATS',
    text: [
      'TRT: SHARE OF YOUR LINES THAT CAME FROM TETRISES.',
      'DRT: PIECES SINCE THE LAST LONG BAR. RED MEANS A DROUGHT.',
      'PPS: PIECES PER SECOND.',
      'B2B: BACK-TO-BACK BONUS IS READY.',
      'CMB: LINE CLEARS IN A ROW.',
      '',
      'CLASSIC RULES SHOW A CONTROLLER. ITS BAR FILLS AS AUTO SHIFT CHARGES AND TURNS GREEN WHEN READY.',
    ],
  },
  {
    title: 'CONTROLS',
    text: [
      'LEFT RIGHT: MOVE',
      'DOWN: SOFT DROP',
      'X OR UP: ROTATE RIGHT',
      'Z OR Y: ROTATE LEFT',
      'SPACE: HARD DROP - MODERN',
      'SHIFT OR A: HOLD - MODERN',
      'ENTER OR ESC: PAUSE',
      'BACKSPACE: QUIT WHEN PAUSED',
      'M MUSIC   C COLORS   H SCORES',
      '',
      'ON PHONES USE THE BUTTONS BELOW THE SCREEN.',
    ],
  },
];

/** Splits paragraphs into lines of at most `width` characters. */
export function wrapText(paragraphs: string[], width: number) {
  const lines: string[] = [];
  for (const para of paragraphs) {
    if (!para) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of para.split(' ')) {
      if (line && line.length + 1 + word.length > width) {
        lines.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    lines.push(line);
  }
  return lines;
}
