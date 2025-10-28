import React, { useEffect, useState } from 'react';
import {
  useLocation,
  useNavigate,
  useOutletContext,
} from 'react-router-dom';
import {
  CardSection,
  SectionHeaderRow,
  FileText as FileTextIcon,
} from '../ui';
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

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const nextTab = mapSearchParamToTab(params.get('tab'));
    const nextClient = params.get('client') ? String(params.get('client')) : '';

    setActiveTab((current) => (current === nextTab ? current : nextTab));
    setClientFilter((current) => (current === nextClient ? current : nextClient));
  }, [location.search]);

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

    navigate({
      pathname: location.pathname,
      search: params.toString() ? `?${params.toString()}` : '',
    }, { replace: true });
    setActiveTab(tabKey);
  };

  const currentClientFilter = clientFilter || undefined;
  const activeTabButtonId = `${CONTENT_DOM_IDS[activeTab]}-tab`;

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
        subtitle={
          currentClientFilter
            ? `Client ciblé : ${currentClientFilter}`
            : undefined
        }
        icon={<FileTextIcon aria-hidden="true" className="h-6 w-6" />}
        className="w-full"
      >
        <div className="flex flex-col gap-4">
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
              <QuotesContent user={user} clientId={currentClientFilter} />
            ) : (
              <InvoicesContent user={user} clientId={currentClientFilter} />
            )}
          </div>
        </div>
      </CardSection>
    </div>
  );
}
