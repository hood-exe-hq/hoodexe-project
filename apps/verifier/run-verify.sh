#!/bin/sh
# One step of a verification, run by the worker in its own throwaway container (never both in one):
#
#   run-verify.sh compile   untrusted: compiles /work/proof.lean (read-only) to /out/HoodProof.olean; the proof's
#                           compile-time code runs here, contained by the sandbox. Exit 0 compiled, 1 not, 124 timeout.
#                           The compiler's messages go to /out/compile.log.
#   run-verify.sh check     trusted: /out mounted read-only; hoodcheck loads the compiled proof without running it,
#                           replays it through the kernel and prints the JSON verdict (exit 0 pass, 1 fail).
#
# Lean is called directly with the search path recorded at build time (/verifier/lean-path, /verifier/lean-bin).
set -u
cd /verifier
SEARCH="$(cat /verifier/lean-path)"
LEAN="$(cat /verifier/lean-bin)"

case "${1:-}" in
  compile)
    mkdir -p /tmp/build
    cp /work/proof.lean /tmp/build/HoodProof.lean
    LEAN_PATH="$SEARCH" timeout "${VERIFY_TIMEOUT_SEC:-7200}" "$LEAN" --root=/tmp/build /tmp/build/HoodProof.lean \
      -o /out/HoodProof.olean > /out/compile.log 2>&1
    status=$?
    [ "$status" -eq 124 ] && echo "Timed out after ${VERIFY_TIMEOUT_SEC:-7200} s." >> /out/compile.log
    exit "$status"
    ;;
  check)
    # /out is deliberately not on the search path (see HoodCheck.lean): the compiled proof is read by its path.
    LEAN_PATH="$SEARCH" exec .lake/build/bin/hoodcheck /out/HoodProof.olean
    ;;
  *)
    echo "usage: run-verify.sh compile|check" >&2
    exit 2
    ;;
esac
