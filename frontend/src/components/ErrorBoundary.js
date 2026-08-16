import React from "react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("App crash caught by ErrorBoundary:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div data-testid="error-boundary" style={{
          minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", gap: "1rem", background: "#FAF6F0", color: "#1A1A1A",
          fontFamily: "sans-serif", padding: "2rem", textAlign: "center",
        }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Something hit a snag.</h1>
          <p style={{ color: "#777", maxWidth: 420 }}>
            The page ran into an unexpected error. Your data is safe — reload to pick up where you left off.
          </p>
          <button data-testid="error-boundary-reload" onClick={() => window.location.reload()}
            style={{ background: "#D35400", color: "#fff", border: "none", borderRadius: 999,
                     padding: "0.7rem 1.6rem", fontWeight: 700, cursor: "pointer" }}>
            Reload the app
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
