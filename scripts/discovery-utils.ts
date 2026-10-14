// Guess the sailing class from free text (a document title or file name).
export function classFromText(s: string): string | null {
  const t = s.toLowerCase().replace(/[_.-]+/g, ' ');
  const map: [RegExp, string][] = [
    [/ilca ?7|laser standard/, 'ILCA 7'],
    [/ilca ?6|laser radial/, 'ILCA 6'],
    [/ilca ?4/, 'ILCA 4'],
    [/optimist|opti\b/, 'Optimist'],
    [/\b420\b/, '420'],
    [/\b470\b/, '470'],
    [/29er/, '29er'],
    [/snipe/, 'Snipe'],
    [/j ?24/, 'J24'],
    [/j ?70/, 'J70'],
    [/f18/, 'F18'],
    [/grumete/, 'Grumete'],
    [/star\b/, 'Star'],
    [/match ?30/, 'Match 30'],
    [/soto ?33|s33/, 'Soto 33'],
    [/\borc\b/, 'ORC'],
    [/phrf/, 'PHRF'],
    [/lightning/, 'Lightning'],
    [/finn/, 'Finn'],
  ];
  return map.find(([re]) => re.test(t))?.[1] ?? null;
}
