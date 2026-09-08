function hasKey(provider){if(provider==='tavily')return Boolean(process.env.TAVILY_API_KEY);if(provider==='brave')return Boolean(process.env.BRAVE_SEARCH_API_KEY);if(provider==='serper')return Boolean(process.env.SERPER_API_KEY);return false}

function firstPublicUrl(text){
  const matches=String(text||'').match(/https?:\/\/[^\s"'<>)}\]]+/gi)||[];
  for(const raw of matches){
    const cleaned=raw.replace(/[.,;:!?]+$/,'');
    try{
      const url=new URL(cleaned);
      if(!['http:','https:'].includes(url.protocol))continue;
      if(url.username||url.password)continue;
      const host=url.hostname.toLowerCase();
      if(!host||host==='localhost'||host.endsWith('.local'))continue;
      if(!host.includes('.'))continue;
      if(/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host))continue;
      if(host.includes(':'))continue;
      return url.toString();
    }catch{}
  }
  return null;
}

function dedupeResults(items){
  const seen=new Set();
  return (items||[]).filter(item=>item?.url&&!seen.has(item.url)&&seen.add(item.url));
}

export function configuredSearchProvider(){
  const requested=(process.env.SEARCH_PROVIDER||'auto').toLowerCase();
  if(requested&&requested!=='auto')return hasKey(requested)?requested:null;
  for(const provider of ['tavily','brave','serper'])if(hasKey(provider))return provider;
  return null;
}

export function searchConfigured(){return Boolean(configuredSearchProvider())}

export async function searchWeb(query,maxResults=8){
  const provider=configuredSearchProvider();
  if(!provider)return[];
  if(provider==='tavily')return searchTavily(query,maxResults);
  if(provider==='brave')return searchBrave(query,maxResults);
  if(provider==='serper')return searchSerper(query,maxResults);
  throw new Error(`Unsupported SEARCH_PROVIDER: ${provider}`);
}

async function extractTavily(url){
  if(!process.env.TAVILY_API_KEY)return null;
  const response=await fetch('https://api.tavily.com/extract',{
    method:'POST',
    headers:{'content-type':'application/json',authorization:`Bearer ${process.env.TAVILY_API_KEY}`},
    body:JSON.stringify({urls:url,extract_depth:'basic',include_images:false,include_favicon:false,format:'markdown',include_usage:false}),
    signal:AbortSignal.timeout(Number(process.env.SEARCH_TIMEOUT_MS||30000))
  });
  if(!response.ok)return null;
  const data=await response.json();
  const hit=data.results?.[0];
  if(!hit?.url||!String(hit.raw_content||'').trim())return null;
  let title=hit.url;
  try{title=`First-party source: ${new URL(hit.url).hostname}`}catch{}
  return{title,url:hit.url,snippet:String(hit.raw_content).slice(0,12000),score:1};
}

async function searchTavily(query,maxResults){
  if(!process.env.TAVILY_API_KEY)throw new Error('TAVILY_API_KEY is not configured');
  const exactUrl=firstPublicUrl(query);
  const extracted=exactUrl?await extractTavily(exactUrl).catch(()=>null):null;
  let searchResults=[];
  try{
    const response=await fetch('https://api.tavily.com/search',{
      method:'POST',
      headers:{'content-type':'application/json',authorization:`Bearer ${process.env.TAVILY_API_KEY}`},
      body:JSON.stringify({query,max_results:maxResults,search_depth:'advanced',include_answer:false}),
      signal:AbortSignal.timeout(Number(process.env.SEARCH_TIMEOUT_MS||30000))
    });
    if(!response.ok)throw new Error(`Tavily search failed (${response.status}): ${(await response.text()).slice(0,300)}`);
    const data=await response.json();
    searchResults=(data.results||[]).map(r=>({title:r.title,url:r.url,snippet:r.content||'',score:r.score||0}));
  }catch(error){
    if(!extracted)throw error;
  }
  return dedupeResults([extracted,...searchResults].filter(Boolean)).slice(0,Math.max(1,maxResults+1));
}

async function searchBrave(query,maxResults){
  if(!process.env.BRAVE_SEARCH_API_KEY)throw new Error('BRAVE_SEARCH_API_KEY is not configured');
  const response=await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${Math.min(maxResults,20)}`,{
    headers:{accept:'application/json','X-Subscription-Token':process.env.BRAVE_SEARCH_API_KEY},
    signal:AbortSignal.timeout(Number(process.env.SEARCH_TIMEOUT_MS||30000))
  });
  if(!response.ok)throw new Error(`Brave search failed (${response.status})`);
  const data=await response.json();
  return(data.web?.results||[]).map(r=>({title:r.title,url:r.url,snippet:r.description||'',score:0}));
}

async function searchSerper(query,maxResults){
  if(!process.env.SERPER_API_KEY)throw new Error('SERPER_API_KEY is not configured');
  const response=await fetch('https://google.serper.dev/search',{
    method:'POST',headers:{'content-type':'application/json','X-API-KEY':process.env.SERPER_API_KEY},
    body:JSON.stringify({q:query,num:maxResults}),
    signal:AbortSignal.timeout(Number(process.env.SEARCH_TIMEOUT_MS||30000))
  });
  if(!response.ok)throw new Error(`Serper search failed (${response.status})`);
  const data=await response.json();
  return(data.organic||[]).map(r=>({title:r.title,url:r.link,snippet:r.snippet||'',score:0}));
}
