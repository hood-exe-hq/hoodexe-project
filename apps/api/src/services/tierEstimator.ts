import { stripLeanComments, type Tier } from '@hood/shared';

/** Theorem names (or name parts) that mark famous hard results; a match is a hint for the reviewer, nothing more. */
const KNOWN_HARD = [/fermat/i, /riemann/i, /goldbach/i, /collatz/i, /twin_?prime/i, /poincare/i, /navier/i, /hodge/i, /abc_?conj/i, /erdos/i, /prime_number_theorem/i];

/**
 * The brief's tier heuristic (§4.4): proof length, imports, Mathlib use, theorem count, famous names. It is easy to
 * game (padding, naming), so it is only ever a SUGGESTION on the admin's review screen: the tier that gets signed
 * and paid is the one the admin approves.
 */
export function estimateTier(source: string): { tier: Tier; reasons: string[] } {
  const code = stripLeanComments(source);
  const lines = code.split('\n').filter((l) => l.trim()).length;
  const imports = (code.match(/^import\s/gm) ?? []).length;
  const usesMathlib = /\bMathlib\b/.test(code);
  const theorems = (code.match(/^\s*(theorem|lemma)\s/gm) ?? []).length;
  const names = [...code.matchAll(/^\s*(?:theorem|lemma)\s+([^\s:({[]+)/gm)].map((m) => m[1]);
  const famous = names.find((n) => KNOWN_HARD.some((re) => re.test(n)));

  let score = 0;
  const reasons: string[] = [];
  if (lines > 500) (score += 2), reasons.push(`${lines} lines of proof`);
  if (lines > 2000) (score += 2), reasons.push('over 2,000 lines');
  if (imports > 5) (score += 1), reasons.push(`${imports} imports`);
  if (usesMathlib) (score += 1), reasons.push('uses Mathlib');
  if (theorems >= 3) (score += 1), reasons.push(`${theorems} theorems`);
  if (famous) (score += 5), reasons.push(`named like a famous result (${famous}): check the statement carefully`);

  const tier: Tier = score >= 7 ? 'OPEN' : score >= 5 ? 'HARD' : score >= 3 ? 'MEDIUM' : score >= 1 ? 'SIMPLE' : 'TRIVIAL';
  return { tier, reasons };
}
