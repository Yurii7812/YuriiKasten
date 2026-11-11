# Unified display scope and Index — 2026-11-11

## Behavior

The independent Display filter offers All, Paper only and Digital only. It persists in localStorage, projects view data without changing storage, and is applied to note lists, keyword IDs, Topic Index rows and semantic references, reference completion, ID exploration, parent/children/backlinks, similarity results, graph, cards, mandala, canvas note embeds and linked prose expansions. Mixed Topic Indexes remain discoverable when they contain references in the selected namespace.

An excluded editor stays mounted and hidden. Returning to its namespace preserves its draft, cursor and CodeMirror undo history. A paper-only diary displays imported scan pages while retaining the full digital editor. Scope changes remove hidden items from bulk selection. Card editing overlays are hidden in place when excluded.

The old paper-index rail entry now opens the common Index. Its pending-ID storage adapter remains compatible with `K_paperindex` and phone import. The common `+` dialog supports keyword/reading entry, reading suggestions and neighboring-keyword preview, existing-note search, explicit `(p)` / `(d)` IDs, and unscanned paper IDs. Right-click a keyword to edit/remove its associations. Clicking a keyword in search results locates it among its neighbors. Source notes are not deleted by removing an index association.

Topic Index `^`, `+`, `=` map to ↑, ★, ●. Existing Unicode and legacy `+` lines remain readable. The line-type selector replaces a prefix without stripping indentation or changing other rows; the operation participates in undo. A red dot is derived from the existence of a Topic Index for the namespaced ID; stored legacy `*` syntax remains readable. The summary marker ● is separate.

The Topic Index editor uses the existing colon picker but inserts `keyword ID` rows. Ordinary prose retains prefix/postfix references. Candidates identify paper/digital and honor the display filter. Undo/redo does not reopen completion. Numeric or marker-leading titles are quoted so parsing cannot turn them into extra IDs or marker syntax. Markdown projection preserves semantic reference markers.

## Main files

- `display-scope.js`: pure, non-mutating projections and safe Topic Index insertion formatting.
- `src/app.js`, `index.html`: shared filter, unified Index editor, protected editor visibility and all primary views.
- `src/pindex.js`: legacy pending-ID storage adapter; redundant standalone UI removed after replacing its operations.
- `src/reference-picker.js`, `lib.js`, `store.js`: completion, markers, Markdown output, trash namespace metadata.
- `src/linked-content.js`, `src/canvas.js`, `src/roleplay.js`: filtered embedded references and candidate lists.
- `src/shared.js`, `src/i18n.js`: dialog focus and UI translations.
- `test/display-scope.test.js`, `test/graph-scope.test.js`, `test/topic-symbols.test.js`, `test/renderer-persistence.test.js`: projection, compatibility, real graph model and renderer interaction regressions.

## Verification and limits

Final verification: `npm test` passed **147/147 tests**; `npm run build` passed. Run both commands from the repository root to reproduce. Renderer tests execute the real bundled app with a temporary store and mocked Electron IPC. They verify persistence/restart, same-ID namespaces, pending paper IDs, cards/search/Index, Topic Index markers, colon completion, undo/redo, Escape, and paper-diary projection. The graph regression executes the real graph relation builder with both scopes.

The Linux Electron app was launched against a dedicated sample vault. Screens for notes, unified Index/addition, Topic Index/edit/completion/insertion, chat, character management, diary, graph, cards, mandala, canvas, settings and new-item menu were captured for the bilingual guide. Interactive checks included paper-only card filtering and Topic Index colon completion. Existing tests also cover ordinary-note completion and storage/phone compatibility.

Browser rendering of the website and mobile layout could not be verified in this session: the cloud browser cannot reach the local preview server. Static link/asset/anchor/language checks are recorded separately in the homepage repository. Physical USB transfer, Windows/macOS installers and packaged self-updates were not tested. No release installer was produced and no default branch was merged.

The full source text remains visible when editing a mixed Topic Index; filtered read views are never saved over the source. Existing view-specific filters combine with the global scope.
