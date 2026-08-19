'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
const items=[['/dashboard','Today'],['/dashboard/discover','Discover'],['/dashboard/companies','Companies'],['/dashboard/signals','Signals'],['/dashboard/market-map','Market Map'],['/dashboard/briefings','Briefings'],['/dashboard/ask','Ask RADAR'],['/dashboard/sources','Sources & Alerts'],['/dashboard/settings','Settings']];
export default function MobileNav(){const [open,setOpen]=useState(false);const path=usePathname();return <div className="mobile-nav"><button className="mobile-menu-button" aria-label="Open navigation" aria-expanded={open} onClick={()=>setOpen(!open)}>☰</button>{open&&<><button className="mobile-backdrop" aria-label="Close navigation" onClick={()=>setOpen(false)}/><nav className="mobile-menu" aria-label="RADAR navigation"><div className="eyebrow" style={{padding:'4px 6px 10px'}}>NAVIGATION</div>{items.map(([href,label])=>{const active=href==='/dashboard'?path===href:path.startsWith(href);return <Link href={href} key={href} className={active?'active':''} onClick={()=>setOpen(false)}>{label}</Link>})}</nav></>}</div>}
