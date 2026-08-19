import React from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';

function formatTick(value) {
  const parts = String(value).slice(5).split('-');
  return parts.length === 2 ? `${parts[1]}/${parts[0]}` : value;
}

export default function TrendChart({ data, valueKey = 'rate', color = '#2E7D5B' }) {
  if (!data?.length) return null;

  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <XAxis
            dataKey="date"
            tickFormatter={formatTick}
            tick={{ fill: '#5A6A61', fontSize: 11, fontFamily: 'Poppins, sans-serif' }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: '1px solid #E5DFCF',
              fontFamily: 'Poppins, sans-serif',
              fontSize: 13,
            }}
            formatter={(value) => [`${value}%`, '']}
            labelFormatter={(label) => label}
          />
          <Area
            type="monotone"
            dataKey={valueKey}
            stroke={color}
            strokeWidth={2}
            fill={color}
            fillOpacity={0.09}
            dot={false}
            activeDot={{ r: 3, fill: color, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
