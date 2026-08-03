import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildChartData,
  buildIobSeries,
  calculateInsulinOnBoard,
} from './iob.js';

const SELECTED_DATE = '2026-01-01';

test('breaks the IOB line between separated dose windows', () => {
  const insulinLogs = [
    { units: 4, loggedAt: '2026-01-01T08:00:00' },
    { units: 3, loggedAt: '2026-01-01T18:00:00' },
  ];

  const series = buildIobSeries(insulinLogs, SELECTED_DATE);
  const atEndOfFirstWindow = series.find((entry) => entry.minutesSinceMidnight === 750);
  const justAfterFirstWindow = series.find((entry) => entry.minutesSinceMidnight === 751);
  const atStartOfSecondWindow = series.find((entry) => entry.minutesSinceMidnight === 1080);

  assert.equal(atEndOfFirstWindow.iob, null);
  assert.equal(justAfterFirstWindow.iob, null);
  assert.equal(atStartOfSecondWindow.iob, 3);

  const chartData = buildChartData([], insulinLogs, SELECTED_DATE);
  assert.equal(
    chartData.find((entry) => entry.minutesSinceMidnight === 750).iob,
    null,
  );
});

test('sums IOB from overlapping active doses', () => {
  const insulinLogs = [
    { units: 4, loggedAt: '2026-01-01T08:00:00' },
    { units: 3, loggedAt: '2026-01-01T09:00:00' },
  ];
  const atNine = new Date('2026-01-01T09:00:00');

  const seriesEntry = buildIobSeries(insulinLogs, SELECTED_DATE)
    .find((entry) => entry.minutesSinceMidnight === 540);
  const expectedIob = Number(calculateInsulinOnBoard(insulinLogs, atNine).toFixed(2));

  assert.equal(seriesEntry.iob, expectedIob);
  assert.ok(seriesEntry.iob > 3);
});
