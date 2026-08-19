import MobileNav from './MobileNav';
import LivePulse from './LivePulse';
export default function Topbar({workspace,user}){return <header className="topbar"><div style={{display:'flex',alignItems:'center',gap:10}}><MobileNav/><div className="workspace-chip"><span className="live-dot"/>RADAR intelligence live</div></div><div style={{display:'flex',gap:12,alignItems:'center'}}><LivePulse/><div className="muted" style={{fontSize:12}}>{user.name}</div></div></header>}
