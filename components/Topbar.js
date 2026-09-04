import MobileNav from './MobileNav';
import LivePulse from './LivePulse';
export default function Topbar({workspace,user}){return <header className="topbar"><div style={{display:'flex',alignItems:'center',gap:10}}><MobileNav/><div className="workspace-chip">RADAR strategic intelligence</div></div><div style={{display:'flex',gap:12,alignItems:'center'}}><LivePulse workspaceId={workspace.id}/><div className="muted" style={{fontSize:12}}>{user.name}</div></div></header>}
