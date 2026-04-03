import React, { useState } from 'react';
import { Code, ExternalLink } from 'lucide-react';

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
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-green-100 dark:border-slate-700 p-6">
      <div className="flex items-center space-x-3 mb-2">
        <Code className="w-5 h-5 text-green-600" />
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Embed Widget</h3>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
        Add a rurality score widget to your website. Enter a location to customize the embed code.
      </p>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Enter location..."
          className="flex-1 px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>

      <div className="relative group">
        <pre className="bg-slate-900 text-green-300 text-xs rounded-xl p-4 overflow-x-auto whitespace-pre-wrap break-all">
          {embedCode}
        </pre>
        <button
          onClick={handleCopy}
          className="absolute top-2 right-2 px-2 py-1 text-xs rounded-md transition-all bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white opacity-0 group-hover:opacity-100"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg text-xs text-blue-700 dark:text-blue-400">
        The embed loads the full app focused on the specified location. Users can interact with
        the result but navigation is limited to the dashboard view.
      </div>
    </div>
  );
}
