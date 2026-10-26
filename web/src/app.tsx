import { useState } from 'react';
import type { CatalogApi } from './api/catalog-api.model';
import { Dashboard } from './components/dashboard';
import { IngestPanel } from './components/ingest-panel';

interface AppProps {
  readonly api: CatalogApi;
}

export function App({ api }: AppProps) {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="layout">
      <header className="layout__header">
        <h1>Multimedia Catalog</h1>
        <p>Books, vinyls, CDs, videos and music in one place.</p>
      </header>
      <main className="layout__main">
        <IngestPanel api={api} onCreated={() => setRefreshKey((key) => key + 1)} />
        <Dashboard api={api} refreshKey={refreshKey} />
      </main>
    </div>
  );
}
