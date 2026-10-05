import React from 'react';

/**
 * Catches render errors so a broken panel does not blank the whole CRM.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error(error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-6" role="alert">
          <h1 className="text-lg font-semibold text-slate-900">Something went wrong</h1>
          <p className="mt-1 text-sm text-slate-600">Reload the page. If it keeps happening, contact the office.</p>
          <button
            type="button"
            className="btn-primary mt-4"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
