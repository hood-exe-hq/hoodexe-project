import Lean

/-!
# hoodcheck: the trusted half of a formal verification

`hoodcheck <file.olean>` loads a proof that was compiled in a separate, now-gone container and decides whether it
counts. It never runs the proof's code: the compiled file is read as data and never imported (only its imports
are, and they can only resolve to the image's own Lean and Mathlib), every one of its declarations is replayed
through Lean's kernel on top of those imports (so a tampered `.olean` is rejected), and each theorem's axioms are
listed from its actual proof term. A theorem passes only if it rests on Lean's three standard axioms; `sorry`
(`sorryAx`), `native_decide` (`Lean.ofReduceBool`) and any user `axiom` fail it.

Prints one JSON object on stdout; exit 0 when the proof passes, 1 when it doesn't, 2 on a usage or load error.
-/

open Lean

/-- The axioms every Mathlib proof may use. -/
def allowedAxioms : Array Name := #[``propext, ``Classical.choice, ``Quot.sound]

structure TheoremReport where
  name : String
  statement : String
  axioms : Array String
  ok : Bool
  deriving ToJson

structure Verdict where
  ok : Bool
  theorems : Array TheoremReport
  error : Option String := none
  deriving ToJson

def emit (v : Verdict) : IO UInt32 := do
  IO.println (toJson v).compress
  return if v.ok then 0 else 1

/-- Runs a CoreM computation against `env`. -/
def runCore (env : Environment) (x : CoreM α) : IO α := do
  let ctx : Core.Context := { fileName := "<hoodcheck>", fileMap := default, maxHeartbeats := 0 }
  let (a, _) ← x.toIO ctx { env }
  return a

/-- The statement as a mathematician would read it. -/
def statementOf (env : Environment) (ci : ConstantInfo) : IO String := do
  return (← runCore env (Meta.MetaM.run' (Meta.ppExpr ci.type))).pretty 100

/-- `file` is read by its path, never found through the search path: the search path holds only the image's own Lean
and Mathlib, so whatever imports a (possibly forged) compiled proof lists can only resolve to those. -/
def check (file : System.FilePath) : IO UInt32 := do
  unless ← file.pathExists do
    return ← emit { ok := false, theorems := #[], error := some "the proof did not compile to a module" }
  let (data, _) ← readModuleData file
  -- The proof's imports, loaded normally (they are Mathlib and Lean, already trusted), then the proof's own
  -- declarations added one by one through the kernel.
  -- Extensions (notation for printing, precomputed axiom data) need initializers. That runs code from the
  -- *imports* only, which are Mathlib and Lean; the proof itself is never imported, only replayed below.
  enableInitializersExecution
  let imports ← importModules data.imports {} (trustLevel := 0) (loadExts := true)
  let mut fresh : Std.HashMap Name ConstantInfo := {}
  for name in data.constNames, ci in data.constants do
    fresh := fresh.insert name ci
  let env ← try imports.replay fresh catch e =>
    return ← emit { ok := false, theorems := #[], error := some s!"kernel rejected the compiled proof: {e}" }
  let mut reports : Array TheoremReport := #[]
  for name in data.constNames do
    let some ci := env.find? name | continue
    unless ci matches .thmInfo _ do continue
    if name.isInternal then continue
    -- The proof's own theorems are local to `env` (replayed, not imported), so their proof terms are walked rather
    -- than trusting axiom lists stored in the compiled file.
    let axioms ← runCore env (collectAxioms name)
    let ok := axioms.all (allowedAxioms.contains ·)
    reports := reports.push {
      name := name.toString
      statement := ← statementOf env ci
      axioms := axioms.map (·.toString)
      ok }
  if reports.isEmpty then
    return ← emit { ok := false, theorems := #[], error := some "the file proves no theorem" }
  emit { ok := reports.all (·.ok), theorems := reports }

def main (args : List String) : IO UInt32 := do
  let [file] := args | do IO.eprintln "usage: hoodcheck <path to .olean>"; return 2
  initSearchPath (← findSysroot)
  try check file catch e => do
    IO.println (toJson ({ ok := false, theorems := #[], error := some s!"{e}" } : Verdict)).compress
    return 2
