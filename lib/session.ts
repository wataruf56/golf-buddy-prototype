import 'server-only';
import { getServerSession } from 'next-auth';
import { authOptions, isDemoMode } from './auth';

export async function getMeId(): Promise<string | null> {
  if (isDemoMode) return 'me';
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  return id || null;
}
