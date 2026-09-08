# Bun React RED → GREEN workflow proof

Founder-authorized vertical slice proving that a trusted executable workflow can carry real implementation evidence through an independent failing audit into a bounded remediation and stop at `READY_FOR_EXTERNAL_AUDIT`.

The canonical acceptance contract is `CDX-WF-BUN-REACT-RG-GC-1`. The workflow invokes `bun create vite@9.2.0 --template react`, installs with Bun 1.4.2, retains `bun.lock`, and rejects npm, npx, pnpm, Yarn, and their lockfiles.

The implementation node is command-evidence bound: its frozen journal node
contains a policy digest and a terminal evidence projection proving one
workflow-owned launcher occurrence, zero direct `vite@9.2.0` scaffold
occurrences, and zero foreign package-manager commands. Raw command text and
output remain private. Any mismatch fails before the independent audit starts.

The historical `cra-red-green` paths, Nx target suffixes, and allowlisted
`CRA_RED_GREEN.md` report filename are compatibility aliases only; they now
execute and describe the Bun/Vite successor and must not be interpreted as
producing Create React App output.
