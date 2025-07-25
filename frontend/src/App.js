import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Planning = lazy(() => import('./pages/Planning'));
const Quotes = lazy(() => import('./pages/Quotes'));
const Invoices = lazy(() => import('./pages/Invoices'));
const NotFound = lazy(() => import('./pages/NotFound'));

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="p-6">Loading...</div>}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/planning" element={<Planning />} />
          <Route path="/quotes" element={<Quotes />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
