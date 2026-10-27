// Shared keyboard-accessible legend for Public and Technician doughnut charts.
(() => {
  'use strict';
  function clear(canvasId) { document.getElementById(`${canvasId}Legend`)?.replaceChildren(); }
  function render(chart, { selectedIndex = -1, onSelect }) {
    const root = document.getElementById(`${chart.canvas.id}Legend`);
    if (!root) return;
    const focusedIndex = [...root.children].indexOf(document.activeElement);
    const dataset = chart.data.datasets[0];
    root.replaceChildren(...chart.data.labels.map((label, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'donut-legend-row';
      button.setAttribute('aria-pressed', String(index === selectedIndex));
      const dot = document.createElement('span');
      dot.className = 'donut-legend-dot';
      dot.setAttribute('aria-hidden', 'true');
      dot.style.backgroundColor = dataset.backgroundColor[index];
      const name = document.createElement('span');
      name.className = 'donut-legend-name';
      name.textContent = `${label} `;
      const value = document.createElement('span');
      value.className = 'donut-legend-value';
      value.textContent = `${Number(dataset.data[index] ?? 0).toLocaleString('th-TH')} ระบบ`;
      button.append(dot, name, value);
      button.addEventListener('click', () => onSelect(index));
      return button;
    }));
    if (focusedIndex >= 0) root.children[focusedIndex]?.focus({ preventScroll: true });
  }
  window.VWSDoughnutLegend = { render, clear };
})();
