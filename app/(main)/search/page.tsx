'use client';

import { useMemo, useState } from 'react';
import { RoundCard } from '@/components/RoundCard';
import { allAreas, levelOptions } from '@/lib/mockData';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';

export default function SearchPage() {
  const rounds = useStore((s) => s.rounds);
  const users = useStore((s) => s.users);
  const [filterCourse, setFilterCourse] = useState<'all' | 'confirmed' | 'flexible'>('all');
  const [filterScale, setFilterScale] = useState<'all' | 'normal' | 'comp'>('all');
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [filterArea, setFilterArea] = useState<string>('all');
  const [keyword, setKeyword] = useState('');
  const [open, setOpen] = useState(true);

  const filtered = useMemo(() => rounds.filter((r) => {
    if (r.status !== 'open') return false;
    if (filterCourse !== 'all' && r.type !== filterCourse) return false;
    if (filterScale === 'normal' && r.maxSpots >= 5) return false;
    if (filterScale === 'comp' && r.maxSpots < 5) return false;
    if (filterLevel !== 'all' && r.levelCondition !== filterLevel) return false;
    if (filterArea !== 'all' && r.area !== filterArea && r.courseName?.indexOf(filterArea) === -1) return false;
    if (keyword.trim()) {
      const k = keyword.trim().toLowerCase();
      const hay = [r.title, r.area, r.courseName, r.description, r.dateRange].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(k)) return false;
    }
    return true;
  }), [rounds, filterCourse, filterScale, filterLevel, filterArea, keyword]);

  return (
    <>
      <div className="px-5 pt-2 pb-4 text-2xl font-black tracking-tight">さがす</div>

      <div className="px-5 pb-3">
        <div className="flex gap-2 mb-3">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="タイトル・コース名・エリアで検索"
            className="flex-1 px-4 py-3 border-[1.5px] border-border rounded-xl text-sm bg-card outline-none"
          />
          {keyword && (
            <button onClick={() => setKeyword('')} className="px-3 py-3 bg-bg text-sub rounded-xl text-sm">×</button>
          )}
        </div>

        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3 mb-2"
        >
          <span className="text-sm font-bold">🔍 詳細フィルタ</span>
          <span className="text-muted text-xs">{open ? '▲' : '▼'}</span>
        </button>

        {open && (
          <div className="bg-card border border-border rounded-xl p-4 mb-2 space-y-4">
            <FilterGroup label="エリア">
              <select
                value={filterArea}
                onChange={(e) => setFilterArea(e.target.value)}
                className="w-full p-2.5 border-[1.5px] border-border rounded-[10px] text-sm bg-bg"
              >
                <option value="all">全エリア</option>
                {allAreas.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </FilterGroup>

            <FilterGroup label="コース状況">
              <Chips
                options={[
                  { id: 'all', label: '全て' },
                  { id: 'confirmed', label: '✅ コース確定' },
                  { id: 'flexible', label: '📍 コース未定' },
                ]}
                value={filterCourse}
                onChange={(v) => setFilterCourse(v as typeof filterCourse)}
                color="green"
              />
            </FilterGroup>

            <FilterGroup label="募集タイプ">
              <Chips
                options={[
                  { id: 'all', label: '全て' },
                  { id: 'normal', label: '通常（1〜4人）' },
                  { id: 'comp', label: '🏆 コンペ（5人〜）' },
                ]}
                value={filterScale}
                onChange={(v) => setFilterScale(v as typeof filterScale)}
                color="orange"
              />
            </FilterGroup>

            <FilterGroup label="レベル">
              <Chips
                options={[{ id: 'all', label: '全て' }, ...levelOptions.map((l) => ({ id: l, label: l }))]}
                value={filterLevel}
                onChange={setFilterLevel}
                color="blue"
              />
            </FilterGroup>
          </div>
        )}
      </div>

      <div className="px-5 pb-2 text-xs text-sub">{filtered.length}件の募集</div>
      <div className="px-5">
        {filtered.length === 0 ? (
          <div className="text-center py-10 text-muted text-sm">条件に合う募集がありません</div>
        ) : (
          filtered.map((r) => <RoundCard key={r.id} round={r} host={users.find((u) => u.id === r.hostId)} />)
        )}
      </div>
      <div className="h-5" />
    </>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-bold text-sub mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function Chips({
  options, value, onChange, color,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  color: 'green' | 'orange' | 'blue';
}) {
  const activeMap = {
    green: 'bg-green-light border-green text-green',
    orange: 'bg-orange-light border-orange text-orange',
    blue: 'bg-blue-light border-blue text-blue',
  };
  return (
    <div className="flex gap-1.5 flex-wrap">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            'px-3.5 py-1.5 rounded-full text-xs font-bold border-[1.5px]',
            value === o.id ? activeMap[color] : 'bg-bg border-border text-sub'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
