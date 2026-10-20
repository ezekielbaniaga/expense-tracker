import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { PageHeading } from "./focus";

/**
 * Catches a render error in the page below it, so the header, nav and Sign out
 * stay. Key it by the location: a navigation then mounts a fresh boundary.
 * React has no hook for this, hence the class.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("Page failed to render", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <>
        <PageHeading>Something went wrong</PageHeading>
        <p>
          This page could not be shown. <Link to="/">Back to expenses</Link>
        </p>
      </>
    );
  }
}
