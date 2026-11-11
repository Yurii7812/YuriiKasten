// Backward-compatible storage adapter for unscanned paper IDs.
// All index UI now lives in the common Index in app.js.
let pend = [];            // まだ紙のノートが無いもの [{ kw, reading, ids }]

export function init(docs) { pend = (docs['K_paperindex'] && docs['K_paperindex'].entries) || []; }
export const pendingEntries = () => pend.map(e => ({ kw: e.kw, reading: e.reading || '', ids: [...(e.ids || [])] }));
export const apply = st => { pend = (st.docs && st.docs['K_paperindex'] && st.docs['K_paperindex'].entries) || []; };
