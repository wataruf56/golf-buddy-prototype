import type { NextAuthOptions } from 'next-auth';
import { isDemoMode } from './demoMode';
import { db } from './db';

export { isDemoMode };

export const authOptions: NextAuthOptions = {
  // Web の LINE ログイン（NextAuth の LINE プロバイダ）は廃止（2026-10-06）。登録・ログインは LIFF（/liff）だけ。
  // SessionProvider が /api/auth/session を叩くので NextAuth 自体は残すが、サインインできる手段は無い。
  providers: [],
  secret: process.env.NEXTAUTH_SECRET || 'demo-secret-do-not-use-in-prod',
  callbacks: {
    async signIn({ user, account, profile }) {
      try {
        if (!user?.id) return true;
        const existing = await db.getUser(user.id);
        if (!existing) {
          await db.upsertUser({
            id: user.id,
            displayName: user.name || profile?.name || 'ゴルファー',
            avatar: '⛳',
            color: '#2D8C4E',
            age: 0,
            area: '',
            scoreRange: '',
            playStyle: '',
            frequency: '',
            reviewAvg: 0,
            reviewCount: 0,
            roundCount: 0,
            buddyCount: 0,
            lineId: account?.providerAccountId,
          });
        }
      } catch (e) {
        console.error('[auth.signIn] failed to upsert user:', e);
      }
      return true;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = (token.sub || '') as string;
      }
      return session;
    },
  },
  pages: { signIn: '/login' },
};
