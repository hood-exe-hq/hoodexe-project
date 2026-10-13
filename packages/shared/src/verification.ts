/**
 * Formal verification (hood-exe-formal-verification-brief.md): shared by the API, its verifier worker and the web.
 */

/** Reward tiers, in the VerificationPool contract's enum order (index = the on-chain value). */
export const TIERS = ['TRIVIAL', 'SIMPLE', 'MEDIUM', 'HARD', 'OPEN'] as const;
export type Tier = (typeof TIERS)[number];
export const tierIndex = (t: Tier) => TIERS.indexOf(t);

/** The pool's starting rewards in ETH (brief §3.2); the contract's rewardAmount() is the truth. */
export const DEFAULT_REWARD_ETH: Record<Tier, string> = { TRIVIAL: '0.01', SIMPLE: '0.05', MEDIUM: '0.25', HARD: '1', OPEN: '10' };

/**
 * Where a submission stands. queued → compiling → passed (the checker accepted it; waiting for the admin's review)
 * → approved (the admin set its tier; the worker is marking it on-chain) → verified (marked on-chain and paid), or
 * rejected (the review found it doesn't prove the coin's theorem). failed: didn't compile, or the checker refused it
 * (sorry, extra axioms, timeout).
 */
export const VERIFICATION_STATUSES = ['queued', 'compiling', 'passed', 'approved', 'verified', 'failed', 'rejected'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

/** The largest proof file accepted (brief §1.1). */
export const MAX_PROOF_BYTES = 10 * 1024 * 1024;

/** The axioms a passing theorem may rest on: Lean's own, which all of Mathlib uses. */
export const ALLOWED_AXIOMS = ['propext', 'Classical.choice', 'Quot.sound'] as const;

/** What the trusted checker (apps/verifier/project/HoodCheck.lean) reports for each theorem in a proof. */
export type TheoremReport = { name: string; statement: string; axioms: string[]; ok: boolean };
export type CheckVerdict = { ok: boolean; theorems: TheoremReport[]; error?: string | null };

// ── Source screen ────────────────────────────────────────────────────────────

/**
 * Removes comments (`--` and nested `/- -/`) and the insides of string and char literals, keeping line breaks so
 * positions still match the file. What remains is code.
 */
export function stripLeanComments(src: string): string {
  let out = '';
  let depth = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const next = src[i + 1];
    if (depth > 0) {
      if (c === '/' && next === '-') {
        depth++;
        i++;
      } else if (c === '-' && next === '/') {
        depth--;
        i++;
      } else if (c === '\n') out += '\n';
      continue;
    }
    if (c === '/' && next === '-') {
      depth = 1;
      i++;
      continue;
    }
    if (c === '-' && next === '-') {
      while (i < src.length && src[i] !== '\n') i++;
      out += '\n';
      continue;
    }
    if (c === '"') {
      out += '""';
      for (i++; i < src.length && src[i] !== '"'; i++) {
        if (src[i] === '\\') i++;
        else if (src[i] === '\n') out += '\n';
      }
      continue;
    }
    out += c;
  }
  return out;
}

/** Code a theorem proof never needs: anything that runs programs, touches the system, or escapes the kernel. */
const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  { pattern: /#eval\b|#exit\b|\brun_cmd\b|\brun_elab\b|\brun_meta\b|\brun_tac\b/, why: 'runs code while compiling' },
  { pattern: /\belab\b|\belab_rules\b|\binitialize\b|\bbuiltin_initialize\b/, why: 'defines code that runs while compiling' },
  { pattern: /\bunsafe\b|\bimplemented_by\b|\bextern\b/, why: 'escapes the kernel' },
  { pattern: /\bIO\b|\bSystem\b|\bProcess\b|\bFS\b|\bBaseIO\b|\bEIO\b/, why: 'uses input/output' },
  { pattern: /\bsorry\b|\badmit\b/, why: 'leaves the proof unfinished' },
  { pattern: /\bnative_decide\b|\bdecide!\b|\bofReduceBool\b/, why: 'trusts compiled code instead of the kernel' },
  { pattern: /^\s*axiom\s/m, why: 'declares an axiom' },
];

export type ScreenProblem = { line: number; text: string; why: string };

/**
 * A fast first check of a proof's source before anything compiles it. It rejects code a proof never needs; the
 * trusted checker (kernel replay + axioms) is what actually decides, and the admin reviews every pass.
 */
export function screenProof(src: string): ScreenProblem[] {
  const code = stripLeanComments(src);
  const lines = code.split('\n');
  const problems: ScreenProblem[] = [];
  lines.forEach((line, i) => {
    for (const f of FORBIDDEN) {
      if (f.pattern.test(f.pattern.multiline ? `${line}\n` : line)) problems.push({ line: i + 1, text: src.split('\n')[i].trim().slice(0, 120), why: f.why });
    }
  });
  if (!/\b(theorem|lemma)\s/.test(code)) problems.push({ line: 1, text: '', why: 'states no theorem' });
  return problems;
}
