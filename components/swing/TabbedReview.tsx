'use client';

import { useMemo, useState } from 'react';

// Tabbed renderer for analyzer output.
//
// Input is the chunks array (already split by ━━━ in lib/swingSplitter.ts).
// Each chunk's first non-empty line is its heading; we map that heading to a
// category and render the chunks as Chrome-style top tabs so the user can
// jump between sections instead of scrolling one long page.
//
// User-requested ordering: 🎯 最優先 always lands first / default-selected,
// because the most important takeaway is what they came here to see. The
// rest follows roughly the original prompt order (overview → improvements →
// per-phase breakdown → highlights → practice → glossary).

type ChunkInfo = {
  heading: string;
  body: string;
  category: Category;
  tabLabel: string;
  /** Lower = earlier in the tab strip. Same category items keep input order. */
  priority: number;
  /** Optional emoji prefix shown on the tab. Defaults to chunk's leading emoji. */
  emoji: string;
};

type Category =
  | 'priority'   // 🎯 最優先
  | 'reply'      // 💬 補足への返答 (only when user attached a question)
  | 'summary'    // 💬 総合コメント / 総合サマリー
  | 'fixes'      // 🔧 改善点TOP3 / 🔍 プロとの最大の差
  | 'phases'     // 📊 フェーズ別評価/比較
  | 'highlights' // 🌟 良い点 / 改善できた点
  | 'practice'   // 🏋️ おすすめ練習
  | 'glossary'   // 📖 用語集
  | 'other';

// Order = visual order in the tab strip. priority first by request.
const ORDER: Category[] = [
  'priority',
  'summary',
  'reply',
  'fixes',
  'phases',
  'highlights',
  'practice',
  'glossary',
  'other',
];

// Heading patterns. Match the FIRST line of a chunk (after trimming the
// leading emoji whitespace). The pattern is a literal substring search —
// fine because the prompt templates produce consistent headings.
const CATEGORY_RULES: Array<{ patterns: string[]; category: Category; label: string; emoji: string }> = [
  { patterns: ['最優先で直す'],                                    category: 'priority',   label: '最優先で直す',   emoji: '🎯' },
  { patterns: ['補足への返答'],                                    category: 'reply',      label: '補足への返答',   emoji: '💬' },
  { patterns: ['総合コメント', '総合サマリー', '全体サマリー'],     category: 'summary',    label: '総評',           emoji: '💬' },
  { patterns: ['改善点TOP3', '改善点', 'プロとの最大の差', '前回からの変化', '本番で崩れている'],
                                                                    category: 'fixes',      label: '改善点',         emoji: '🔧' },
  { patterns: ['フェーズ別評価', 'フェーズ別比較', 'フェーズ別'],   category: 'phases',     label: 'フェーズ別',     emoji: '📊' },
  { patterns: ['良い点', '改善できた点'],                          category: 'highlights', label: '良い点',         emoji: '🌟' },
  { patterns: ['おすすめ練習', '練習メニュー'],                    category: 'practice',   label: '練習',           emoji: '🏋️' },
  { patterns: ['用語集'],                                          category: 'glossary',   label: '用語',           emoji: '📖' },
];

function classify(head: string, idx: number, total: number): { category: Category; label: string; emoji: string } {
  for (const rule of CATEGORY_RULES) {
    for (const p of rule.patterns) {
      if (head.includes(p)) return { category: rule.category, label: rule.label, emoji: rule.emoji };
    }
  }
  // Fallback: "セクションN"
  return { category: 'other', label: `セクション ${idx + 1}/${total}`, emoji: '📄' };
}

function leadingEmoji(s: string): string {
  // Grab the first run that's outside the basic ASCII / kana / kanji range —
  // good enough to extract the emoji at the head of "🎯 最優先で直す1つ".
  const m = s.match(/^([\p{Emoji_Presentation}\p{Emoji}‍]+)/u);
  return m ? m[1] : '';
}

export function TabbedReview({ chunks }: { chunks: string[] }) {
  const items: ChunkInfo[] = useMemo(() => {
    const arr: ChunkInfo[] = [];
    chunks.forEach((c, i) => {
      const lines = c.split('\n');
      const head = (lines[0] || '').trim();
      const body = lines.slice(1).join('\n').trim();
      const { category, label, emoji: defaultEmoji } = classify(head, i, chunks.length);
      const chunkEmoji = leadingEmoji(head) || defaultEmoji;
      arr.push({
        heading: head,
        body,
        category,
        tabLabel: label,
        emoji: chunkEmoji,
        priority: ORDER.indexOf(category),
      });
    });
    // Stable sort by priority (ORDER index).
    arr.sort((a, b) => a.priority - b.priority);
    return arr;
  }, [chunks]);

  // 最優先 is the default; if it's missing fall back to the first item.
  const [activeIdx, setActiveIdx] = useState<number>(() => {
    const pi = items.findIndex((it) => it.category === 'priority');
    return pi >= 0 ? pi : 0;
  });

  if (!items.length) return null;
  const active = items[Math.min(activeIdx, items.length - 1)];

  return (
    <div className="bg-card rounded-card shadow-card overflow-hidden">
      {/* Tab strip — horizontally scrollable like Chrome's overflow tab bar.
          The active tab gets a green underline + bold weight. */}
      <div
        className="flex gap-0.5 border-b border-border bg-bg overflow-x-auto"
        style={{ scrollbarWidth: 'none' as any }}
      >
        {items.map((it, i) => {
          const selected = i === activeIdx;
          return (
            <button
              key={i}
              onClick={() => setActiveIdx(i)}
              className={`flex-shrink-0 px-3.5 py-2.5 text-[12px] font-bold whitespace-nowrap border-b-[3px] transition-colors ${
                selected
                  ? 'border-green text-green bg-card'
                  : 'border-transparent text-sub hover:text-text'
              }`}
            >
              <span className="mr-1">{it.emoji}</span>{it.tabLabel}
            </button>
          );
        })}
      </div>

      {/* Active section body. We render the heading inside the card so the
          relationship between the tab and the section title stays visible. */}
      <div className="p-4">
        <div className="text-[14px] font-black mb-2">{active.heading}</div>
        <div className="text-[13px] leading-relaxed whitespace-pre-wrap text-text">{active.body || '—'}</div>
      </div>

      {/* Footer hint for first-time users on phones — reminds them the tab
          strip scrolls horizontally if it overflows. */}
      {items.length > 4 && (
        <div className="px-3 pb-2 text-[10px] text-muted text-right">← タブを横スクロールできます →</div>
      )}
    </div>
  );
}
