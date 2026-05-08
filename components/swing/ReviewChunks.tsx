'use client';

// Renders analyzer output chunks (split by ━━━ divider) as vertical cards.
// Each chunk's first line tends to be the heading (e.g. 💬 総合コメント).

export function ReviewChunks({ chunks }: { chunks: string[] }) {
  if (!chunks?.length) return null;
  return (
    <div className="flex flex-col gap-2.5">
      {chunks.map((c, i) => {
        const lines = c.split('\n');
        const head = lines[0]?.trim() || `セクション${i + 1}`;
        const body = lines.slice(1).join('\n').trim();
        return (
          <div key={i} className="bg-card rounded-card p-4 shadow-card">
            <div className="text-[13px] font-bold mb-2">{head}</div>
            {body && (
              <div className="text-[13px] leading-relaxed whitespace-pre-wrap text-text">{body}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
