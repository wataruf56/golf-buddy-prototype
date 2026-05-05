import type { NextAuthOptions } from 'next-auth';
import LineProvider from 'next-auth/providers/line';
import { isDemoMode } from './demoMode';
import { db } from './db';

export { isDemoMode };

export const authOptions: NextAuthOptions = {
  providers: isDemoMode
    ? []
    : [
        LineProvider({
          clientId: process.env.LINE_CLIENT_ID || '',
          clientSecret: process.env.LINE_CLIENT_SECRET || '',
        }),
      ],
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
