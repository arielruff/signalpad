import React, { useMemo } from "react";

const WEEKS = 15;
const DAYS = 7;

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function ActivityHeatmap({ notes }) {
  const buckets = useMemo(() => {
    const today = startOfDay(new Date());
    const totalDays = WEEKS * DAYS;
    const map = {};

    for (let i = 0; i < totalDays; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - (totalDays - 1 - i));
      map[d.toDateString()] = 0;
    }

    for (const note of notes) {
      for (const ts of [note.updatedAt, note.createdAt]) {
        if (!ts) continue;
        const key = startOfDay(new Date(ts)).toDateString();
        if (key in map) map[key]++;
      }
    }

    return Object.values(map);
  }, [notes]);

  const max = Math.max(...buckets, 1);

  const getColor = (count) => {
    if (count === 0) return "bg-zinc-800/60";
    const intensity = count / max;
    if (intensity < 0.25) return "bg-cyan-900/70";
    if (intensity < 0.5)  return "bg-cyan-700/70";
    if (intensity < 0.75) return "bg-cyan-500/80";
    return "bg-cyan-400";
  };

  // Build column-major grid (7 rows = days of week, N cols = weeks)
  const grid = [];
  for (let col = 0; col < WEEKS; col++) {
    const week = [];
    for (let row = 0; row < DAYS; row++) {
      week.push(buckets[col * DAYS + row]);
    }
    grid.push(week);
  }

  const totalActivity = buckets.reduce((a, b) => a + b, 0);

  return (
    <div>
      <div className="flex gap-[3px]">
        {grid.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map((count, di) => (
              <div
                key={di}
                title={count === 0 ? "No activity" : `${count} note update${count !== 1 ? "s" : ""}`}
                className={`w-[8px] h-[8px] rounded-[2px] transition-colors ${getColor(count)}`}
              />
            ))}
          </div>
        ))}
      </div>
      <p className="text-[9px] text-zinc-600 mt-2">
        {totalActivity} note update{totalActivity !== 1 ? "s" : ""} in the last {WEEKS} weeks
      </p>
    </div>
  );
}
