export default async function handler(req, res) {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date param required' });

  try {
    const r = await fetch(`https://api.nasdaq.com/api/ipo/calendar?date=${date}`, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      },
    });
    const data = await r.json();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
