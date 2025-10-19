
import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Error boundary component to catch App errors
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('App Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          padding: '20px', 
          backgroundColor: '#fee', 
          margin: '20px',
          borderRadius: '8px',
          border: '2px solid #f00'
        }}>
          <h1 style={{ color: '#c00', marginBottom: '10px' }}>
            ❌ App Error Detected
          </h1>
          <p style={{ color: '#666' }}>
            There's an error in the App component that's preventing it from rendering.
          </p>
          <details style={{ marginTop: '10px' }}>
            <summary style={{ cursor: 'pointer', color: '#666' }}>Error Details</summary>
            <pre style={{ 
              backgroundColor: '#f5f5f5', 
              padding: '10px', 
              marginTop: '10px',
              fontSize: '12px',
              overflow: 'auto'
            }}>
              {this.state.error?.toString()}
            </pre>
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}

console.log("Starting React app with App component...");

const rootElement = document.getElementById("root");
if (!rootElement) {
  console.error("Root element not found!");
} else {
  console.log("Root element found, mounting React with App...");
  try {
    const root = createRoot(rootElement);
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>
    );
    console.log("React mounted successfully with App!");
  } catch (error) {
    console.error("Error mounting React:", error);
  }
}
  