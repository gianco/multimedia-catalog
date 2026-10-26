import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HttpCatalogApi } from './api/http-catalog-api';
import { App } from './app';
import './styles.css';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('The #root element is missing from index.html.');
}

createRoot(container).render(
  <StrictMode>
    <App api={new HttpCatalogApi()} />
  </StrictMode>,
);
