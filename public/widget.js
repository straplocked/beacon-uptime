(function () {
  const script = document.currentScript;
  if (!script) return;

  const slug = script.getAttribute("data-slug");
  const position = script.getAttribute("data-position") || "bottom-right";
  if (!slug) return;

  const origin = script.src ? new URL(script.src).origin : "";
  const apiUrl = origin + "/api/public/status/" + slug;
  const pageUrl = origin + "/s/" + slug;

  const statusConfig = {
    operational: { label: "All Systems Operational", bg: "#14b8a6", text: "#fff" },
    degraded: { label: "Degraded Performance", bg: "#f59e0b", text: "#fff" },
    major_outage: { label: "Major Outage", bg: "#ef4444", text: "#fff" },
    unknown: { label: "Status Unknown", bg: "#6b7280", text: "#fff" },
  };

  const positionStyles = {
    "bottom-right": "bottom:20px;right:20px;",
    "bottom-left": "bottom:20px;left:20px;",
    "top-right": "top:20px;right:20px;",
    "top-left": "top:20px;left:20px;",
  };

  function createWidget(data) {
    const config = statusConfig[data.status] || statusConfig.unknown;
    const pos = positionStyles[position] || positionStyles["bottom-right"];

    const host = document.createElement("div");
    host.id = "beacon-status-widget";
    const shadow = host.attachShadow({ mode: "closed" });

    shadow.innerHTML =
      '<style>' +
      '.beacon-pill{position:fixed;' + pos + 'z-index:999999;display:flex;align-items:center;gap:8px;' +
      'padding:10px 16px;border-radius:50px;cursor:pointer;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
      'font-size:13px;font-weight:500;text-decoration:none;box-shadow:0 2px 8px rgba(0,0,0,.15);' +
      'transition:transform .15s ease,box-shadow .15s ease;background:' + config.bg + ';color:' + config.text + '}' +
      '.beacon-pill:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,.2)}' +
      '.beacon-dot{width:8px;height:8px;border-radius:50%;background:' + config.text + ';opacity:.9}' +
      '</style>' +
      '<a class="beacon-pill" href="' + pageUrl + '" target="_blank" rel="noopener">' +
      '<span class="beacon-dot"></span>' +
      '<span>' + config.label + '</span>' +
      '</a>';

    document.body.appendChild(host);
  }

  function init() {
    fetch(apiUrl)
      .then(function (res) {
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (data) {
        if (data) createWidget(data);
      })
      .catch(function () {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
