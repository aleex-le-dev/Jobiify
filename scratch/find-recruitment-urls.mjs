import fs from 'node:fs';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function findLinks(siteUrl) {
  try {
    const res = await fetch(siteUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(6000) });
    const text = await res.text();
    const links = [];
    const re = /href=["']([^"']*(?:recrutement|emploi|rejoindre|carrieres|carriere)[^"']*)["']/gi;
    let m;
    while ((m = re.exec(text)) !== null) {
      links.push(m[1]);
    }
    console.log(siteUrl, '=>', links.slice(0, 3));
  } catch (err) {
    console.log(siteUrl, '=> error:', err.message);
  }
}

async function run() {
  await findLinks('https://www.ch-bethune.fr');
  await findLinks('https://www.ch-lens.fr');
  await findLinks('https://www.roquette.com/fr');
  await findLinks('https://www.arc-intl.com/fr');
  await findLinks('https://www.bethunebruay.fr');
  await findLinks('https://www.cdg62.fr');
}
run();
