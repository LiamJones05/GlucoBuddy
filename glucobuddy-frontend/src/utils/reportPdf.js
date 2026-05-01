const PAGE_WIDTH = 1240;
const PAGE_HEIGHT = 1754;
const PDF_PAGE_WIDTH = 595;
const PDF_PAGE_HEIGHT = 842;

function formatDisplayDate(dateText) {
  if (!dateText) {
    return 'N/A';
  }

  const date = new Date(`${dateText}T00:00:00`);
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDisplayDateTime(dateTimeText) {
  if (!dateTimeText) {
    return 'N/A';
  }

  const date = new Date(dateTimeText);
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMetricValue(value, suffix = '') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return 'No data';
  }

  return `${value}${suffix}`;
}

function formatDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return '0m';
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);

  if (hours === 0) {
    return `${remainingMinutes}m`;
  }

  if (remainingMinutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainingMinutes}m`;
}

function createPageCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_WIDTH;
  canvas.height = PAGE_HEIGHT;
  const context = canvas.getContext('2d');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);

  return { canvas, context };
}

function drawRoundedRect(context, x, y, width, height, radius, fillStyle, strokeStyle = null) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
  context.fillStyle = fillStyle;
  context.fill();

  if (strokeStyle) {
    context.strokeStyle = strokeStyle;
    context.lineWidth = 1.5;
    context.stroke();
  }
}

function drawWrappedText(context, text, x, y, maxWidth, lineHeight, color = '#0f172a') {
  const words = String(text).split(/\s+/);
  const lines = [];
  let currentLine = words[0] || '';

  for (let index = 1; index < words.length; index += 1) {
    const testLine = `${currentLine} ${words[index]}`;
    if (context.measureText(testLine).width <= maxWidth) {
      currentLine = testLine;
    } else {
      lines.push(currentLine);
      currentLine = words[index];
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  context.fillStyle = color;
  lines.forEach((line, index) => {
    context.fillText(line, x, y + index * lineHeight);
  });

  return y + lines.length * lineHeight;
}

function drawSectionTitle(context, title, subtitle, y) {
  context.fillStyle = '#0f172a';
  context.font = '700 34px Arial';
  context.fillText(title, 70, y);

  let nextY = y + 22;
  if (subtitle) {
    context.fillStyle = '#64748b';
    context.font = '22px Arial';
    nextY = drawWrappedText(context, subtitle, 70, y + 42, PAGE_WIDTH - 140, 30, '#64748b');
  }

  return nextY + 26;
}

function drawMetricCard(context, x, y, width, height, label, value, helper, accentColor) {
  drawRoundedRect(context, x, y, width, height, 24, '#f8fafc', '#dbe3ee');
  context.fillStyle = accentColor;
  context.fillRect(x, y, 8, height);

  context.fillStyle = '#64748b';
  context.font = '600 21px Arial';
  context.fillText(label, x + 28, y + 42);

  context.fillStyle = '#0f172a';
  context.font = '700 42px Arial';
  context.fillText(value, x + 28, y + 94);

  if (helper) {
    context.fillStyle = '#475569';
    context.font = '22px Arial';
    drawWrappedText(context, helper, x + 28, y + 132, width - 48, 30, '#475569');
  }
}

function drawBadge(context, x, y, text, backgroundColor, textColor) {
  context.font = '700 18px Arial';
  const badgeWidth = context.measureText(text).width + 30;
  drawRoundedRect(context, x, y, badgeWidth, 34, 17, backgroundColor);
  context.fillStyle = textColor;
  context.fillText(text, x + 15, y + 23);
  return badgeWidth;
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
}

async function createPageImages(report, chartImageDataUrl) {
  const chartImage = await loadImage(chartImageDataUrl);
  const pageOne = createPageCanvas();
  const pageTwo = createPageCanvas();

  drawPageOne(pageOne.context, report, chartImage);
  drawPageTwo(pageTwo.context, report);

  return [
    pageOne.canvas.toDataURL('image/jpeg', 0.92),
    pageTwo.canvas.toDataURL('image/jpeg', 0.92),
  ];
}

function drawPageOne(context, report, chartImage) {
  context.fillStyle = '#0f172a';
  context.font = '700 60px Arial';
  context.fillText('GlucoBuddy Report', 70, 92);

  context.fillStyle = '#475569';
  context.font = '24px Arial';
  context.fillText('Educational decision-support summary', 70, 132);

  context.fillStyle = '#0f172a';
  context.font = '700 26px Arial';
  context.fillText(report.user?.name || 'Unknown user', 70, 186);

  context.fillStyle = '#475569';
  context.font = '22px Arial';
  context.fillText(
    `Date range: ${formatDisplayDate(report.dateRange?.startDate)} to ${formatDisplayDate(report.dateRange?.endDate)}`,
    70,
    224
  );
  context.fillText(`Generated: ${formatDisplayDateTime(report.generatedAt)}`, 70, 256);

  const summary = report.summary || {};
  const cardY = 310;
  const cardWidth = 245;
  const gap = 20;
  const cardHeight = 190;
  drawMetricCard(
    context,
    70,
    cardY,
    cardWidth,
    cardHeight,
    'Average glucose',
    formatMetricValue(summary.averageGlucose, ' mmol/L'),
    `${summary.readingCount || 0} logged readings`,
    '#2563eb'
  );
  drawMetricCard(
    context,
    70 + (cardWidth + gap),
    cardY,
    cardWidth,
    cardHeight,
    'Time in range',
    formatMetricValue(summary.timeInRangePercent, '%'),
    'Based on logged readings within target range',
    '#0f766e'
  );
  drawMetricCard(
    context,
    70 + (cardWidth + gap) * 2,
    cardY,
    cardWidth,
    cardHeight,
    'Hypos',
    formatMetricValue(summary.hypoCount),
    'Readings below 4.0 mmol/L',
    '#dc2626'
  );
  drawMetricCard(
    context,
    70 + (cardWidth + gap) * 3,
    cardY,
    cardWidth,
    cardHeight,
    'Hypers',
    formatMetricValue(summary.hyperCount),
    'Readings above 10.0 mmol/L',
    '#d97706'
  );

  let nextY = drawSectionTitle(
    context,
    'Event overview',
    'Estimated episode durations are based on the spacing between your logged readings.',
    560
  );

  const events = report.events || {};
  drawRoundedRect(context, 70, nextY, 520, 140, 24, '#fff1f2', '#fecdd3');
  drawRoundedRect(context, 650, nextY, 520, 140, 24, '#fff7ed', '#fed7aa');

  context.fillStyle = '#9f1239';
  context.font = '700 28px Arial';
  context.fillText('Hypoglycemia episodes', 100, nextY + 42);
  context.fillStyle = '#881337';
  context.font = '24px Arial';
  context.fillText(
    `${events.hypoEpisodes?.count || 0} episodes, total estimated duration ${formatDuration(events.hypoEpisodes?.totalDurationMinutes || 0)}`,
    100,
    nextY + 88
  );
  context.fillText(
    `Average duration ${formatDuration(events.hypoEpisodes?.averageDurationMinutes || 0)}`,
    100,
    nextY + 122
  );

  context.fillStyle = '#9a3412';
  context.font = '700 28px Arial';
  context.fillText('Hyperglycemia episodes', 680, nextY + 42);
  context.fillStyle = '#9a3412';
  context.font = '24px Arial';
  context.fillText(
    `${events.hyperEpisodes?.count || 0} episodes, total estimated duration ${formatDuration(events.hyperEpisodes?.totalDurationMinutes || 0)}`,
    680,
    nextY + 88
  );
  context.fillText(
    `Average duration ${formatDuration(events.hyperEpisodes?.averageDurationMinutes || 0)}`,
    680,
    nextY + 122
  );

  nextY = drawSectionTitle(
    context,
    'Key insights',
    'Rule-based observations drawn from the selected date range.',
    nextY + 200
  );

  const insights = Array.isArray(report.insights) ? report.insights : [];
  if (!insights.length) {
    drawRoundedRect(context, 70, nextY, 1100, 92, 20, '#f8fafc', '#dbe3ee');
    context.fillStyle = '#475569';
    context.font = '24px Arial';
    context.fillText('No strong recurring patterns were detected in this date range.', 100, nextY + 54);
    nextY += 122;
  } else {
    insights.slice(0, 5).forEach((insight, index) => {
      const cardY = nextY + index * 96;
      const isSafety = insight.category === 'safety';
      drawRoundedRect(context, 70, cardY, 1100, 78, 20, '#f8fafc', '#dbe3ee');
      const badgeText = isSafety ? 'Safety' : 'Trend';
      const badgeWidth = drawBadge(
        context,
        96,
        cardY + 22,
        badgeText,
        isSafety ? '#fee2e2' : '#dbeafe',
        isSafety ? '#991b1b' : '#1d4ed8'
      );
      context.fillStyle = '#0f172a';
      context.font = '24px Arial';
      drawWrappedText(context, insight.message, 120 + badgeWidth, cardY + 48, 920, 30, '#0f172a');
    });
    nextY += Math.min(insights.length, 5) * 96 + 12;
  }

  nextY = drawSectionTitle(
    context,
    'Glucose chart',
    'Visual trend across the selected report range.',
    nextY + 34
  );

  drawRoundedRect(context, 70, nextY, 1100, 440, 24, '#f8fafc', '#dbe3ee');
  context.drawImage(chartImage, 90, nextY + 10, 1060, 400);

  context.fillStyle = '#64748b';
  context.font = '20px Arial';
  context.fillText('Page 1 of 2', 70, 1690);
  context.fillText('GlucoBuddy MVP report', 1000, 1690);
}

function drawPageTwo(context, report) {
  context.fillStyle = '#0f172a';
  context.font = '700 52px Arial';
  context.fillText('Time-of-day averages', 70, 92);

  context.fillStyle = '#475569';
  context.font = '24px Arial';
  context.fillText(
    `Target range: ${formatMetricValue(report.targetRange?.min)} to ${formatMetricValue(report.targetRange?.max)} mmol/L`,
    70,
    132
  );
  context.fillText(
    'Average glucose in each 2-hour block across the selected date range.',
    70,
    166
  );

  drawRoundedRect(context, 70, 220, 1100, 84, 20, '#243f5c');
  context.fillStyle = '#ffffff';
  context.font = '700 24px Arial';
  context.fillText('Time block', 100, 272);
  context.fillText('Average glucose', 410, 272);
  context.fillText('Readings', 740, 272);
  context.fillText('Status', 945, 272);

  const rows = Array.isArray(report.timeOfDayAverages) ? report.timeOfDayAverages : [];
  const statusConfig = {
    'in-range': { label: 'In range', bg: '#dcfce7', text: '#166534' },
    'below-range': { label: 'Below range', bg: '#fee2e2', text: '#991b1b' },
    'above-range': { label: 'Above range', bg: '#ffedd5', text: '#9a3412' },
    'no-data': { label: 'No data', bg: '#e2e8f0', text: '#475569' },
  };

  rows.forEach((row, index) => {
    const rowY = 326 + index * 98;
    drawRoundedRect(context, 70, rowY, 1100, 78, 18, index % 2 === 0 ? '#f8fafc' : '#ffffff', '#e2e8f0');

    context.fillStyle = '#0f172a';
    context.font = '600 24px Arial';
    context.fillText(row.fullLabel || row.label, 100, rowY + 48);

    context.fillStyle = '#0f172a';
    context.font = '24px Arial';
    context.fillText(
      row.averageGlucose === null ? 'No data' : `${row.averageGlucose.toFixed(2)} mmol/L`,
      410,
      rowY + 48
    );
    context.fillText(String(row.readingCount || 0), 740, rowY + 48);

    const status = statusConfig[row.status] || statusConfig['no-data'];
    drawBadge(context, 945, rowY + 22, status.label, status.bg, status.text);
  });

  const noteY = 326 + rows.length * 98 + 36;
  context.fillStyle = '#334155';
  context.font = '700 26px Arial';
  context.fillText('Interpretation notes', 70, noteY);

  context.font = '22px Arial';
  drawWrappedText(
    context,
    'Time in range is estimated from logged readings rather than continuous sensor data. Episode durations are approximate and should be interpreted as pattern prompts, not treatment instructions.',
    70,
    noteY + 40,
    1100,
    30,
    '#475569'
  );

  context.fillStyle = '#64748b';
  context.font = '20px Arial';
  context.fillText('Page 2 of 2', 70, 1690);
  context.fillText('GlucoBuddy MVP report', 1000, 1690);
}

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function getJpegDimensions(bytes) {
  let offset = 2;

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1];

    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }

    const length = (bytes[offset + 2] << 8) + bytes[offset + 3];

    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      const height = (bytes[offset + 5] << 8) + bytes[offset + 6];
      const width = (bytes[offset + 7] << 8) + bytes[offset + 8];
      return { width, height };
    }

    offset += 2 + length;
  }

  throw new Error('Unable to determine JPEG dimensions');
}

function createPdfBlob(pageDataUrls) {
  const encoder = new TextEncoder();
  const objects = [];
  const pageObjectNumbers = [];
  let nextObjectNumber = 3;

  pageDataUrls.forEach((dataUrl) => {
    const imageBytes = dataUrlToBytes(dataUrl);
    const { width, height } = getJpegDimensions(imageBytes);
    const imageObjectNumber = nextObjectNumber;
    const contentObjectNumber = nextObjectNumber + 1;
    const pageObjectNumber = nextObjectNumber + 2;
    nextObjectNumber += 3;

    objects[imageObjectNumber] = {
      type: 'stream',
      dict: `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>`,
      data: imageBytes,
    };

    const contentStream = encoder.encode(`q\n${PDF_PAGE_WIDTH} 0 0 ${PDF_PAGE_HEIGHT} 0 0 cm\n/Im0 Do\nQ\n`);
    objects[contentObjectNumber] = {
      type: 'stream',
      dict: `<< /Length ${contentStream.length} >>`,
      data: contentStream,
    };

    objects[pageObjectNumber] = {
      type: 'plain',
      data: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_PAGE_WIDTH} ${PDF_PAGE_HEIGHT}] /Resources << /XObject << /Im0 ${imageObjectNumber} 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`,
    };

    pageObjectNumbers.push(pageObjectNumber);
  });

  objects[1] = {
    type: 'plain',
    data: '<< /Type /Catalog /Pages 2 0 R >>',
  };

  objects[2] = {
    type: 'plain',
    data: `<< /Type /Pages /Count ${pageObjectNumbers.length} /Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(' ')}] >>`,
  };

  const chunks = [];
  let totalLength = 0;
  const offsets = new Array(nextObjectNumber).fill(0);

  function pushString(text) {
    const bytes = encoder.encode(text);
    chunks.push(bytes);
    totalLength += bytes.length;
  }

  function pushBytes(bytes) {
    chunks.push(bytes);
    totalLength += bytes.length;
  }

  pushString('%PDF-1.4\n');

  for (let objectNumber = 1; objectNumber < nextObjectNumber; objectNumber += 1) {
    const object = objects[objectNumber];
    if (!object) {
      continue;
    }

    offsets[objectNumber] = totalLength;
    pushString(`${objectNumber} 0 obj\n`);

    if (object.type === 'stream') {
      pushString(`${object.dict}\nstream\n`);
      pushBytes(object.data);
      pushString('\nendstream\nendobj\n');
    } else {
      pushString(`${object.data}\nendobj\n`);
    }
  }

  const xrefOffset = totalLength;
  pushString(`xref\n0 ${nextObjectNumber}\n`);
  pushString('0000000000 65535 f \n');

  for (let objectNumber = 1; objectNumber < nextObjectNumber; objectNumber += 1) {
    pushString(`${String(offsets[objectNumber]).padStart(10, '0')} 00000 n \n`);
  }

  pushString(`trailer\n<< /Size ${nextObjectNumber} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  return new Blob(chunks, { type: 'application/pdf' });
}

export async function downloadReportPdf(report, chartImageDataUrl) {
  const pageDataUrls = await createPageImages(report, chartImageDataUrl);
  const pdfBlob = createPdfBlob(pageDataUrls);
  const fileName = `glucobuddy-report-${report.dateRange.startDate}-to-${report.dateRange.endDate}.pdf`;
  const url = URL.createObjectURL(pdfBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return fileName;
}

