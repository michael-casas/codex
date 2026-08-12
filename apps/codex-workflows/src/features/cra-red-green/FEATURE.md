# CRA RED → GREEN workflow proof

Founder-authorized vertical slice proving that a trusted executable workflow can carry real implementation evidence through an independent failing audit into a bounded remediation and stop at `READY_FOR_EXTERNAL_AUDIT`.

The canonical acceptance contract is `CDX-WF-CRA-RG-GC-1`. Create React App is intentionally pinned to `create-react-app@5.1.0` for a repeatable legacy scaffold; its upstream deprecation is disclosed rather than hidden.

The implementation node is command-evidence bound: its frozen journal node
contains a policy digest and a terminal evidence projection proving one
workflow-owned launcher occurrence and zero direct `npx` or
`create-react-app` command occurrences. Raw command text and output remain
private. Any mismatch fails the workflow before the independent audit starts.
