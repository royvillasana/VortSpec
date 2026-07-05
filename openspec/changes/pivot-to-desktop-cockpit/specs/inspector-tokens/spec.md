## REMOVED Requirements

### Requirement: Token collections grouped by type
**Reason**: v1 token inspector out of scope for v2; token interpretation is now Claude Code's job via the SDD-DE skills (PRD §3, §13).
**Migration**: None in v2; a token viewer may return post-D4 as a read-only viewer over artifact files.

### Requirement: Token row display
**Reason**: Token inspector out of scope for v2.
**Migration**: None in v2 (deferred artifact viewer).

### Requirement: Token detail view
**Reason**: Token inspector out of scope for v2.
**Migration**: None in v2 (deferred artifact viewer).

### Requirement: Token rename with live preview
**Reason**: IR-mutating token editing removed with the server-side IR.
**Migration**: None in v2; tokens live as files in the project, edited by the agent under approval gates.

### Requirement: Token merge
**Reason**: IR-mutating token editing removed.
**Migration**: None in v2.

### Requirement: Token deletion with fallback
**Reason**: IR-mutating token editing removed; IR is no longer a normative runtime contract.
**Migration**: None in v2.

### Requirement: Promote flagged literal to token
**Reason**: IR provenance/flagging model retired.
**Migration**: None in v2.

### Requirement: Search and filter tokens
**Reason**: Token inspector out of scope for v2.
**Migration**: None in v2 (deferred artifact viewer).
