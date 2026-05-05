import type { NextAuthOptions } from 'next-auth';
import LineProvider from 'next-auth/providers/line';

export const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

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
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.sub || '';
      }
      return session;
    },
  },
  pages: { signIn: '/login' },
};
