import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

// Simple test component to verify React is working
function TestApp() {
  return (
    <div style={{ 
      padding: '20px', 
      backgroundColor: 'white', 
      margin: '20px',
      borderRadius: '8px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
    }}>
      <h1 style={{ color: '#333', marginBottom: '10px' }}>
        🎉 React is Working!
      </h1>
      <p style={{ color: '#666' }}>
        If you can see this, React has mounted successfully.
      </p>
      <p style={{ color: '#666', fontSize: '14px' }}>
        Environment: {process.env.NODE_ENV}
      </p>
    </div>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  console.error("Root element not found!");
} else {
  console.log("Root element found, mounting React...");
  const root = createRoot(rootElement);
  root.render(
    <StrictMode>
      <TestApp />
    </StrictMode>
  );
  console.log("React mounted successfully!");
}
