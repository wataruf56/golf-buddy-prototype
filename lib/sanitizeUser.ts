import type { User } from './types';

// Real (kanji) names are private: never expose them in multi-user API responses.
// They reach the round host only via /api/rounds/[id]/participant-names, and the
// user themselves via /api/me. Strip them everywhere else.
//
// `selfId` keeps the current user's own real name intact (so the profile edit
// form, which reads from the bootstrap `me`, can prefill it). Pass null to strip
// for everyone.
export function stripPrivate(user: User, selfId?: string | null): User {
  if (selfId && user.id === selfId) return user;
  if (user.realNameLast === undefined && user.realNameFirst === undefined) return user;
  const { realNameLast, realNameFirst, ...rest } = user;
  return rest as User;
}

export function stripPrivateMany(users: User[], selfId?: string | null): User[] {
  return users.map((u) => stripPrivate(u, selfId));
}
