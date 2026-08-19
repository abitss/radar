'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import Brand from './Brand';
const items=[['/dashboard','Today','◉'],['/dashboard/discover','Discover','⌁'],['/dashboard/companies','Companies','◇'],['/dashboard/signals','Signals','↗'],['/dashboard/market-map','Market Map','◎'],['/dashboard/briefings','Briefings','≡'],['/dashboard/ask','Ask RADAR','✦'],['/dashboard/sources','Sources & Alerts','⌘'],['/dashboard/settings','Settings','⚙']];
export default function Sidebar({workspace}){const path=usePathname();return <aside className="sidebar"><Brand/><nav className="nav">{items.map(([href,label,icon])=>{const active=href==='/dashboard'?path===href:path.startsWith(href);return <Link className={active?'active':''} href={href} key={href}><span>{icon}</span>{label}</Link>})}</nav><div className="sidefoot"><div className="muted" style={{fontSize:11}}>WORKSPACE</div><div style={{fontSize:13,fontWeight:700,marginTop:5}}>{workspace.name}</div><div className="muted" style={{fontSize:11,marginTop:2}}>{workspace.role}</div></div></aside>}
