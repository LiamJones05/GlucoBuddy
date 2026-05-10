import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

const SEGMENTS = [
  { key: 'timeInRangePercent',    label: 'In Range',    color: '#0f766e' },
  { key: 'timeAboveRangePercent', label: 'Above Range', color: '#f59e0b' },
  { key: 'timeBelowRangePercent', label: 'Below Range', color: '#ef4444' },
];

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div className="tir-tooltip">
      <span className="tir-tooltip__label">{name}</span>
      <span className="tir-tooltip__value">{value}%</span>
    </div>
  );
}

export default function TIRDonutChart({ metrics }) {
  const inRange  = Number(metrics?.timeInRangePercent)    || 0;
  const above    = Number(metrics?.timeAboveRangePercent) || 0;
  const below    = Number(metrics?.timeBelowRangePercent) || 0;

  const hasData = inRange + above + below > 0;

  const data = SEGMENTS.map(s => ({
    name:  s.label,
    value: Number(metrics?.[s.key]) || 0,
    color: s.color,
  }));

  return (
    <div className="tir-donut-wrapper">
      <div className="tir-donut-chart">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={hasData ? data : [{ name: 'No data', value: 1, color: '#e2e8f0' }]}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={hasData ? 3 : 0}
              dataKey="value"
              startAngle={90}
              endAngle={-270}
              strokeWidth={0}
            >
              {(hasData ? data : [{ color: '#e2e8f0' }]).map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            {hasData && <Tooltip content={<CustomTooltip />} />}
          </PieChart>
        </ResponsiveContainer>

        {/* Centre label */}
        <div className="tir-donut-centre">
          <span className="tir-donut-centre__value">{inRange}%</span>
          <span className="tir-donut-centre__label">In Range</span>
        </div>
      </div>

      {/* Legend */}
      <div className="tir-legend">
        {SEGMENTS.map(s => (
          <div key={s.key} className="tir-legend__item">
            <span className="tir-legend__dot" style={{ background: s.color }} />
            <span className="tir-legend__label">{s.label}</span>
            <span className="tir-legend__value">
              {Number.isFinite(Number(metrics?.[s.key]))
                ? `${metrics[s.key]}%`
                : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
