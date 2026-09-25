import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/tokens.css";
import "./styles/global.css";
import "./styles/app.css";
import "./styles/katex-woff2.css";

// 平台标记：让 CSS 只在 macOS 上做「避开红绿灯」这类平台专属留白。
// 用 UA 判断而不是 navigator.platform（后者已废弃，且部分 WebView 返回空）。
if (/Mac/i.test(navigator.userAgent)) {
  document.documentElement.classList.add("is-mac");
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
