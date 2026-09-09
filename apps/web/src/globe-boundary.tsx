import { Component, type ReactNode } from "react";
export class GlobeBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <section className="status-panel workspace-loading">
          <p role="alert">
            The Earth explorer could not be started. Reload the page to try
            again.
          </p>
          <button onClick={() => window.location.reload()}>Reload page</button>
        </section>
      );
    return this.props.children;
  }
}
