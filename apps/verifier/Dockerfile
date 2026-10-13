# hood.exe formal verification checker: Lean 4 + Mathlib, run per proof with no network, a read-only filesystem
# and hard CPU, memory, process and time limits (see sandbox-config.json and the worker's docker run).
FROM ubuntu:24.04

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl git coreutils \
 && rm -rf /var/lib/apt/lists/*

# Lean toolchain manager, installed system-wide so the unprivileged verifier user can run it.
ENV ELAN_HOME=/opt/elan
ENV PATH=/opt/elan/bin:$PATH
RUN curl -sSfL https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh -o /tmp/elan-init.sh \
 && sh /tmp/elan-init.sh -y --default-toolchain none --no-modify-path \
 && rm /tmp/elan-init.sh

# Heavy, rarely changing layers first: the pinned toolchain, Mathlib's sources and its prebuilt cache (several GB).
WORKDIR /verifier
COPY project/lean-toolchain project/lakefile.toml ./
RUN printf 'def main : IO Unit := pure ()\n' > HoodCheck.lean \
 && elan toolchain install "$(cat lean-toolchain)" \
 && elan default "$(cat lean-toolchain)" \
 && lake update \
 && lake exe cache get \
 && chmod -R a+rX /verifier /opt/elan

# The checker itself, then a smoke test that Mathlib's cache works (one tactic module: `import Mathlib` in full
# needs the 8 GB the sandbox gets, more than a build step may have).
# Lake isn't used at verification time: it would consult git (which refuses repos owned by another user) and may
# try to write. The resolved search path and the exact lean binary are recorded here and used directly.
COPY project/HoodCheck.lean ./
RUN lake build hoodcheck \
 && lake env printenv LEAN_PATH > /verifier/lean-path \
 && elan which lean > /verifier/lean-bin \
 && printf 'import Mathlib.Tactic.NormNum\nexample : (2 : ℕ) + 2 = 4 := by norm_num\n' > /tmp/smoke.lean \
 && LEAN_PATH="$(cat /verifier/lean-path)" "$(cat /verifier/lean-bin)" /tmp/smoke.lean \
 && rm /tmp/smoke.lean

# Mathlib's cache unpacks owner-only (0600), so the download step above makes it readable to the unprivileged
# verifier user in the same layer (a later recursive chmod would copy the whole multi-GB layer).
COPY run-verify.sh /usr/local/bin/run-verify.sh
RUN chmod 0755 /usr/local/bin/run-verify.sh \
 && useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin verifier

USER 10001
ENTRYPOINT ["/usr/local/bin/run-verify.sh"]
