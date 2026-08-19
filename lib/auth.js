import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { query } from './db.js';
import { id } from './ids.js';

const COOKIE = 'radar_session';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  try {
    const [salt, expected] = stored.split(':');
    const actual = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(actual, Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await query('INSERT INTO sessions (id,user_id,token_hash,expires_at) VALUES ($1,$2,$3,$4)', [id('ses'), userId, tokenHash(token), expires]);
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await query('DELETE FROM sessions WHERE token_hash=$1', [tokenHash(token)]).catch(() => {});
  jar.set(COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', expires: new Date(0) });
}

export async function getCurrentUser() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const result = await query(`
    SELECT u.id,u.email,u.name,u.created_at
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.expires_at>now()
    LIMIT 1`, [tokenHash(token)]);
  return result.rows[0] || null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

export async function getWorkspaceForUser(userId) {
  const result = await query(`
    SELECT w.* FROM workspaces w
    JOIN workspace_members wm ON wm.workspace_id=w.id
    WHERE wm.user_id=$1 ORDER BY w.created_at ASC LIMIT 1`, [userId]);
  return result.rows[0] || null;
}

export async function requireWorkspace() {
  const user = await requireUser();
  const workspace = await getWorkspaceForUser(user.id);
  if (!workspace) redirect('/onboarding');
  return { user, workspace };
}

export async function assertWorkspaceAccess(userId, workspaceId) {
  const result = await query('SELECT 1 FROM workspace_members WHERE user_id=$1 AND workspace_id=$2', [userId, workspaceId]);
  if (!result.rowCount) throw new Error('Forbidden');
}
