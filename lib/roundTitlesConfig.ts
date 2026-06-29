import 'server-only';
import { getAdminDb } from './firebase';

// ラウンド募集タイトルの定型文（プルダウンの中身）。管理画面から自由に編集でき、
// create / edit 画面が参照する。Firestore: _config/roundTitles（field: titles）。
export const DEFAULT_TITLE_PRESETS = [
  '初心者歓迎！のんびりラウンド',
  'ワイワイ楽しく18ホール',
  '同世代でゆるっとゴルフ',
  '真剣勝負！スコアアップラウンド',
  '平日ゆったりラウンド',
  '土日にラウンドしましょう！',
  '朝活ゴルフ',
  '早朝スルーでサクッと',
  '仕事終わりにサクッとハーフ',
  'ナイターで一緒に回りましょう',
  '女性も安心♪エンジョイゴルフ',
  '20〜30代で集まりましょう',
  '40〜50代でゆったりゴルフ',
  'コンペ前の練習ラウンド',
  '一緒に上達しましょう！',
  '気軽にゴルフ仲間募集',
];

function clean(titles: any[]): string[] {
  const arr = (Array.isArray(titles) ? titles : [])
    .map((t) => String(t ?? '').trim().slice(0, 60))
    .filter((t) => t.length > 0);
  // 重複除去（順序維持）。最大50件。
  return Array.from(new Set(arr)).slice(0, 50);
}

export async function getRoundTitlePresets(): Promise<string[]> {
  const db = getAdminDb() as any;
  if (!db) return DEFAULT_TITLE_PRESETS;
  try {
    const s = await db.collection('_config').doc('roundTitles').get();
    if (s.exists && Array.isArray(s.data()?.titles)) {
      const c = clean(s.data().titles);
      return c.length ? c : DEFAULT_TITLE_PRESETS;
    }
  } catch { /* fall through */ }
  return DEFAULT_TITLE_PRESETS;
}

export async function setRoundTitlePresets(titles: any[]): Promise<string[]> {
  const db = getAdminDb() as any;
  if (!db) throw new Error('firestore not initialized');
  const c = clean(titles);
  await db.collection('_config').doc('roundTitles').set({ titles: c, updatedAt: Date.now() }, { merge: true });
  return c;
}
