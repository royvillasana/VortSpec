> Group 1 is the whole behavioural change; groups 2–3 are what stop it from silently costing edits. The evidence for this change is a real diff — see proposal.md — so group 4 checks it against that same page.

## 1. Record only what an edit caused

- [ ] 1.1 Enumerate every light-page edit entry point from the guest's command handler (style, text, class/variant, insert, delete, move) — derived from the code, not from memory, so the list cannot be quietly incomplete
- [ ] 1.2 Bracket each one: drain and discard queued mutations before applying, apply, then drain and record. Prove a boolean flag cannot work here (records arrive on a microtask) so it is not reintroduced later
- [ ] 1.3 Make "not recorded" the default: mutations delivered on the observer's normal schedule are runtime and are ignored
- [ ] 1.4 Decide design D3 — whether the CRDT becomes the only save path for adoptable pages — and record the answer with its consequence for pages that cannot be adopted

## 2. Prove no edit is lost

- [ ] 2.1 A test per entry point from 1.1 that the edit reaches the saved file
- [ ] 2.2 A test that fails when an entry point does not mark its changes as authored — the guard for edit types added later
- [ ] 2.3 Verify an edit to a state-like attribute (`aria-pressed`) made through the canvas IS saved

## 3. Prove runtime state is excluded

- [ ] 3.1 A page whose script toggles an attribute: saving an unrelated edit writes only that edit
- [ ] 3.2 A page whose script inserts nodes: they are absent from the file
- [ ] 3.3 Two saves with no edit between them leave the file byte-identical, on a page with a timed animation
- [ ] 3.4 Verify the rule never consults an attribute name — the same attribute is saved or not by provenance alone

## 4. Verify against the page that exposed this

- [ ] 4.1 Reproduce the original diff on `bank-of-america-landing`: move a heading with the hero video toggled, and confirm the file contains the move and not `aria-pressed`
- [ ] 4.2 Confirm single-user editing is otherwise unchanged, with the IDE CT suite green
- [ ] 4.3 Answer design's open question: whether an edit a script then reverses should stay saved
- [ ] 4.4 `/opsx:sync light-page-runtime-state`, then archive
