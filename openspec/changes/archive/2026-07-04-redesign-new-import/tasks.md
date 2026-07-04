## 1. Rewrite NewImport component

- [x] 1.1 Replace `src/components/import/NewImport.tsx` with new centered-column layout (max-w-[640px], mx-auto, page title "Import a design")
- [x] 1.2 Build ZIP source card: title, subtitle, dashed dropzone (120px, border-dashed border-vs-border-default rounded-lg)
- [x] 1.3 Build Figma source card: title, subtitle, secondary "Connect Figma" button, muted helper text
- [x] 1.4 Implement dropzone drag-over state: accent border (#7C6FF0), subtle bg tint
- [x] 1.5 Implement file attachment via drop and click-to-browse (hidden file input, accept=".zip")
- [x] 1.6 Implement filename chip state: name + size + remove "x" button, replaces dropzone when file attached
- [x] 1.7 Implement file validation: reject non-ZIP and >50MB with error message below dropzone in #E5484D
- [x] 1.8 Build collapsible "Attach a design system (optional)" section with rotating chevron
- [x] 1.9 Build expanded DS section: smaller dropzone for tokens.json/CSS/ZIP with helper text
- [x] 1.10 Build "Start import" button: disabled state (bg-vs-bg-elevated, text-vs-text-muted) and enabled state (bg-vs-accent, text-white), navigates to import progress on click
- [x] 1.11 Verify build passes and all states render correctly
