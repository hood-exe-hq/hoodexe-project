/** A small Lean 4 tokenizer for the proof viewer: enough to colour comments, strings, keywords and tactics. */

export type LeanToken = { text: string; kind: 'comment' | 'string' | 'keyword' | 'tactic' | 'number' | 'danger' | 'plain' };

const KEYWORDS = new Set([
  'import', 'open', 'namespace', 'section', 'end', 'variable', 'universe', 'theorem', 'lemma', 'def', 'example', 'abbrev',
  'structure', 'class', 'instance', 'inductive', 'where', 'let', 'have', 'show', 'from', 'fun', 'by', 'at', 'with', 'match',
  'if', 'then', 'else', 'do', 'calc', 'noncomputable', 'private', 'protected', 'theorem', 'set_option', 'in', 'deriving',
]);
const TACTICS = new Set([
  'intro', 'intros', 'exact', 'apply', 'refine', 'rw', 'rwa', 'simp', 'simp_all', 'norm_num', 'ring', 'ring_nf', 'linarith',
  'nlinarith', 'omega', 'decide', 'induction', 'cases', 'rcases', 'obtain', 'constructor', 'use', 'exists', 'aesop', 'field_simp',
  'positivity', 'gcongr', 'trivial', 'rfl', 'contradiction', 'exfalso', 'by_contra', 'push_neg', 'specialize', 'unfold', 'tauto',
]);
const DANGER = new Set(['sorry', 'admit', 'native_decide', 'axiom']);

export function tokenizeLean(src: string): LeanToken[] {
  const out: LeanToken[] = [];
  let i = 0;
  const push = (text: string, kind: LeanToken['kind']) => {
    const last = out.at(-1);
    if (last && last.kind === kind && kind === 'plain') last.text += text;
    else out.push({ text, kind });
  };
  while (i < src.length) {
    const rest = src.slice(i);
    if (rest.startsWith('--')) {
      const end = src.indexOf('\n', i);
      const stop = end === -1 ? src.length : end;
      push(src.slice(i, stop), 'comment');
      i = stop;
      continue;
    }
    if (rest.startsWith('/-')) {
      let depth = 0;
      let j = i;
      while (j < src.length) {
        if (src.startsWith('/-', j)) {
          depth++;
          j += 2;
        } else if (src.startsWith('-/', j)) {
          depth--;
          j += 2;
          if (depth === 0) break;
        } else j++;
      }
      push(src.slice(i, j), 'comment');
      i = j;
      continue;
    }
    if (src[i] === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== '"') j += src[j] === '\\' ? 2 : 1;
      push(src.slice(i, j + 1), 'string');
      i = j + 1;
      continue;
    }
    const word = /^[A-Za-z_][A-Za-z0-9_'!?.]*/.exec(rest)?.[0];
    if (word) {
      push(word, DANGER.has(word) ? 'danger' : KEYWORDS.has(word) ? 'keyword' : TACTICS.has(word) ? 'tactic' : 'plain');
      i += word.length;
      continue;
    }
    const num = /^\d+(\.\d+)?/.exec(rest)?.[0];
    if (num) {
      push(num, 'number');
      i += num.length;
      continue;
    }
    push(src[i], 'plain');
    i++;
  }
  return out;
}
