const CHART_WIDTH = 1100;
const CHART_HEIGHT = 420;
const LOW_THRESHOLD = 4;

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function formatDateLabel(timestamp, totalSpanMs) {
  const date = new Date(timestamp);
  const day = String(date.getDate()).padStart(2, '0');
  const month = date.toLocaleString('en-GB', { month: 'short' });
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  if (totalSpanMs <= 24 * 60 * 60 * 1000) {
    return `${hours}:${minutes}`;
  }

  if (totalSpanMs <= 7 * 24 * 60 * 60 * 1000) {
    return `${day} ${month} ${hours}:${minutes}`;
  }

  return `${day} ${month}`;
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
}

function getYDomain(series, targetMin, targetMax) {
  const values = series.map((entry) => Number(entry.glucoseLevel)).filter(Number.isFinite);

  if (Number.isFinite(targetMin)) {
    values.push(targetMin);
  }

  if (Number.isFinite(targetMax)) {
    values.push(targetMax);
  }

  values.push(LOW_THRESHOLD);

  if (!values.length) {
    return [0, 10];
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = min === max ? 1 : Math.max(0.5, (max - min) * 0.15);

  return [Math.max(0, min - padding), max + padding];
}

function createPlaceholderSvg(report) {
  const title = `Glucose readings from ${report.dateRange.startDate} to ${report.dateRange.endDate}`;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${CHART_WIDTH}" height="${CHART_HEIGHT}" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}">
      <rect width="100%" height="100%" fill="#ffffff"/>
      <rect x="40" y="50" width="1020" height="300" rx="18" fill="#f8fafc" stroke="#cbd5e1"/>
      <text x="70" y="105" font-family="Arial, sans-serif" font-size="26" font-weight="700" fill="#0f172a">Glucose Trend</text>
      <text x="70" y="145" font-family="Arial, sans-serif" font-size="18" fill="#475569">${escapeXml(title)}</text>
      <text x="70" y="225" font-family="Arial, sans-serif" font-size="22" fill="#64748b">No glucose data is available for this date range.</text>
    </svg>
  `;
}

function createChartSvg(report) {
  const series = Array.isArray(report.chartSeries) ? report.chartSeries : [];
  if (!series.length) {
    return createPlaceholderSvg(report);
  }

  const margin = { top: 46, right: 42, bottom: 60, left: 66 };
  const plotWidth = CHART_WIDTH - margin.left - margin.right;
  const plotHeight = CHART_HEIGHT - margin.top - margin.bottom;
  const timestamps = series
    .map((entry) => new Date(entry.loggedAt).getTime())
    .filter(Number.isFinite);
  const minX = Math.min(...timestamps);
  const maxX = Math.max(...timestamps);
  const effectiveMaxX = minX === maxX ? minX + 60 * 60 * 1000 : maxX;
  const totalSpanMs = effectiveMaxX - minX;
  const targetMin = Number(report.targetRange?.min);
  const targetMax = Number(report.targetRange?.max);
  const [minY, maxY] = getYDomain(series, targetMin, targetMax);
  const ySpan = maxY - minY || 1;

  const scaleX = (timestamp) => margin.left + ((timestamp - minX) / totalSpanMs) * plotWidth;
  const scaleY = (value) => margin.top + plotHeight - ((value - minY) / ySpan) * plotHeight;

  const linePath = series
    .map((entry, index) => {
      const x = scaleX(new Date(entry.loggedAt).getTime()).toFixed(1);
      const y = scaleY(Number(entry.glucoseLevel)).toFixed(1);
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  const yTicks = Array.from({ length: 6 }, (_, index) => {
    const ratio = index / 5;
    const value = maxY - ratio * ySpan;
    return {
      value: Number(value.toFixed(1)),
      y: margin.top + ratio * plotHeight,
    };
  });

  const xTicks = Array.from({ length: 6 }, (_, index) => {
    const ratio = index / 5;
    const timestamp = minX + ratio * totalSpanMs;
    return {
      label: formatDateLabel(timestamp, totalSpanMs),
      x: margin.left + ratio * plotWidth,
    };
  });

  const targetBand =
    Number.isFinite(targetMin) && Number.isFinite(targetMax) && targetMin < targetMax
      ? `<rect x="${margin.left}" y="${scaleY(targetMax).toFixed(1)}" width="${plotWidth}" height="${(scaleY(targetMin) - scaleY(targetMax)).toFixed(1)}" fill="#86efac" opacity="0.22" />`
      : '';

  const lowLineY = scaleY(LOW_THRESHOLD).toFixed(1);
  const points = series
    .map((entry) => {
      const x = scaleX(new Date(entry.loggedAt).getTime()).toFixed(1);
      const y = scaleY(Number(entry.glucoseLevel)).toFixed(1);
      return `<circle cx="${x}" cy="${y}" r="3.5" fill="#2563eb" />`;
    })
    .join('');

  const title = `Glucose readings from ${report.dateRange.startDate} to ${report.dateRange.endDate}`;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${CHART_WIDTH}" height="${CHART_HEIGHT}" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}">
      <rect width="100%" height="100%" fill="#ffffff"/>
      <text x="${margin.left}" y="28" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#0f172a">Glucose Trend</text>
      <text x="${margin.left}" y="52" font-family="Arial, sans-serif" font-size="15" fill="#64748b">${escapeXml(title)}</text>
      <rect x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}" fill="#ffffff" stroke="#cbd5e1" rx="12" />
      ${targetBand}
      ${yTicks
        .map(
          (tick) => `
            <line x1="${margin.left}" y1="${tick.y.toFixed(1)}" x2="${margin.left + plotWidth}" y2="${tick.y.toFixed(1)}" stroke="#e2e8f0" stroke-dasharray="4 4" />
            <text x="${margin.left - 12}" y="${(tick.y + 5).toFixed(1)}" text-anchor="end" font-family="Arial, sans-serif" font-size="13" fill="#475569">${tick.value.toFixed(1)}</text>
          `
        )
        .join('')}
      ${xTicks
        .map(
          (tick) => `
            <line x1="${tick.x.toFixed(1)}" y1="${margin.top}" x2="${tick.x.toFixed(1)}" y2="${margin.top + plotHeight}" stroke="#f1f5f9" />
            <text x="${tick.x.toFixed(1)}" y="${CHART_HEIGHT - 18}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#475569">${escapeXml(tick.label)}</text>
          `
        )
        .join('')}
      <line x1="${margin.left}" y1="${lowLineY}" x2="${margin.left + plotWidth}" y2="${lowLineY}" stroke="#dc2626" stroke-width="2" stroke-dasharray="8 6" />
      <text x="${margin.left + plotWidth - 2}" y="${Number(lowLineY) - 8}" text-anchor="end" font-family="Arial, sans-serif" font-size="12" fill="#dc2626">Low threshold (4.0)</text>
      <path d="${linePath}" fill="none" stroke="#2563eb" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      ${points}
      <text x="26" y="${margin.top - 8}" font-family="Arial, sans-serif" font-size="13" fill="#334155">mmol/L</text>
    </svg>
  `;
}

export async function createReportChartImageDataUrl(report) {
  const svg = createChartSvg(report);
  const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const image = await loadImage(svgDataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = CHART_WIDTH;
  canvas.height = CHART_HEIGHT;
  const context = canvas.getContext('2d');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL('image/jpeg', 0.92);
}
