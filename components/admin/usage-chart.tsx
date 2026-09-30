"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function UsageChart({ data }: { data: Array<{ date: string; scriptsGenerated: number }> }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="#e4e7ec" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#98a2b3" />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#98a2b3" />
          <Tooltip />
          <Line type="monotone" dataKey="scriptsGenerated" name="成功脚本" stroke="#175cd3" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
