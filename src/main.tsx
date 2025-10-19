
// Simple test to verify JavaScript is working
console.log("JavaScript is loading...");

// Test if DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  console.log("DOM is ready");
  
  const rootElement = document.getElementById("root");
  if (rootElement) {
    console.log("Root element found");
    rootElement.innerHTML = `
      <div style="padding: 20px; background-color: white; margin: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h1 style="color: #333; margin-bottom: 10px;">🎉 JavaScript is Working!</h1>
        <p style="color: #666;">If you can see this, JavaScript has loaded successfully.</p>
        <p style="color: #666; font-size: 14px;">This is a basic test without React.</p>
      </div>
    `;
    console.log("Content added to root element");
  } else {
    console.error("Root element not found!");
  }
});

// Also try immediately in case DOM is already ready
if (document.readyState === 'loading') {
  console.log("Document is still loading, waiting for DOMContentLoaded");
} else {
  console.log("Document is already ready, executing immediately");
  const rootElement = document.getElementById("root");
  if (rootElement) {
    console.log("Root element found (immediate)");
    rootElement.innerHTML = `
      <div style="padding: 20px; background-color: white; margin: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h1 style="color: #333; margin-bottom: 10px;">🎉 JavaScript is Working!</h1>
        <p style="color: #666;">If you can see this, JavaScript has loaded successfully.</p>
        <p style="color: #666; font-size: 14px;">This is a basic test without React.</p>
      </div>
    `;
    console.log("Content added to root element (immediate)");
  }
}
  