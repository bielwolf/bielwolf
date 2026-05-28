// scripts/generate-dashboard.mjs
// Roda via GitHub Actions a cada 6h
// Consulta a API do GitHub e sobrescreve a seção no README.md

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

// ── Busca todos os repos públicos (ignora forks) ───────────────────────────
async function fetchRepos() {
  let page = 1;
  let repos = [];

  while (true) {
    const res = await fetch(
      `https://api.github.com/users/${USERNAME}/repos?per_page=100&page=${page}`,
      { headers }
    );

    if (!res.ok) {
      console.error(`Erro ao buscar repos: ${res.status} ${res.statusText}`);
      break;
    }

    const data = await res.json();
    if (!data.length) break;

    // FIX: filtra forks para contar só repos seus
    repos = repos.concat(data.filter(r => !r.fork));
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

  for (const repo of repos) {
    const langs = await fetchLanguages(repo.name);
    for (const [lang, bytes] of Object.entries(langs)) {
      totals[lang] = (totals[lang] || 0) + bytes;
    }
  }

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

  const langColors = {
    TypeScript:     '3178C6&logo=typescript&logoColor=white',
    JavaScript:     'F7DF1E&logo=javascript&logoColor=black',
    Python:         '3776AB&logo=python&logoColor=white',
    HTML:           'E34F26&logo=html5&logoColor=white',
    CSS:            '1572B6&logo=css3&logoColor=white',
    Shell:          '89e051&logo=gnubash&logoColor=black',
    Dockerfile:     '2496ED&logo=docker&logoColor=white',
    Java:           '007396&logo=openjdk&logoColor=white',
    Go:             '00ADD8&logo=go&logoColor=white',
    'C#':           '239120&logo=csharp&logoColor=white',
    'C++':          '00599C&logo=cplusplus&logoColor=white',
    C:              'A8B9CC&logo=c&logoColor=black',
    Rust:           'CE412B&logo=rust&logoColor=white',
    Ruby:           'CC342D&logo=ruby&logoColor=white',
    PHP:            '777BB4&logo=php&logoColor=white',
    Kotlin:         '7F52FF&logo=kotlin&logoColor=white',
    Swift:          'FA7343&logo=swift&logoColor=white',
    Cython:         '3776AB&logo=python&logoColor=white',
    'Jupyter Notebook': 'F37626&logo=jupyter&logoColor=white',
  };

  const langBadges = topLangs
    .map(lang => {
      const color = langColors[lang] || '7F77DD';
      return `![${lang}](https://img.shields.io/badge/${encodeURIComponent(lang)}-${color}?style=flat-square)`;
    })
    .join(' ');

  return `| métrica | valor |
|---|---|
| repositórios públicos | **${repos.length}** |
| linguagens principais | ${langBadges} |
| última atualização | ${now} (Horário de Fortaleza) |`;
}

// ── Substitui o bloco entre os marcadores no README ───────────────────────
function updateReadme(newBlock) {
  const readmePath = join(ROOT, 'README.md');
  const content    = readFileSync(readmePath, 'utf8');

  // FIX: marcadores explícitos como strings literais (não tags HTML que o editor remove)
  const START = '<!-- START_DASHBOARD -->';
  const END   = '<!-- END_DASHBOARD -->';

  const startIdx = content.indexOf(START);
  const endIdx   = content.indexOf(END);

  if (startIdx === -1 || endIdx === -1) {
    console.error('❌ Marcadores START_DASHBOARD / END_DASHBOARD não encontrados no README.');
    console.error('Adicione ao README.md:');
    console.error('  <!-- START_DASHBOARD -->');
    console.error('  <!-- END_DASHBOARD -->');
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
  console.log(`📦 ${repos.length} repositórios próprios encontrados (forks ignorados).`);

  const topLangs = await aggregateLanguages(repos);
  console.log(`💻 Top linguagens: ${topLangs.join(', ')}`);

  const block = buildDashboard(repos, topLangs);
  updateReadme(block);
})();
