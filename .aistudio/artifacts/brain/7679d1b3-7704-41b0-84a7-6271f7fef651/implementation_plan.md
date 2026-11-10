# Sincronização Inteligente de Camadas (Edição no AI Studio + Cache-Busting no GitHub)

Esta solução preserva e aprimora o seu fluxo de trabalho atual — onde você sobe, atualiza e estiliza camadas diretamente pela interface aqui no AI Studio para depois publicar no GitHub — enquanto elimina completamente o problema de cache antigo nos navegadores dos usuários que acessam o Geoportal publicado.

## User Review & Critical Decisions

> [!IMPORTANT]
> **Sim, você continuará podendo subir e atualizar todas as camadas normalmente pela interface aqui no AI Studio!** O plano foi ajustado para unir a edição no AI Studio com a atualização imediata no GitHub Pages:

- **Fluxo de Edição no AI Studio Aprimorado (Gravação Direta em Disco + Pacote GitHub)**: Quando você subir uma nova camada, atualizar o arquivo de uma camada existente ou salvar alterações aqui no AI Studio, o sistema salvará tanto na sessão do navegador quanto **diretamente nos arquivos físicos da pasta `public/data/*.geojson` e `public/mapas-config.json` do projeto no AI Studio** (além de manter a opção de exportar o `.zip` para o GitHub Pages). Assim, ao sincronizar do AI Studio para o GitHub, os arquivos estáticos já estarão 100% atualizados com um carimbo de versão (`updatedAt`).
- **Invalidação Automática por Versão/Hash no Navegador**: Quando você publicar os novos arquivos no GitHub, o Geoportal consultará o `mapas-config.json` sempre sem cache HTTP (`cache: 'no-store'` + `?_cb=timestamp`). Ao detectar que o arquivo do GitHub foi atualizado (ou ao abrir em modo de consulta), o navegador descartará automaticamente o cache antigo do `IndexedDB` e baixará os novos `.geojson` do GitHub.
- **Preservação de Edições em Andamento**: Enquanto você estiver com o modo de edição técnica desbloqueado trabalhando nas camadas, suas alterações locais são preservadas e sincronizadas automaticamente com os arquivos do projeto.

---

## 1. Overview & Core Concept

- **O Que Faz**: Conecta o editor visual do Geoportal no AI Studio diretamente aos arquivos estáticos do repositório (`public/mapas-config.json` e `public/data/*.geojson`) e adiciona controle de versão com *cache-busting* automático em todas as leituras de rede.
- **Público-Alvo / Contexto**:
  - **No AI Studio (Você / Gestor)**: Sobe novas planilhas/GeoJSON, atualiza camadas existentes com mapeamento de colunas, ajusta cores/pop-ups e exporta ou envia direto para o GitHub.
  - **No GitHub Pages (Usuários / Consulta)**: Recebem instantaneamente a versão mais recente das camadas publicadas sem precisar limpar o cache do navegador.
- **Valor Principal**: Mantém o AI Studio como seu painel de atualização de camadas e garante que toda publicação no GitHub invalide automaticamente qualquer cache antigo nos navegadores dos usuários.

---

## 2. User Experience & Visual Design

- **Fluxo do Gestor no AI Studio (Como você atualiza as camadas)**:
  1. Você desbloqueia o cadeado de edição técnica no topo do Geoportal.
  2. Usa o botão **"Subir Camada"** na barra superior ou **"Atualizar Arquivo da Camada"** no painel lateral para carregar o novo GeoJSON/CSV.
  3. O sistema atualiza o mapa imediatamente, grava os arquivos `.geojson` atualizados e o `mapas-config.json` com uma nova assinatura de versão (`updatedAt`) diretamente no servidor do AI Studio e mantém o botão de exportar o pacote `.zip` para o GitHub.
- **Fluxo do Usuário no GitHub Pages (Zero Cache Antigo)**:
  1. Ao abrir o Geoportal, o sistema busca o `mapas-config.json` com *cache-busting* (`?_cb=<timestamp>` e `cache: 'no-store'`).
  2. O sistema compara a assinatura do `mapas-config.json` do GitHub com a versão armazenada no navegador. Se houver qualquer alteração nos arquivos do repositório (ou se o usuário não estiver com edições locais pendentes), todas as camadas `.geojson` são recarregadas diretamente do GitHub sem cache.

---

## 3. Key Product Decisions & Trade-Offs

- **Decisão 1: Persistência Dupla no AI Studio (Navegador + Arquivos Físicos `public/`)**
  - *Abordagem Escolhida*: Criar uma rota no backend do AI Studio (`POST /api/layers/sync-public`) acionada automaticamente quando você atualiza camadas ou clica em salvar. Essa rota grava os arquivos `.geojson` em `public/data/` e atualiza o `public/mapas-config.json` com um identificador `updatedAt`.
  - *Por quê*: Permite que você use a interface gráfica do AI Studio para atualizar camadas e, ao enviar o código para o GitHub (via integração Git do AI Studio ou download do pacote), os arquivos da pasta `public/` já contenham os dados novos.

- **Decisão 2: Verificação de Assinatura do `mapas-config.json` + Cache-Busting HTTP**
  - *Abordagem Escolhida*: Todas as chamadas `fetch` para arquivos `.json` e `.geojson` recebem `?_cb=${Date.now()}` e `{ cache: 'no-store' }`. Na abertura do app, o sistema lê o `mapas-config.json` do servidor e gera uma assinatura (baseada em `updatedAt` e na estrutura das camadas). Sempre que os arquivos do GitHub mudarem, o banco local (`IndexedDB`) é atualizado automaticamente com os dados novos do GitHub.
  - *Por quê*: Garante que o navegador nunca fique preso a uma versão antiga salva no `IndexedDB`, sem impedir que você edite e teste novas camadas dentro do AI Studio.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Diagrama de Arquitetura (Fluxo AI Studio -> GitHub -> Navegador do Usuário)**:

```
┌──────────────────────────────────────────────────────────────────────────┐
│                 1. Edição de Camadas aqui no AI Studio                   │
│  • Upload de nova camada ou atualização de camada existente pela UI      │
│  • Sincroniza com IndexedDB + Grava em public/data/ e mapas-config.json  │
│  • Gera carimbo de versão (updatedAt) no mapas-config.json               │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │ Push / Exportação para o GitHub
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                 2. Abertura do Geoportal (GitHub Pages)                  │
│  • Requisita mapas-config.json?_cb=<Date.now()> com { cache: 'no-store' }│
│  • Verifica se o manifesto/arquivos do GitHub mudaram                    │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│             3. Carregamento Fresco das Camadas (.geojson)                │
│  • Baixa cada public/data/*.geojson?_cb=<Date.now()> sem cache de disco  │
│  • Atualiza o mapa Leaflet e substitui o cache antigo do IndexedDB       │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Modelo de Dados & Sincronização**:
  - `mapas-config.json`: Passa a incluir metadado `"updatedAt"` (gerado automaticamente ao salvar no AI Studio ou exportar o pacote GitHub) e suporta detecção por hash de conteúdo caso você edite um arquivo manualmente direto no GitHub.
  - `fetchPublicAsset` / `fetchPublicJson`: Aplica `cache: 'no-store'`, cabeçalhos `Cache-Control: no-cache, no-store, must-revalidate` e parâmetro `?_cb=<timestamp>` em todas as leituras de arquivos estáticos.
