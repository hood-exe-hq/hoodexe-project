import { describe, expect, it } from 'vitest';
import { TIERS, screenProof, stripLeanComments, tierIndex } from './verification';

const OK = `import Mathlib

/-- Two plus two. IO and sorry in a comment don't count. -/
theorem two_add_two : (2 : ℕ) + 2 = 4 := by norm_num -- not #eval either

lemma str : "IO sorry".length = 9 := by rfl
`;

describe('screenProof', () => {
  it('passes an ordinary proof, whatever its comments and strings say', () => {
    expect(screenProof(OK)).toEqual([]);
  });

  it.each([
    ['#eval IO.println "hi"', 'runs code while compiling'],
    ['run_cmd pure ()', 'runs code while compiling'],
    ['elab "x" : term => pure default', 'defines code that runs while compiling'],
    ['initialize foo : IO.Ref Nat ← IO.mkRef 0', 'defines code that runs while compiling'],
    ['@[implemented_by bar] def foo : Nat := 0', 'escapes the kernel'],
    ['unsafe def foo : Nat := 0', 'escapes the kernel'],
    ['def f := IO.Process.spawn', 'uses input/output'],
    ['theorem t : 1 = 1 := by sorry', 'leaves the proof unfinished'],
    ['theorem t : 2 ^ 10 = 1024 := by native_decide', 'trusts compiled code instead of the kernel'],
    ['axiom cheat : False', 'declares an axiom'],
  ])('rejects %s', (line, why) => {
    const problems = screenProof(`import Mathlib\ntheorem ok : True := trivial\n${line}\n`);
    expect(problems.map((p) => p.why)).toContain(why);
    expect(problems.find((p) => p.why === why)?.line).toBe(3);
  });

  it('needs at least one theorem', () => {
    expect(screenProof('def x : Nat := 1').map((p) => p.why)).toEqual(['states no theorem']);
  });

  it('handles nested block comments and keeps line numbers', () => {
    const src = '/- a /- nested IO -/ still comment sorry -/\ntheorem t : True := trivial\n#eval 1';
    expect(stripLeanComments(src).split('\n')).toHaveLength(3);
    expect(screenProof(src)).toEqual([{ line: 3, text: '#eval 1', why: 'runs code while compiling' }]);
  });
});

describe('tiers', () => {
  it('match the contract enum order', () => {
    expect(TIERS).toEqual(['TRIVIAL', 'SIMPLE', 'MEDIUM', 'HARD', 'OPEN']);
    expect(tierIndex('HARD')).toBe(3);
  });
});
