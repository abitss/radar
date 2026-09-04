import { requireWorkspace } from '@/lib/auth';
import { getMoves } from '@/lib/moves';
import MoveCard from '@/components/MoveCard';
import EmptyState from '@/components/EmptyState';
export default async function Moves(){const{workspace}=await requireWorkspace();const moves=await getMoves(workspace.id,100);return <main className="content"><div className="eyebrow">RADAR MOVES</div><h1 className="page-title">Weak signals become strategic movement.</h1><p className="sub">RADAR fuses related events across time so you see the strategy forming behind individual alerts.</p><div style={{display:'grid',gap:12,marginTop:22}}>{moves.length?moves.map(m=><MoveCard key={m.id} move={m}/>):<EmptyState title="No strategic moves yet" body="RADAR waits for corroborating signal categories before promoting isolated changes into a Move."/>}</div></main>}
