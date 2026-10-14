'use client';

// 「非公開の招待状」（2026-10-14・モック①-2）。非公開の募集（visibility='invite'）に招待された本人にだけ、
// ふつうの招待バナーの代わりに出す。深緑×金の特別なデザインで、ふつうの募集と見た目で区別できるようにする。
// 「参加する」「今回は行けない」の中身は呼び出し側（募集ページの既存の招待フロー）に任せる。

type Row = { label: string; value: string };

export function PrivateInviteCard({
  hostName, title, rows, knownCount, joinLabel, onJoin, onDecline, message, note, canJoin = true, closed = false,
}: {
  closed?: boolean;                 // 受付を終えた募集（ボタンを出さない）
  hostName: string;                 // 「わったーさん」「ゴルトモ公式」（敬称まで含めて渡す）
  title: string;
  rows: Row[];                      // 日時・コース（場所）・費用目安
  knownCount?: number | null;       // 招待された人数が分かるとき（分からなければ「招待された人」）
  joinLabel: string;                // 「参加する（残り1枠）」など
  onJoin: () => void;
  onDecline: () => void;
  message?: string;                 // 主催者からの一言（あれば）
  note?: string;                    // ボタンの下の小さな注記
  canJoin?: boolean;                // 満員などで参加ボタンを出さないとき false
}) {
  const who = knownCount && knownCount > 0 ? `招待された${knownCount}人と${hostName}` : `招待された人と${hostName}`;
  return (
    <div
      className="relative rounded-[18px] p-4 mb-4"
      style={{
        background: 'linear-gradient(160deg,#1F3D2B 0%,#24513A 100%)',
        border: '2.5px solid #C9A227',
        boxShadow: '3px 3px 0 #1F3D2B',
        color: '#FFF8EC',
      }}
    >
      {/* 内側の金の点線 */}
      <div className="absolute pointer-events-none rounded-[14px]" style={{ inset: 5, border: '1px dashed rgba(201,162,39,.55)' }} />
      <div className="relative">
        <div className="flex items-center gap-2.5 mb-2">
          <span
            className="flex-none w-10 h-10 rounded-full grid place-items-center text-[18px]"
            style={{ background: 'radial-gradient(circle at 35% 30%,#F0CF63,#B8891A)', boxShadow: '0 0 0 2px #FFF8EC33' }}
          >🔒</span>
          <div>
            <div className="text-[10.5px] font-black" style={{ letterSpacing: '.18em', color: '#E9CF6B' }}>PRIVATE INVITATION</div>
            <div className="text-[17px] font-black leading-tight">非公開の招待状</div>
          </div>
        </div>
        <div className="text-[12.5px] mb-1" style={{ color: '#E6EFE9' }}>
          {hostName}が、<b style={{ color: '#F0CF63' }}>あなたを選んで</b>招待しました
        </div>
        <div className="text-[18px] font-black leading-snug mb-2">{title}</div>
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-3 text-[13px] py-1.5" style={{ borderBottom: '1px dashed rgba(255,248,236,.25)' }}>
            <span className="flex-none" style={{ color: '#B9CDBF' }}>{r.label}</span>
            <span className="font-bold text-right min-w-0 break-words">{r.value || '—'}</span>
          </div>
        ))}
        {message && (
          <div className="mt-2.5 text-[12.5px] leading-relaxed whitespace-pre-wrap rounded-[10px] p-2.5" style={{ background: 'rgba(255,248,236,.08)', color: '#FFF8EC' }}>
            💬 {message}
          </div>
        )}
        <div className="mt-2.5 rounded-[11px] px-2.5 py-2 text-[12px] leading-relaxed"
          style={{ background: 'rgba(201,162,39,.16)', border: '1px solid rgba(233,207,107,.6)' }}>
          🤫 この募集は<b style={{ color: '#F0CF63' }}>{who}</b>しか知りません。さがす・タイムラインには出ていません
        </div>
        {closed ? (
          <div className="text-[12px] text-center mt-3 font-bold" style={{ color: '#B9CDBF' }}>この募集は受付を終えています</div>
        ) : (<>
        {canJoin && (
          <button
            onClick={onJoin}
            className="w-full mt-3 py-3 rounded-[13px] text-[15px] font-black"
            style={{ background: 'linear-gradient(180deg,#F0CF63,#C9A227)', color: '#1F3D2B', border: '2px solid #1F3D2B' }}
          >{joinLabel}</button>
        )}
        <button
          onClick={onDecline}
          className="w-full mt-2 py-2.5 rounded-[13px] text-[14px] font-black"
          style={{ border: '1.5px solid rgba(255,248,236,.5)', color: '#FFF8EC' }}
        >今回は行けない</button>
        <div className="text-[10.5px] text-center mt-2" style={{ color: '#B9CDBF' }}>
          {note || '「行けない」は主催者にだけ伝わります'}
        </div>
        </>)}
      </div>
    </div>
  );
}
