import React from "react";

/**
 * Protects the Planning page from rendering a blank screen when an unexpected
 * error slips through the data pipelines. Instead of crashing the whole
 * application, we display a friendly fallback with a retry option.
 */
export default class PlanningErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("Planning page rendering error", error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center bg-white p-6 text-center text-slate-800 dark:bg-slate-900 dark:text-slate-100">
          <div className="max-w-lg space-y-3">
            <h1 className="text-xl font-semibold">Une erreur est survenue</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Impossible d'afficher le planning. Merci de réessayer. Si le
              problème persiste, contactez le support.
            </p>
            <button
              type="button"
              onClick={this.handleRetry}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
            >
              Réessayer
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

