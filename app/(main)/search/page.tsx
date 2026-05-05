'use client';

import { useMemo, useState } from 'react';
import { RoundCard } from '@/components/RoundCard';
import { allAreas, levelOptions } from '@/lib/mockData';
import { useStore } from '@/lib/store';
import type { Round } from '@/lib/types';
import { cn } from '@/lib/utils';

type Period = 'all' | 'upcoming' | 'past' | 'thisWeek' | 'thisMonth';
type CourseFilter = 'all' | 'confirmed' | 'flexible';
type ScaleFilter = 'all' | 'normal' | 'comp';
type StatusFilter = 'all' | 'open' | 'closed' | 'completed';
type SortBy = 'date' | 'createdAt';

function todayStr(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function parseDate(d?: string): number | null {
  if (!d) return null;
  const t = new Date(d).getTime();
  return isNaN(t) ? null : t;
}

export default function SearchPage() {
  const rounds = useStore((s) => s.rounds);
  const users = useStore((s) => s.users);

  const [filterCourse, setFilterCourse] = useState<CourseFilter>('all');
  const [filterScale, setFilterScale] = useState<ScaleFilter>('all');
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [filterArea, setFilterArea] = useState<string>('all');
  const [filterPeriod, setFilterPeriod] = useState<Period>('upcoming');
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('open');
  const [filterHasSpots, setFilterHasSpots] = useState(false);
  const [filterPriceMax, setFilterPriceMax] = useState<string>('');
  const [keyword, setKeyword] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [open, setOpen] = useState(true);

  const today = todayStr();
  const todayMs = new Date(today).getTime();
  const weekEndMs = todayMs + 7 * 86400000;
  const monthEndMs = todayMs + 31 * 86400000;

  function matches(r: Round): boolean {
    // Status
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    // Course type
    if (filterCourse !== 'all' && r.type !== filterCourse) return false;
    // Scale
    if (filterScale === 'normal' && r.maxSpots >= 5) return false;
    if (filterScale === 'comp' && r.maxSpots < 5) return false;
    // Level
    if (filterLevel !== 'all' && r.levelCondition !== filterLevel) return false;
    // Area
    if (filterArea !== 'all') {
      const inArea = r.area === filterArea || r.courseName?.includes(filterArea);
      if (!inArea) return false;
    }
    // Has-spots
    if (filterHasSpots && r.currentCount >= r.maxSpots) return false;
    // Price max
    if (filterPriceMax) {
      const max = parseInt(filterPriceMax.replace(/[^0-9]/g, ''), 10);
      if (max && r.price) {
        const p = parseInt(r.price.replace(/[^0-9]/g, ''), 10);
        if (p && p > max) return false;
      }
    }
    // Period (date-based)
    const ms = parseDate(r.date);
    if (filterPeriod === 'upcoming') {
      // Date-fixed rounds: only future. Date-undecided rounds: always pass (shown separately).
      if (ms !== null && ms < todayMs) return false;
    } else if (filterPeriod === 'past') {
      if (ms === null) return false; // undecided rounds excluded
      if (ms >= todayMs) return false;
    } else if (filterPeriod === 'thisWeek') {
      if (ms === null) return false;
      if (ms < todayMs || ms > weekEndMs) return false;
    } else if (filterPeriod === 'thisMonth') {
      if (ms === null) return false;
      if (ms < todayMs || ms > monthEndMs) return false;
    }
    // Keyword
    if (keyword.trim()) {
      const k = keyword.trim().toLowerCase();
      const hay = [r.title, r.area, r.courseName, r.description, r.dateRange].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(k)) return false;
    }
    return true;
  }

  const filteredFixed = useMemo(() => {
    const list = rounds.filter((r) => matches(r) && r.date);
    if (sortBy === 'date') {
      list.sort((a, b) => {
        const am = parseDate(a.date) || 0;
        const bm = parseDate(b.date) || 0;
        // future first ascending, past after descending
        const aFuture = am >= todayMs, bFuture = bm >= todayMs;
        if (aFuture !== bFuture) return aFuture ? -1 : 1;
        if (aFuture) return am - bm;
        return bm - am;
      });
    } else {
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }
    return list;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rounds, filterCourse, filterScale, filterLevel, filterArea, filterPeriod, filterStatus, filterHasSpots, filterPriceMax, keyword, sortBy]);

  const filteredUndecided = useMemo(() => {
    if (filterPeriod === 'past' || filterPeriod === 'thisWeek' || filterPeriod === 'thisMonth') return [];
    return rounds.filter((r) => matches(r) && !r.date)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rounds, filterCourse, filterScale, filterLevel, filterArea, filterPeriod, filterStatus, filterHasSpots, filterPriceMax, keyword]);

  const total = filteredFixed.length + filteredUndecided.length;

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
            <FilterGroup label="期間">
              <Chips
                options={[
                  { id: 'upcoming', label: '今日以降' },
                  { id: 'thisWeek', label: '今週' },
                  { id: 'thisMonth', label: '今月' },
                  { id: 'past', label: '過去' },
                  { id: 'all', label: '全期間' },
                ]}
                value={filterPeriod}
                onChange={(v) => setFilterPeriod(v as Period)}
                color="green"
              />
            </FilterGroup>

            <FilterGroup label="ソート">
              <Chips
                options={[
                  { id: 'date', label: '開催日順' },
                  { id: 'createdAt', label: '新着順' },
                ]}
                value={sortBy}
                onChange={(v) => setSortBy(v as SortBy)}
                color="blue"
              />
            </FilterGroup>

            <FilterGroup label="募集状況">
              <Chips
                options={[
                  { id: 'open', label: '募集中' },
                  { id: 'closed', label: '締切' },
                  { id: 'completed', label: '完了' },
                  { id: 'all', label: '全て' },
                ]}
                value={filterStatus}
                onChange={(v) => setFilterStatus(v as StatusFilter)}
                color="green"
              />
            </FilterGroup>

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
                  { id: 'confirmed', label: '✅ 確定' },
                  { id: 'flexible', label: '📍 未定' },
                ]}
                value={filterCourse}
                onChange={(v) => setFilterCourse(v as CourseFilter)}
                color="green"
              />
            </FilterGroup>

            <FilterGroup label="募集タイプ">
              <Chips
                options={[
                  { id: 'all', label: '全て' },
                  { id: 'normal', label: '通常 1〜4人' },
                  { id: 'comp', label: '🏆 コンペ 5人〜' },
                ]}
                value={filterScale}
                onChange={(v) => setFilterScale(v as ScaleFilter)}
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

            <FilterGroup label="その他">
              <div className="flex gap-1.5 flex-wrap">
                <button
                  onClick={() => setFilterHasSpots(!filterHasSpots)}
                  className={cn('px-3.5 py-1.5 rounded-full text-xs font-bold border-[1.5px]',
                    filterHasSpots ? 'bg-green-light border-green text-green' : 'bg-bg border-border text-sub')}
                >
                  ✓ 空きありのみ
                </button>
              </div>
            </FilterGroup>

            <FilterGroup label="予算上限（任意）">
              <input
                inputMode="numeric"
                value={filterPriceMax}
                onChange={(e) => setFilterPriceMax(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="例: 10000（円）"
                className="w-full p-2.5 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none"
              />
            </FilterGroup>

            <button
              onClick={() => {
                setFilterCourse('all'); setFilterScale('all'); setFilterLevel('all');
                setFilterArea('all'); setFilterPeriod('upcoming'); setFilterStatus('open');
                setFilterHasSpots(false); setFilterPriceMax(''); setKeyword(''); setSortBy('date');
              }}
              className="w-full py-2 bg-bg text-sub rounded-lg text-xs font-bold"
            >
              フィルタをリセット
            </button>
          </div>
        )}
      </div>

      <div className="px-5 pb-2 text-xs text-sub">{total}件の募集</div>

      <div className="px-5">
        {filteredFixed.length > 0 && (
          <>
            <div className="text-xs font-bold text-sub mt-3 mb-2">📅 日程確定（{filteredFixed.length}）</div>
            {filteredFixed.map((r) => <RoundCard key={r.id} round={r} host={users.find((u) => u.id === r.hostId)} />)}
          </>
        )}
        {filteredUndecided.length > 0 && (
          <>
            <div className="text-xs font-bold text-sub mt-4 mb-2">📍 日程未定（{filteredUndecided.length}）</div>
            {filteredUndecided.map((r) => <RoundCard key={r.id} round={r} host={users.find((u) => u.id === r.hostId)} />)}
          </>
        )}
        {total === 0 && (
          <div className="text-center py-10 text-muted text-sm">条件に合う募集がありません</div>
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
