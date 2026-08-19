'use client';
import {useRouter} from 'next/navigation';import {useState} from 'react';
export default function CompanyRemoveButton({companyId}){const router=useRouter();const [busy,setBusy]=useState(false);return <button className="button ghost" style={{padding:'5px 8px',fontSize:10}} disabled={busy} onClick={async()=>{if(!confirm('Stop monitoring and remove this company from the workspace?'))return;setBusy(true);const r=await fetch(`/api/companies?id=${encodeURIComponent(companyId)}`,{method:'DELETE'});if(!r.ok)alert((await r.json()).error);router.refresh();setBusy(false)}}>Remove</button>}
