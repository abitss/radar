export async function searchWeb(query, maxResults = 8) {
  const provider = (process.env.SEARCH_PROVIDER || '').toLowerCase();
  if (!provider) return [];
  if (provider === 'tavily') return searchTavily(query, maxResults);
  if (provider === 'brave') return searchBrave(query, maxResults);
  if (provider === 'serper') return searchSerper(query, maxResults);
  throw new Error(`Unsupported SEARCH_PROVIDER: ${provider}`);
}

async function searchTavily(query, maxResults) {
  if (!process.env.TAVILY_API_KEY) {
    throw new Error('TAVILY_API_KEY is not configured');
  }

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.TAVILY_API_KEY}`
    },
    body: JSON.stringify({
      query,
      max_results: maxResults,
      search_depth: 'advanced',
      include_answer: false
    })
  });

  if (!response.ok) {
    throw new Error(
      `Tavily search failed (${response.status}): ${(await response.text()).slice(0,300)}`
    );
  }

  const data = await response.json();

  return (data.results || []).map(r => ({
    title: r.title,
    url: r.url,
    snippet: r.content || '',
    score: r.score || 0
  }));
}

async function searchBrave(query, maxResults) {
  if (!process.env.BRAVE_SEARCH_API_KEY) throw new Error('BRAVE_SEARCH_API_KEY is not configured');
  const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${Math.min(maxResults,20)}`, {
    headers: { accept: 'application/json', 'X-Subscription-Token': process.env.BRAVE_SEARCH_API_KEY }
  });
  if (!response.ok) throw new Error(`Brave search failed (${response.status})`);
  const data = await response.json();
  return (data.web?.results || []).map(r => ({ title: r.title, url: r.url, snippet: r.description || '', score: 0 }));
}

async function searchSerper(query, maxResults) {
  if (!process.env.SERPER_API_KEY) throw new Error('SERPER_API_KEY is not configured');
  const response = await fetch('https://google.serper.dev/search', {
    method: 'POST', headers: { 'content-type': 'application/json', 'X-API-KEY': process.env.SERPER_API_KEY },
    body: JSON.stringify({ q: query, num: maxResults })
  });
  if (!response.ok) throw new Error(`Serper search failed (${response.status})`);
  const data = await response.json();
  return (data.organic || []).map(r => ({ title: r.title, url: r.link, snippet: r.snippet || '', score: 0 }));
}
