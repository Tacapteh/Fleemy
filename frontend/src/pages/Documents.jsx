import React, { useCallback, useEffect, useState } from 'react';
import {
  useLocation,
  useNavigate,
  useOutletContext,
} from 'react-router-dom';
import { CardSection, SectionHeaderRow, FileText as FileTextIcon } from '../ui';
import QuotesContent from '../components/documents/QuotesContent';
import InvoicesContent from '../components/documents/InvoicesContent';

const TAB_QUERY_VALUE = {
  quotes: 'devis',
  invoices: 'factures',
};

const TAB_ORDER = ['quotes', 'invoices'];

const TAB_LABELS = {
  quotes: 'Devis',
  invoices: 'Factures',
};

const CONTENT_DOM_IDS = {
  quotes: 'documents-tabpanel-quotes',
  invoices: 'documents-tabpanel-invoices',
};

const mapSearchParamToTab = (value) => {
  if (value === 'factures') {
    return 'invoices';
  }
  if (value === 'devis') {
    return 'quotes';
  }
  return 'quotes';
};

export default function Documents() {
  const { user } = useOutletContext();
  const location = useLocation();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(location.search);
    return mapSearchParamToTab(params.get('tab'));
  });
  const [clientFilter, setClientFilter] = useState(() => {
    const params = new URLSearchParams(location.search);
    const value = params.get('client');
    return value ? String(value) : '';
  });
  const [createIntentEnabled, setCreateIntentEnabled] = useState(() => {
    const params = new URLSearchParams(location.search);
    return params.get('create') === 'true';
  });

  const [quoteCreateHandler, setQuoteCreateHandler] = useState(null);
  const [invoiceCreateHandler, setInvoiceCreateHandler] = useState(null);

  const registerQuoteCreateHandler = useCallback((handler) => {
    setQuoteCreateHandler(() => (typeof handler === 'function' ? handler : null));
  }, []);

  const registerInvoiceCreateHandler = useCallback((handler) => {
    setInvoiceCreateHandler(() => (typeof handler === 'function' ? handler : null));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const normalizedTab = mapSearchParamToTab(params.get('tab'));
    const expectedTabParam = TAB_QUERY_VALUE[normalizedTab];

    if (params.get('tab') !== expectedTabParam) {
      params.set('tab', expectedTabParam);
      navigate(
        {
          pathname: location.pathname,
          search: params.toString() ? `?${params.toString()}` : '',
        },
        { replace: true },
      );
      return;
    }

    const nextClient = params.get('client') ? String(params.get('client')) : '';
    const hasCreateIntent = params.get('create') === 'true';

    setActiveTab((current) => (current === normalizedTab ? current : normalizedTab));
    setClientFilter((current) => (current === nextClient ? current : nextClient));
    setCreateIntentEnabled((current) =>
      current === hasCreateIntent ? current : hasCreateIntent,
    );
  }, [location.pathname, location.search, navigate]);

  const basePillButton =
    'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900';
  const neutralPillClasses =
    'bg-slate-200/80 text-slate-800 hover:bg-slate-300 dark:bg-slate-800/70 dark:text-slate-100 dark:hover:bg-slate-700/70';
  const activePillClasses =
    'bg-blue-500 text-white shadow-md shadow-blue-900/25 hover:bg-blue-500';

  const handleTabClick = (tabKey) => {
    if (!TAB_ORDER.includes(tabKey) || tabKey === activeTab) {
      return;
    }

    const params = new URLSearchParams(location.search);
    params.set('tab', TAB_QUERY_VALUE[tabKey]);
    if (clientFilter) {
      params.set('client', clientFilter);
    } else {
      params.delete('client');
    }

    if (createIntentEnabled) {
      params.set('create', 'true');
    } else {
      params.delete('create');
    }

    navigate({
      pathname: location.pathname,
      search: params.toString() ? `?${params.toString()}` : '',
    }, { replace: true });
    setActiveTab(tabKey);
  };

  const currentClientFilter = clientFilter || undefined;
  const activeTabButtonId = `${CONTENT_DOM_IDS[activeTab]}-tab`;
  const createIntent = createIntentEnabled;
  const activeCreateHandler = activeTab === 'quotes' ? quoteCreateHandler : invoiceCreateHandler;
  const hasClientSelection = Boolean(currentClientFilter);

  const handleLaunchCreateIntent = useCallback(() => {
    if (!activeCreateHandler) {
      return;
    }

    activeCreateHandler({
      clientId: hasClientSelection ? currentClientFilter : undefined,
    });
  }, [activeCreateHandler, currentClientFilter, hasClientSelection]);

  const handleDismissCreateIntent = useCallback(() => {
    const params = new URLSearchParams(location.search);
    params.delete('create');
    if (clientFilter) {
      params.set('client', clientFilter);
    } else {
      params.delete('client');
    }
    params.set('tab', TAB_QUERY_VALUE[activeTab]);

    navigate(
      {
        pathname: location.pathname,
        search: params.toString() ? `?${params.toString()}` : '',
      },
      { replace: true },
    );
    setCreateIntentEnabled(false);
  }, [activeTab, clientFilter, location.pathname, location.search, navigate]);

  const createButtonLabel =
    activeTab === 'quotes'
      ? hasClientSelection
        ? 'Créer un devis pour ce client'
        : 'Créer un nouveau devis'
      : hasClientSelection
        ? 'Créer une facture pour ce client'
        : 'Créer une nouvelle facture';

  const createButtonAriaLabel = createButtonLabel;

  const createIntentDescription =
    activeTab === 'quotes'
      ? hasClientSelection
        ? 'Vous êtes prêt à créer un nouveau devis pour ce client.'
        : 'Vous êtes prêt à créer un nouveau devis.'
      : hasClientSelection
        ? 'Vous êtes prêt à créer une nouvelle facture pour ce client.'
        : 'Vous êtes prêt à créer une nouvelle facture.';

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 text-slate-900 dark:text-slate-100">
      <SectionHeaderRow
        headingLevel={1}
        icon={<FileTextIcon aria-hidden="true" className="h-7 w-7" />}
        iconClassName="text-gray-900 dark:text-slate-100"
        title="Documents clients"
        titleClassName="text-3xl font-bold text-gray-900 dark:text-slate-100"
        className="flex-col items-start gap-4 sm:flex-row sm:items-center"
        data-testid="documents-page-title"
      />

      <CardSection
        title="Documents"
        icon={<FileTextIcon aria-hidden="true" className="h-6 w-6" />}
        className="w-full"
      >
        <div className="flex flex-col gap-4">
          {currentClientFilter && (
            <div
              className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200"
              aria-live="polite"
            >
              <span className="font-semibold">Client sélectionné : </span>
              <span>
                {/* TODO: remplacer par le nom du client lorsque disponible dans ce composant. */}
                Client sélectionné (ID: {currentClientFilter})
              </span>
            </div>
          )}

          {createIntent && (
            <div
              className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-900 shadow-sm dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-100"
              aria-live="polite"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="font-semibold">{createIntentDescription}</p>
                  {hasClientSelection && (
                    <p className="text-sm">
                      Client ciblé : <span className="font-medium">{currentClientFilter}</span>
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleLaunchCreateIntent}
                    className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:bg-blue-300 dark:bg-blue-500 dark:hover:bg-blue-400 dark:focus-visible:ring-offset-slate-900"
                    aria-label={createButtonAriaLabel}
                    disabled={!activeCreateHandler}
                  >
                    {createButtonLabel}
                  </button>
                  <button
                    type="button"
                    onClick={handleDismissCreateIntent}
                    className="inline-flex items-center justify-center rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:text-blue-200 dark:hover:bg-blue-500/20 dark:focus-visible:ring-offset-slate-900"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            </div>
          )}

          <div
            role="tablist"
            aria-label="Documents clients"
            className="flex flex-wrap gap-2"
          >
            {TAB_ORDER.map((tabKey) => {
              const tabButtonId = `${CONTENT_DOM_IDS[tabKey]}-tab`;
              const isActive = tabKey === activeTab;
              return (
                <button
                  key={tabKey}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={CONTENT_DOM_IDS[tabKey]}
                  id={tabButtonId}
                  tabIndex={isActive ? 0 : -1}
                  className={`${basePillButton} ${
                    isActive ? activePillClasses : neutralPillClasses
                  }`}
                  onClick={() => handleTabClick(tabKey)}
                >
                  {TAB_LABELS[tabKey]}
                </button>
              );
            })}
          </div>

          <div
            id={CONTENT_DOM_IDS[activeTab]}
            role="tabpanel"
            aria-labelledby={activeTabButtonId}
            className="mt-2"
          >
            {activeTab === 'quotes' ? (
              <QuotesContent
                user={user}
                clientId={currentClientFilter}
                onRegisterCreateHandler={registerQuoteCreateHandler}
              />
            ) : (
              <InvoicesContent
                user={user}
                clientId={currentClientFilter}
                onRegisterCreateHandler={registerInvoiceCreateHandler}
              />
            )}
          </div>
        </div>
      </CardSection>
    </div>
  );
}
