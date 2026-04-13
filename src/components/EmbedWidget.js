import React, { useState } from 'react';

export default function EmbedWidget() {
  const [location, setLocation] = useState('Jonesboro, AR');
  const [copied, setCopied] = useState(false);

  const embedCode = `<iframe src="https://rurality.app/?q=${encodeURIComponent(location)}&embed=1" width="400" height="300" style="border:1px solid #e2e8f0;border-radius:12px" title="Rurality score for ${location}"></iframe>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(embedCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="p-5 sm:p-6" style={{ backgroundColor: 'var(--color-cream)' }}>
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <div>
          <div className="text-[0.65rem] uppercase tracking-[0.28em] font-mono mb-1" style={{ color: 'var(--color-ink-muted)' }}>
            Embed Widget
          </div>
          <h3 className="fg-display text-2xl leading-tight" style={{ color: 'var(--color-ink)' }}>
            Paste it on <em style={{ fontStyle: 'italic', color: 'var(--color-ink-muted)' }}>your</em> page.
          </h3>
        </div>
      </div>

      <p className="text-sm leading-relaxed max-w-2xl mb-5" style={{ color: 'var(--color-ink)', fontFamily: 'var(--font-display)' }}>
        An iframe loads the full app focused on one location. Readers can interact with the
        result, but navigation stays on the dashboard view.
      </p>

      {/* Location input — thin-underline style */}
      <div className="mb-4">
        <label className="text-[0.6rem] uppercase tracking-[0.28em] font-mono block mb-2" style={{ color: 'var(--color-ink-muted)' }}>
          Location
        </label>
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Enter a city, county, or ZIP code…"
          className="w-full py-2 bg-transparent border-b-2 text-base outline-none transition-colors"
          style={{
            borderColor: 'var(--color-rule)',
            color: 'var(--color-ink)',
            fontFamily: 'var(--font-display)',
          }}
          onFocus={(e) => e.target.style.borderColor = 'var(--color-wheat)'}
          onBlur={(e) => e.target.style.borderColor = 'var(--color-rule)'}
        />
      </div>

      {/* Code block */}
      <div>
        <div className="flex items-center justify-between text-[0.6rem] uppercase tracking-[0.28em] font-mono mb-2" style={{ color: 'var(--color-ink-muted)' }}>
          <span>Exhibit &middot; Iframe snippet</span>
          <button onClick={handleCopy}
                  className="px-2.5 py-1 rounded border transition-colors"
                  style={{
                    borderColor: copied ? 'var(--color-wheat)' : 'var(--color-ink-muted)',
                    color: copied ? 'var(--color-wheat)' : 'var(--color-ink-muted)',
                  }}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <div className="relative rounded-md overflow-hidden"
             style={{ backgroundColor: '#0f1a15', border: '1px solid rgba(212,168,67,0.25)' }}>
          <div className="px-4 py-2 flex items-center justify-between border-b border-white/10">
            <span className="flex gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#5c6b62' }} />
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#7a8f82' }} />
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--color-wheat)' }} />
            </span>
            <span className="text-[0.6rem] uppercase tracking-[0.28em] font-mono" style={{ color: 'var(--color-wheat)' }}>
              html
            </span>
          </div>
          <pre className="text-xs sm:text-[0.78rem] p-4 overflow-x-auto whitespace-pre-wrap break-all font-mono leading-relaxed"
               style={{ color: 'rgba(255,255,255,0.92)' }}>
            {embedCode}
          </pre>
        </div>
      </div>

      {/* Note */}
      <div className="mt-4 rounded-md border-l-4 px-4 py-3 text-sm"
           style={{ borderColor: 'var(--color-wheat)', backgroundColor: 'var(--color-parchment)', color: 'var(--color-ink)' }}>
        <span className="text-[0.65rem] uppercase tracking-[0.24em] font-mono mr-2" style={{ color: 'var(--color-ink-muted)' }}>Tip</span>
        Default size is 400&times;300. Adjust <code className="font-mono text-[0.8rem]">width</code> and <code className="font-mono text-[0.8rem]">height</code> in
        the iframe tag to fit your layout. Add <code className="font-mono text-[0.8rem]">&amp;embed=1</code> to strip the site chrome.
      </div>
    </div>
  );
}
