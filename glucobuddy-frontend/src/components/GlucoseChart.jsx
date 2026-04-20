import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const LOW_THRESHOLD = 4.0;

function formatMinutes(minutesSinceMidnight) {
  const hours = String(Math.floor(minutesSinceMidnight / 60)).padStart(2, '0');
  const minutes = String(minutesSinceMidnight % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function getYDomain(data, targetMin, targetMax) {
  const values = data
    .map((entry) => entry.glucose)
    .filter((value) => Number.isFinite(value));

  if (Number.isFinite(targetMin)) {
    values.push(targetMin);
  }

  if (Number.isFinite(targetMax)) {
    values.push(targetMax);
  }

  values.push(LOW_THRESHOLD);

  if (values.length === 0) {
    return [0, 10];
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = min === max ? 1 : Math.max(0.5, (max - min) * 0.15);

  return [
    Math.max(0, Number((min - padding).toFixed(1))),
    Number((max + padding).toFixed(1)),
  ];
}

function getIobDomain(data) {
  const values = data
    .map((entry) => entry.iob)
    .filter((value) => Number.isFinite(value));

  if (values.length === 0) {
    return [0, 1];
  }

  const max = Math.max(...values);
  const padding = max === 0 ? 0.5 : Math.max(0.5, max * 0.15);

  return [0, Number((max + padding).toFixed(1))];
}

function getXDomain(data) {
  if (data.length === 0) {
    return [0, 1439];
  }

  const values = data.map((entry) => entry.minutesSinceMidnight);
  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) {
    return [Math.max(0, min - 60), Math.min(1439, max + 60)];
  }

  return [Math.max(0, min - 30), Math.min(1439, max + 30)];
}

export default function GlucoseChart({ data, selectedDate, targetMin, targetMax }) {
  const hasTargetRange =
    Number.isFinite(targetMin) &&
    Number.isFinite(targetMax) &&
    targetMin < targetMax;
  const hasIobData = data.some((entry) => Number.isFinite(entry.iob));
  const yDomain = getYDomain(data, targetMin, targetMax);
  const iobDomain = getIobDomain(data);
  const xDomain = getXDomain(data);

  return (
    <div className="chart-container">
      <h3>Glucose Levels</h3>
      <p className="chart-subtitle">Showing readings for {selectedDate}</p>

      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />

          {hasTargetRange ? (
            <ReferenceArea
              yAxisId="glucose"
              y1={targetMin}
              y2={targetMax}
              fill="#86efac"
              fillOpacity={0.22}
              ifOverflow="extendDomain"
            />
          ) : null}

          <XAxis
            type="number"
            dataKey="minutesSinceMidnight"
            domain={xDomain}
            tickFormatter={formatMinutes}
            tickCount={6}
          />
          <YAxis yAxisId="glucose" domain={yDomain} tickCount={6} width={56} />

          {hasIobData ? (
            <YAxis
              yAxisId="iob"
              orientation="right"
              domain={iobDomain}
              tickCount={5}
              width={44}
            />
          ) : null}

          <Tooltip
            labelFormatter={(value) => `Time: ${formatMinutes(value)}`}
            formatter={(value, name) => {
              if (name === 'IOB') {
                return [`${value} units`, 'IOB'];
              }

              return [`${value} mmol/L`, 'Glucose'];
            }}
          />
          <Legend />

          <ReferenceLine
            yAxisId="glucose"
            y={LOW_THRESHOLD}
            stroke="#dc2626"
            strokeDasharray="6 6"
            strokeWidth={2}
            ifOverflow="extendDomain"
            label={{ value: 'Low (4.0)', position: 'right', fill: '#dc2626' }}
          />

          <Line
            type="monotone"
            dataKey="glucose"
            name="Glucose"
            yAxisId="glucose"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
            connectNulls
          />

          {hasIobData ? (
            <Line
              type="monotone"
              dataKey="iob"
              name="IOB"
              yAxisId="iob"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ) : null}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
