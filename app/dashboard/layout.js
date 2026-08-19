import { requireWorkspace } from '@/lib/auth';import Sidebar from '@/components/Sidebar';import Topbar from '@/components/Topbar';
export const dynamic='force-dynamic';
export default async function DashboardLayout({children}){const {user,workspace}=await requireWorkspace();return <div className="shell"><Sidebar workspace={workspace}/><div className="main"><Topbar workspace={workspace} user={user}/>{children}</div></div>}
