import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Search } from 'lucide-react';
import { loadPlacesData, searchPlaces, isPlacesLoaded } from '../data/places';
import { ruccTierColor, ruccTierLabel } from '../data/ruralUrbanCodes';
import { stateName } from '../data/states';

/**
 * Search input with a local county typeahead.
 *
 * The index is the whole point: 422 county names are shared across states, so
 * a bare "Washington County" is ambiguous 31 ways. Matching happens against
 * public/data/places.json in memory — no request per keystroke, which also
 * keeps us well inside Nominatim's one-request-per-second policy.
 *
 * The dropdown is a suggestion, never a gate. Anything the user types still
 * submits: addresses and ZIPs aren't in the county index and fall through to
 * the geocoder untouched.
 */

const MAX_SUGGESTIONS = 7;

export default function PlaceTypeahead({
  value,
  onChange,
  onSubmit,
  onPick,
  loading = false,
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [indexReady, setIndexReady] = useState(isPlacesLoaded());
  // Suppresses the dropdown right after a pick, so choosing "Washington
  // County, AR" doesn't immediately re-open on its own text.
  const [dismissed, setDismissed] = useState(false);

  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Load the index on first focus rather than on mount — it's 108 KB that a
  // visitor who never touches the search box shouldn't pay for.
  const ensureIndex = useCallback(() => {
    if (isPlacesLoaded()) { setIndexReady(true); return; }
    loadPlacesData()
      .then(() => setIndexReady(true))
      .catch(() => { /* typeahead is an enhancement — search still works without it */ });
  }, []);

  const { matches, total } = useMemo(() => {
    if (!indexReady || dismissed) return { matches: [], total: 0 };
    return searchPlaces(value, MAX_SUGGESTIONS);
  }, [value, indexReady, dismissed]);

  const showList = open && !dismissed && matches.length > 0;
  const hidden = total - matches.length;

  // Reset the highlight whenever the result set changes underneath it.
  useEffect(() => { setHighlight(-1); }, [value]);

  // Close on any click outside the whole search cluster.
  useEffect(() => {
    if (!showList) return undefined;
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showList]);

  // Keep the highlighted option in view during arrow-key navigation.
  useEffect(() => {
    if (highlight < 0 || !listRef.current) return;
    const el = listRef.current.children[highlight];
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [highlight]);

  const pick = (place) => {
    setDismissed(true);
    setOpen(false);
    setHighlight(-1);
    onChange(place.label);
    onPick(place);
  };

  const handleChange = (e) => {
    setDismissed(false);
    setOpen(true);
    onChange(e.target.value);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown' && !showList && matches.length > 0) {
      setDismissed(false);
      setOpen(true);
      return;
    }

    if (showList) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight(h => (h + 1) % matches.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight(h => (h <= 0 ? matches.length - 1 : h - 1));
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        setHighlight(-1);
        return;
      }
      if (e.key === 'Tab') {
        setOpen(false);
        return;
      }
      if (e.key === 'Enter' && highlight >= 0) {
        e.preventDefault();
        pick(matches[highlight]);
        return;
      }
    }

    if (e.key === 'Enter') {
      // Nothing highlighted — run whatever is in the box. Addresses and ZIPs
      // never appear in the county index and must still be searchable.
      setOpen(false);
      onSubmit(value);
    }
  };

  const activeId = highlight >= 0 ? `place-option-${matches[highlight].fips}` : undefined;

  return (
    <div ref={wrapRef} className="flex-1 relative">
      <Search
        className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 pointer-events-none"
        style={{ color: 'var(--color-ink-muted)' }}
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        type="text"
        placeholder="Enter a city, county, or ZIP code…"
        aria-label="Search for a location"
        role="combobox"
        aria-expanded={showList}
        aria-controls="place-suggestions"
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        autoComplete="off"
        value={value}
        onChange={handleChange}
        onFocus={(e) => {
          ensureIndex();
          setOpen(true);
          e.target.style.borderColor = 'var(--color-wheat)';
        }}
        onBlur={(e) => { e.target.style.borderColor = 'var(--color-rule)'; }}
        onKeyDown={handleKeyDown}
        className="w-full pl-10 pr-4 py-3 bg-transparent border-b-2 text-base outline-none transition-colors"
        style={{
          borderColor: 'var(--color-rule)',
          color: 'var(--color-ink)',
          fontFamily: 'var(--font-display)',
        }}
      />

      {showList && (
        <div
          className="absolute z-30 left-0 right-0 mt-1 rounded-md border overflow-hidden"
          style={{
            backgroundColor: 'var(--color-cream)',
            borderColor: 'var(--color-rule)',
            boxShadow: '0 12px 32px -12px rgba(26,58,42,0.35)',
          }}
        >
          {/* Header states the collision plainly — the count is the finding. */}
          <div
            className="flex items-baseline justify-between px-3 py-2 border-b"
            style={{ borderColor: 'var(--color-rule-soft)', backgroundColor: 'var(--color-parchment)' }}
          >
            <span className="text-[0.58rem] uppercase tracking-[0.28em] font-mono" style={{ color: 'var(--color-ink-muted)' }}>
              {total === 1 ? 'County Match' : `${total} Counties Share This Name`}
            </span>
            <span className="text-[0.58rem] uppercase tracking-[0.2em] font-mono" style={{ color: 'var(--color-ink-subtle)' }}>
              ↑↓ &nbsp;↵
            </span>
          </div>

          {/* Tall enough for all MAX_SUGGESTIONS rows — a half-clipped last row
              reads as a rendering bug rather than as "scroll for more". */}
          <ul
            ref={listRef}
            id="place-suggestions"
            role="listbox"
            aria-label="Matching counties"
            className="max-h-[26rem] overflow-y-auto"
          >
            {matches.map((m, i) => {
              const active = i === highlight;
              return (
                <li
                  key={m.fips}
                  id={`place-option-${m.fips}`}
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setHighlight(i)}
                  onMouseDown={(e) => { e.preventDefault(); pick(m); }}
                  className="flex items-center gap-3 px-3 py-2 cursor-pointer border-b last:border-b-0"
                  style={{
                    borderColor: 'var(--color-rule-soft)',
                    backgroundColor: active ? 'var(--color-parchment)' : 'transparent',
                  }}
                >
                  {/* Tier bar — a glanceable rural/metro read before you commit */}
                  <span
                    aria-hidden="true"
                    className="w-[3px] self-stretch rounded-full flex-shrink-0"
                    style={{ backgroundColor: ruccTierColor(m.rucc) }}
                  />
                  <span className="flex-1 min-w-0">
                    <span
                      className="block truncate text-[0.95rem] leading-tight"
                      style={{ fontFamily: 'var(--font-display)', color: 'var(--color-ink)' }}
                    >
                      {m.name}
                    </span>
                    <span
                      className="block text-[0.62rem] uppercase tracking-[0.18em] font-mono mt-0.5"
                      style={{ color: 'var(--color-ink-subtle)' }}
                    >
                      {stateName(m.st)} &middot; FIPS {m.fips}
                    </span>
                  </span>
                  <span className="flex flex-col items-end flex-shrink-0">
                    <span
                      className="text-[0.7rem] uppercase tracking-[0.22em] font-mono"
                      style={{ color: 'var(--color-ink)' }}
                    >
                      {m.st}
                    </span>
                    <span
                      className="text-[0.58rem] uppercase tracking-[0.14em] font-mono"
                      style={{ color: ruccTierColor(m.rucc) }}
                    >
                      {ruccTierLabel(m.rucc)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>

          {hidden > 0 && (
            <div
              className="px-3 py-2 text-[0.6rem] uppercase tracking-[0.2em] font-mono border-t"
              style={{
                borderColor: 'var(--color-rule-soft)',
                color: 'var(--color-ink-subtle)',
                backgroundColor: 'var(--color-parchment)',
              }}
            >
              +{hidden} more — add a state to narrow
            </div>
          )}
        </div>
      )}

      {/* Announce the collision to screen readers, which can't see the header. */}
      <span className="sr-only" aria-live="polite">
        {showList && !loading
          ? `${total} ${total === 1 ? 'county matches' : 'counties match'}. Use arrow keys to choose.`
          : ''}
      </span>
    </div>
  );
}
