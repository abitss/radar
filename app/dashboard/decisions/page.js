import {requireWorkspace} from '@/lib/auth';
import {getDecisions} from '@/lib/decisions';
import DecisionCard from '@/components/DecisionCard';
import EmptyState from '@/components/EmptyState';
export default async function Decisions(){const{workspace}=await requireWorkspace();const items=await getDecisions(workspace.id);return <main className="content"><div className="eyebrow">DECISION INTELLIGENCE</div><h1 className="page-title">Turn market movement into a response.</h1><p className="sub">Each memo is grounded in a RADAR Move and its supporting evidence. Accept, defer or reject it, then record what actually happened so RADAR learns.</p><div style={{display:'grid',gap:14,marginTop:22}}>{items.length?items.map(item=><DecisionCard key={item.id} item={item}/>):<EmptyState title="No decision memos yet" body="Open RADAR Moves and choose Build decision on a strategic pattern that deserves a response."/>}</div></main>}
