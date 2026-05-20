// scripts/generate-dashboard.mjs
// Roda via GitHub Actions a cada 6h
// Consulta a API do GitHub e sobrescreve a seção <!-- START_DASHBOARD --> no README.md

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const USERNAME = process.env.GITHUB_USERNAME || 'bielwolf';
const TOKEN    = process.env.GITHUB_TOKEN;

const headers = {
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(TOKEN ? { 'Authorization': `Bearer ${TOKEN}` } : {})
};

// ── Busca todos os repos públicos ──────────────────────────────────────────
async function fetchRepos() {
  let page = 1;
  let repos = [];

  while (true) {
    const res = await fetch(
      `https://api.github.com/users/${USERNAME}/repos?per_page=100&page=${page}&type=public`,
      { headers }
    );

    if (!res.ok) {
      console.error(`Erro ao buscar repos: ${res.status} ${res.statusText}`);
      break;
    }

    const data = await res.json();
    if (!data.length) break;

    repos = repos.concat(data);
    page++;
  }

  return repos;
}

// ── Busca linguagens de um repo ────────────────────────────────────────────
async function fetchLanguages(repoName) {
  const res = await fetch(
    `https://api.github.com/repos/${USERNAME}/${repoName}/languages`,
    { headers }
  );
  if (!res.ok) return {};
  return res.json();
}

// ── Agrega linguagens de todos os repos ───────────────────────────────────
async function aggregateLanguages(repos) {
  const totals = {};

  await Promise.all(
    repos.map(async (repo) => {
      const langs = await fetchLanguages(repo.name);
      for (const [lang, bytes] of Object.entries(langs)) {
        totals[lang] = (totals[lang] || 0) + bytes;
      }
    })
  );

  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([lang]) => lang);
}

// ── Gera o bloco markdown do dashboard ────────────────────────────────────
function buildDashboard(repos, topLangs) {
  const now = new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Fortaleza',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  // Forçamos o array com as linguagens exatas que você quer exibir
  const listaFixaLangs = ['Python', 'JavaScript', 'Java', 'Go', 'C#'];

  const langBadges = listaFixaLangs
    .map(lang => {
      const colors = {
        Python: '3776AB',
        JavaScript: 'F7DF1E&logoColor=black',
        Java: '007396',
        Go: '00ADD8',
        'C#': '239120'
      };
      
      const color = colors[lang] || '7F77DD';
      return `![${lang}](https://img.shields.io/badge/${encodeURIComponent(lang)}-${color}?style=flat-square)`;
    })
    .join(' ');

  return `| métrica | valor |
|---|---|
| repositórios originais | **${original}** |
| repositórios totais | **${repos.length}** (${forked} forks) |
| stars recebidas | **${stars}** |
| linguagens principais | ${langBadges} |
| última sync | ${now} (UTC-3) |`;
}

// ── Substitui o bloco entre os marcadores no README ───────────────────────
function updateReadme(newBlock) {
  const readmePath = join(ROOT, 'README.md');
  const content    = readFileSync(readmePath, 'utf8');

  const START = '<!-- START_DASHBOARD -->';
  const END   = '<!-- END_DASHBOARD -->';

  const startIdx = content.indexOf(START);
  const endIdx   = content.indexOf(END);

  if (startIdx === -1 || endIdx === -1) {
    console.error('Marcadores START_DASHBOARD / END_DASHBOARD não encontrados no README.');
    process.exit(1);
  }

  const updated =
    content.slice(0, startIdx + START.length) +
    '\n' + newBlock + '\n' +
    content.slice(endIdx);

  writeFileSync(readmePath, updated, 'utf8');
  console.log('✅ README.md atualizado com sucesso.');
}

// ── Main ───────────────────────────────────────────────────────────────────
(async () => {
  console.log(`🔍 Buscando dados de @${USERNAME}...`);

  const repos    = await fetchRepos();
  console.log(`📦 ${repos.length} repositórios encontrados.`);

  const topLangs = await aggregateLanguages(repos);
  console.log(`💻 Top linguagens: ${topLangs.join(', ')}`);

  const block = buildDashboard(repos, topLangs);
  updateReadme(block);
})();
