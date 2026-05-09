/* =======================================================================
   0xFEED // shared runtime
   - RSS fetch via rss2json.com (free CORS-friendly endpoint)
   - K-12 content filter (wordlist + heuristic)
   - Stock tickers via Stooq CSV (free, no key)
   - Client-side search (/) shortcut
   - Last-updated timestamp + manual refresh
   ======================================================================= */

window.OXFEED = (function () {

  /* ----------------------------------------------------------------------
     1. FEED REGISTRY
     ---------------------------------------------------------------------- */
  const FEEDS = {
    /* ---- CYBER ---- */
    breaches: [
      { name: "Krebs on Security",     url: "https://krebsonsecurity.com/feed/" },
      { name: "BleepingComputer",      url: "https://www.bleepingcomputer.com/feed/" },
      { name: "The Hacker News",       url: "https://feeds.feedburner.com/TheHackersNews" },
      { name: "Dark Reading",          url: "https://www.darkreading.com/rss.xml" },
      { name: "SecurityWeek",          url: "https://feeds.feedburner.com/securityweek" }
    ],
    cyber_gov: [
      { name: "CISA Advisories",       url: "https://www.cisa.gov/cybersecurity-advisories/all.xml" },
      { name: "CISA News",             url: "https://www.cisa.gov/news.xml" },
      { name: "US-CERT Alerts",        url: "https://www.cisa.gov/uscert/ncas/alerts.xml" },
      { name: "FBI IC3",               url: "https://www.ic3.gov/Media/RSS" }
    ],
    cyber_market: [
      { name: "SEC Filings (Cyber)",   url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=8-K&dateb=&owner=include&count=40&output=atom" },
      { name: "Reuters Cybersecurity", url: "https://www.reuters.com/technology/cybersecurity/rss" },
      { name: "Yahoo Cybersecurity",   url: "https://finance.yahoo.com/news/rssindex" }
    ],
    cyber_certs: [
      { name: "ISC2 Blog",             url: "https://blog.isc2.org/isc2_blog/atom.xml" },
      { name: "CompTIA Blog",          url: "https://www.comptia.org/blog/rss" },
      { name: "EC-Council Blog",       url: "https://www.eccouncil.org/cybersecurity-exchange/feed/" },
      { name: "SANS Reading Room",     url: "https://www.sans.org/blog/feed.xml" }
    ],
    cyber_k12: [
      { name: "Education Week",        url: "https://www.edweek.org/feed" },
      { name: "K12 Dive",              url: "https://www.k12dive.com/feeds/news/" },
      { name: "EdSurge",               url: "https://www.edsurge.com/articles_rss" }
    ],
    cyber_competitions: [
      { name: "CyberPatriot",          url: "https://www.uscyberpatriot.org/News/RSS" },
      { name: "picoCTF News",          url: "https://picoctf.org/feed.xml" },
      { name: "NCL",                   url: "https://nationalcyberleague.org/feed" }
    ],

    /* ---- AI ---- */
    ai_products: [
      { name: "OpenAI Blog",           url: "https://openai.com/blog/rss.xml" },
      { name: "Anthropic News",        url: "https://www.anthropic.com/news/rss.xml" },
      { name: "Google AI Blog",        url: "https://blog.google/technology/ai/rss/" },
      { name: "Microsoft AI Blog",     url: "https://blogs.microsoft.com/ai/feed/" },
      { name: "Meta AI",               url: "https://ai.meta.com/blog/rss/" }
    ],
    ai_gov: [
      { name: "NIST AI",               url: "https://www.nist.gov/news-events/ai/rss.xml" },
      { name: "White House AI",        url: "https://www.whitehouse.gov/ostp/feed/" }
    ],
    ai_education: [
      { name: "EdSurge AI",            url: "https://www.edsurge.com/articles_rss" },
      { name: "EdWeek AI",             url: "https://www.edweek.org/feed" }
    ],
    ai_certs: [
      { name: "Coursera Blog",         url: "https://blog.coursera.org/feed/" },
      { name: "DeepLearning.AI",       url: "https://www.deeplearning.ai/blog/feed/" }
    ],
    ai_competitions: [
      { name: "Kaggle Blog",           url: "https://medium.com/feed/kaggle-blog" },
      { name: "AI4ALL",                url: "https://ai-4-all.org/feed/" }
    ]
  };

  /* ----------------------------------------------------------------------
     2. SEEDED COMPETITIONS (top 10 US K-12)
     ---------------------------------------------------------------------- */
  const COMPETITIONS = [
    { name: "CyberPatriot",         org: "Air & Space Forces Association", grades: "6-12", url: "https://www.uscyberpatriot.org", desc: "National Youth Cyber Defense Competition. Teams secure virtual machines under attack. ~6,800 teams compete annually." },
    { name: "picoCTF",              org: "Carnegie Mellon CyLab",          grades: "6-12+", url: "https://picoctf.org", desc: "Free, beginner-friendly CTF with year-round practice gym. Largest student CTF in the world." },
    { name: "National Cyber League", org: "Cyber Skyline + NCL",            grades: "9-12, college", url: "https://nationalcyberleague.org", desc: "Individual and team CTF. NICE Framework aligned. High school division included." },
    { name: "CyberStart America",   org: "SANS Institute",                 grades: "9-12", url: "https://www.cyberstartamerica.org", desc: "Free national talent search. Top performers earn scholarships and SANS training." },
    { name: "GenCyber",             org: "NSA + NSF",                      grades: "K-12 + teachers", url: "https://gencyber.eku.edu", desc: "Free summer cyber camps held nationwide. Both student and educator tracks." },
    { name: "US Cyber Open",        org: "US Cyber Games",                 grades: "18-24 (HS srs eligible)", url: "https://www.uscybergames.com", desc: "Pipeline to the US Cyber Team. Open CTF qualifies for combine." },
    { name: "NCAE Cyber Games",     org: "NCAE-C",                         grades: "college (HS observed)", url: "https://www.ncaecybergames.org", desc: "NSA-designated CAE schools compete. Strong observer pathway for HS programs." },
    { name: "HiveStorm",            org: "Cyber Skyline",                  grades: "9-12", url: "https://hivestorm.org", desc: "One-day fall CTF, free for high schools. Lower barrier to entry than NCL." },
    { name: "CyberFastTrack",       org: "SANS Institute",                 grades: "college", url: "https://www.cyberfasttrack.org", desc: "Free online aptitude challenge for college students. HS srs in college credit programs eligible." },
    { name: "DEF CON Kids / r00tz", org: "DEF CON",                        grades: "8-16 yrs", url: "https://r00tz.org", desc: "Hands-on hacker village at DEF CON each summer. Lockpicking, soldering, CTF." }
  ];

  /* ----------------------------------------------------------------------
     3. CURATED ED SITES (top 20)
     ---------------------------------------------------------------------- */
  const ED_SITES = [
    { name: "TryHackMe",          tier: "Freemium",   url: "https://tryhackme.com",                     desc: "Browser-based labs. Free path covers fundamentals through pre-security and SOC L1.", tags: ["labs","beginner","SOC"] },
    { name: "Hack The Box Academy", tier: "Freemium", url: "https://academy.hackthebox.com",            desc: "Module-based offensive and defensive courses. Free Tier 0 modules cover networking and Linux.", tags: ["labs","offensive"] },
    { name: "picoCTF Gym",        tier: "Free",       url: "https://play.picoctf.org/practice",         desc: "Carnegie Mellon's full CTF problem archive. Beginner to advanced. No account needed to browse.", tags: ["CTF","K-12"] },
    { name: "OverTheWire",        tier: "Free",       url: "https://overthewire.org/wargames/",         desc: "SSH-based wargames. Bandit is the gold standard intro to Linux command line for security.", tags: ["wargames","linux"] },
    { name: "Cybrary",            tier: "Freemium",   url: "https://www.cybrary.it",                    desc: "Free video courses mapped to NICE Framework roles and major certifications.", tags: ["video","certs"] },
    { name: "SANS Cyber Aces Online", tier: "Free",   url: "https://tutorials.cyberaces.org",           desc: "SANS-built free tutorials in OS, networking, and systems administration fundamentals.", tags: ["fundamentals"] },
    { name: "Professor Messer",   tier: "Free",       url: "https://www.professormesser.com",           desc: "Free full video courses for CompTIA A+, Network+, and Security+. The standard study channel.", tags: ["certs","video"] },
    { name: "Coursera (audit)",   tier: "Free audit", url: "https://www.coursera.org/browse/computer-science/computer-security-and-networks", desc: "University courses (Stanford, Maryland, IBM) free to audit. Cert costs apply.", tags: ["university"] },
    { name: "edX (audit)",        tier: "Free audit", url: "https://www.edx.org/learn/cybersecurity",   desc: "MIT, Harvard, RIT cybersecurity micromasters. Audit free, verified track paid.", tags: ["university"] },
    { name: "MIT OpenCourseWare", tier: "Free",       url: "https://ocw.mit.edu/search/?q=security",    desc: "Full lecture videos and assignments from MIT 6.857, 6.858, etc. No grading, all materials.", tags: ["university","theory"] },
    { name: "CISA Cybersecurity Training", tier: "Free", url: "https://www.cisa.gov/resources-tools/training", desc: "Federal-grade training, including Federal Virtual Training Environment (FedVTE) for govt and vets.", tags: ["gov","practical"] },
    { name: "NICE Challenge Project", tier: "Free for schools", url: "https://nice-challenge.com",       desc: "NIST-funded scenario-based virtual challenges. Free for accredited US schools.", tags: ["K-12","scenarios"] },
    { name: "OWASP Juice Shop",   tier: "Free",       url: "https://owasp.org/www-project-juice-shop/", desc: "Vulnerable web app for hands-on appsec practice. Self-host or use the Heroku demo.", tags: ["webapp","practice"] },
    { name: "PortSwigger Web Security Academy", tier: "Free", url: "https://portswigger.net/web-security", desc: "By the makers of Burp Suite. Free, exhaustive, the de facto web hacking curriculum.", tags: ["webapp"] },
    { name: "Microsoft Learn (Security)", tier: "Free", url: "https://learn.microsoft.com/training/browse/?roles=security-engineer", desc: "Free official training paths for Azure and Microsoft 365 security roles. Cert prep included.", tags: ["cloud","certs"] },
    { name: "AWS Skill Builder", tier: "Freemium",    url: "https://skillbuilder.aws",                   desc: "Free fundamentals and security learning plans. Cloud Quest gamified path is free.", tags: ["cloud"] },
    { name: "RangeForce Community", tier: "Free",     url: "https://www.rangeforce.com/community-edition", desc: "Browser-based blue team simulations. Community edition is no-cost forever.", tags: ["blue-team"] },
    { name: "TCM Security Academy", tier: "Low cost", url: "https://academy.tcm-sec.com",                desc: "Practical Ethical Hacker, Junior Pentester, OSINT. Courses commonly under $30.", tags: ["offensive","low-cost"] },
    { name: "INE eLearnSecurity Free", tier: "Freemium", url: "https://my.ine.com/path/00d6cd83-d0d2-4d83-a25f-91dbcdc2eb2f", desc: "Starter pen-test path free with INE registration. Good gateway to eJPT prep.", tags: ["pentest","certs"] },
    { name: "Hackaday + Hak5",    tier: "Free",       url: "https://hackaday.com",                       desc: "Long-form security and hardware writeups. Hak5 YouTube companion is the canonical channel.", tags: ["news","video"] }
  ];

  /* ----------------------------------------------------------------------
     4. CONTENT FILTER (K-12)
     ---------------------------------------------------------------------- */
  const BLOCKLIST = [
    "porn","pornographic","nude","nudes","sexual assault","rape","gore","decapitat",
    "murder","suicid","self-harm","self harm","slur","racist slur","cp ","csam",
    "child porn","onlyfans","strip club","nsfw"
  ];
  function isClean(text) {
    if (!text) return true;
    const t = String(text).toLowerCase();
    for (const term of BLOCKLIST) if (t.includes(term)) return false;
    return true;
  }

  /* ----------------------------------------------------------------------
     5. UTILITIES
     ---------------------------------------------------------------------- */
  function timeAgo(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d)) return "";
    const s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 60)        return s + "s ago";
    if (s < 3600)      return Math.floor(s/60) + "m ago";
    if (s < 86400)     return Math.floor(s/3600) + "h ago";
    if (s < 86400*7)   return Math.floor(s/86400) + "d ago";
    return d.toISOString().slice(0,10);
  }

  function stripHtml(html) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html || "";
    const txt = (tmp.textContent || tmp.innerText || "").replace(/\s+/g, " ").trim();
    return txt;
  }

  function shorten(text, n) {
    if (!text) return "";
    if (text.length <= n) return text;
    return text.slice(0, n).replace(/\s+\S*$/, "") + "…";
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }

  function extractImage(item) {
    if (item.thumbnail && item.thumbnail.startsWith("http")) return item.thumbnail;
    if (item.enclosure && item.enclosure.link) return item.enclosure.link;
    const m = (item.content || item.description || "").match(/<img[^>]+src=["']([^"']+)["']/i);
    if (m) return m[1];
    return null;
  }

  /* ----------------------------------------------------------------------
     6. RSS FETCH (rss2json.com, free CORS endpoint)
     ---------------------------------------------------------------------- */
  const RSS_API = "https://api.rss2json.com/v1/api.json?rss_url=";

  async function fetchFeed(url, sourceName) {
    try {
      const r = await fetch(RSS_API + encodeURIComponent(url));
      if (!r.ok) throw new Error("status " + r.status);
      const j = await r.json();
      if (j.status !== "ok" || !Array.isArray(j.items)) return [];
      return j.items.map(it => ({
        title:   stripHtml(it.title),
        link:    it.link,
        date:    it.pubDate || it.published,
        desc:    shorten(stripHtml(it.description || it.content), 220),
        image:   extractImage(it),
        source:  sourceName
      })).filter(it => it.title && it.link && isClean(it.title + " " + it.desc));
    } catch (e) {
      console.warn("[0xFEED] fetch failed:", url, e.message);
      return [];
    }
  }

  async function fetchCategory(catKey, perFeedCap = 6) {
    const list = FEEDS[catKey] || [];
    const all = await Promise.all(list.map(f => fetchFeed(f.url, f.name)));
    const merged = [];
    all.forEach(items => merged.push(...items.slice(0, perFeedCap)));
    merged.sort((a, b) => new Date(b.date) - new Date(a.date));
    return merged;
  }

  /* ----------------------------------------------------------------------
     7. STOCK TICKERS (Stooq CSV, no key, CORS allowed)
     ---------------------------------------------------------------------- */
  async function fetchQuote(symbol) {
    try {
      const r = await fetch(`https://stooq.com/q/l/?s=${symbol.toLowerCase()}.us&f=sd2t2ohlcv&h&e=csv`);
      if (!r.ok) throw new Error("status " + r.status);
      const txt = await r.text();
      const lines = txt.trim().split(/\r?\n/);
      if (lines.length < 2) return null;
      const cols = lines[1].split(",");
      // sym, date, time, open, high, low, close, volume
      const close = parseFloat(cols[6]);
      const open  = parseFloat(cols[3]);
      if (!isFinite(close) || !isFinite(open)) return null;
      const chg = close - open;
      const pct = (chg / open) * 100;
      return { symbol: symbol.toUpperCase(), price: close, change: chg, pct: pct };
    } catch (e) {
      console.warn("[0xFEED] quote failed:", symbol, e.message);
      return null;
    }
  }

  async function fetchTickers(symbols) {
    return Promise.all(symbols.map(fetchQuote)).then(r => r.filter(Boolean));
  }

  /* ----------------------------------------------------------------------
     8. RENDER HELPERS
     ---------------------------------------------------------------------- */
  function renderArticleRow(item) {
    const img = item.image
      ? `<div class="thumb"><img src="${escapeHtml(item.image)}" alt="" loading="lazy" onerror="this.parentElement.classList.add('noimg');this.remove();"></div>`
      : `<div class="thumb noimg"><span>NO IMG</span></div>`;
    return `
      <a class="art" href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer">
        ${img}
        <div class="art-body">
          <div class="art-meta"><span class="src">${escapeHtml(item.source || "")}</span><span class="dot">·</span><span>${escapeHtml(timeAgo(item.date))}</span></div>
          <h4 class="art-ttl">${escapeHtml(item.title)}</h4>
          <p class="art-desc">${escapeHtml(item.desc)}</p>
        </div>
        <span class="art-arrow" aria-hidden="true">→</span>
      </a>`;
  }

  function renderTicker(q) {
    const up = q.pct >= 0;
    return `
      <div class="tk">
        <div class="sym">${escapeHtml(q.symbol)}</div>
        <div class="px">${q.price.toFixed(2)}</div>
        <div class="chg ${up ? "up" : "dn"}">${up ? "+" : ""}${q.pct.toFixed(2)}%</div>
      </div>`;
  }

  function setStatus(elId, ok, msg) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle("ok", !!ok);
    el.classList.toggle("err", !ok);
  }

  function setUpdated(elId) {
    const el = document.getElementById(elId);
    if (!el) return;
    const now = new Date();
    const hh = String(now.getUTCHours()).padStart(2,"0");
    const mm = String(now.getUTCMinutes()).padStart(2,"0");
    const ss = String(now.getUTCSeconds()).padStart(2,"0");
    el.textContent = `${hh}:${mm}:${ss}Z`;
  }

  /* ----------------------------------------------------------------------
     9. SEARCH (/) — client-side filter across rendered articles
     ---------------------------------------------------------------------- */
  function bindSearch(inputId, scope) {
    const input = document.getElementById(inputId);
    if (!input) return;
    document.addEventListener("keydown", e => {
      if (e.key === "/" && document.activeElement !== input) {
        e.preventDefault();
        input.focus();
      } else if (e.key === "Escape" && document.activeElement === input) {
        input.value = "";
        input.dispatchEvent(new Event("input"));
        input.blur();
      }
    });
    input.addEventListener("input", () => {
      const q = input.value.trim().toLowerCase();
      const arts = document.querySelectorAll(scope || ".art");
      let shown = 0;
      arts.forEach(a => {
        const t = a.textContent.toLowerCase();
        const hit = !q || t.includes(q);
        a.style.display = hit ? "" : "none";
        if (hit) shown++;
      });
      const counter = document.getElementById("search-count");
      if (counter) counter.textContent = q ? `${shown} match${shown === 1 ? "" : "es"}` : "";
    });
  }

  /* ----------------------------------------------------------------------
     10. PUBLIC
     ---------------------------------------------------------------------- */
  return {
    FEEDS, COMPETITIONS, ED_SITES,
    fetchFeed, fetchCategory, fetchTickers,
    renderArticleRow, renderTicker,
    setStatus, setUpdated, bindSearch,
    isClean, escapeHtml, timeAgo
  };

})();
