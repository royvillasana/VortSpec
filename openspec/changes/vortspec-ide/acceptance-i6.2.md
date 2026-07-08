# I6.2 — End-to-end validation through the IDE UI

**Task 7.2 acceptance.** Drive every IDE capability through the real app on macOS,
against a real workspace, with a live (usage-spending) Claude run. Check each box
and record the real values in the blanks. Nothing here is automatable — it needs a
display + a logged-in Claude Code; this doc is the script.

## Prerequisites (verified 2026-07-08)

- [x] Claude Code installed & on PATH — `claude 2.1.204` at `~/.local/bin/claude`
- [ ] **Claude Code is logged in** (run `claude` once in a terminal if unsure; the
      IDE drives your own login, non-bare — no keys)
- [x] SDD-DE toolkit skills available (`setup`, `generate-artifacts`, `storybook`,
      `design-doc`, `visual-verify`)
- [x] Test workspace: `/Users/royvillasana/Desktop/Roy Villasana/Proyectos/sdd based test`
      - `design-engineering-system` · React / TS / Tailwind
      - git repo · 34 components in `.sdd-de/components.json`
      - `design_source: figma` → Design Engineering System file
      - `dev` (vite) + `storybook` scripts → live preview works
      - `token_file: src/styles/tokens.css` · `component_dir: src/components`
- [ ] (optional) figma-cli connected in yolo mode — exercises the Wave 1–3 paths

## Launch

In this Claude Code session, type the line below (the `!` runs it here so the boot
log lands in the conversation; the Electron window opens on your screen):

```
! pnpm --filter @vortspec/ide dev
```

Then open the workspace above via **Open a folder** (or the recents list).

## The run — one box per 7.2 capability

Record the **run/session id** from the assistant dock's run header where asked.

1. **Open a workspace**
   - [ ] Picker → open `sdd based test`; the four-region shell appears (activity bar,
         Explorer + editor + preview, assistant dock).

2. **Run the pipeline** (the SDD-DE panel added in 7.1)
   - [ ] Activity bar → **SDD-DE pipeline**; all six stages render with live status
         (design-system → components → visual-verify → sync → design-manifest → commit).
   - [ ] Kick a real stage (e.g. build one remaining component from the roster, or the
         **Build Figma selection** button if figma-cli is connected). A live run streams
         in the dock.
     - run/session id: `__________________`
   - [ ] The run completes (or is cancelable); the roster re-reads from files.

3. **Edit code in Monaco**
   - [ ] Explorer → open `src/components/ui/…` a component; edit a line; the tab shows
         a dirty dot; **Cmd-S** saves (no crash, file on disk updated).

4. **Use the terminal**
   - [ ] **Ctrl-`** opens the integrated terminal in the workspace root; run
         `git status` and `ls src/components` — output streams back; Ctrl-C works.

5. **See the live preview**
   - [ ] Toggle side-by-side; start the preview (app `dev` or `storybook`); the running
         server embeds in the preview pane and hot-reloads on an edit.
     - preview URL: `__________________`

6. **View a Git diff**
   - [ ] With an edited file open, toggle **Diff vs HEAD**; Monaco's diff editor shows
         your change against `git show HEAD:<path>` (additive-only guardrails intact).

7. **Vibe-engineer a change with the gates intact**
   - [ ] In the assistant dock (modify mode), confirm the **Context** chip shows the open
         file + preview URL (I5 grounding).
   - [ ] Ask for a small, real change to the open component; a live run edits it.
     - run/session id: `__________________`
   - [ ] Spec-first gates hold: any artifact/`DESIGN.md` change stays behind the reused
         Manifest approval path — nothing advances without your approval.

## Result

- [ ] **All seven pass end-to-end through the IDE UI** → I6.2 done.
- Date run: `__________`  ·  macOS: `__________`  ·  Notes: `__________________`

> Once this passes, mark task 7.2 `[x]` in `tasks.md`. The only remaining I6 item is
> 7.3 (package `apps/ide` → dmg → release), which the site's "Download the IDE" button
> already points at.
