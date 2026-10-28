# Arquitetura — Smart Ink 0.17.0

## Proveniência

A única fonte original disponível era um bundle JavaScript distribuído, mais CSS e manifesto. O projeto-fonte histórico (repositório, TypeScript, scripts upstream e sourcemaps completos) não foi fornecido. Portanto, os módulos em `src/` são **extrações fiéis do bundle recebido**, não uma promessa de reconstrução da árvore upstream.

A divisão foi feita por declarações de alto nível, mantendo a ordem do bundle. O `npm run build` produzia arquivos byte a byte idênticos à distribuição original da versão 0.12.0. A versão 0.13.1 contém alterações adicionais nos fontes; a verificação atual garante que `main.js` e `styles.css` correspondam exatamente ao código versionado em `src/`.

## Pipeline

`src/vendor/perfect-freehand.bundle.js` → `src/core/ink-engine.js` → `src/core/geometry.js` → `src/core/document.js` → `src/core/brushes.js` → `src/vendor/clipper.bundle.js` → `src/core/visibility.js` → `src/core/workflow.js` → `src/features/legacy-features.js` → `src/plugin/index.js` → `src/features/quality-of-life.js`

O script `scripts/build.mjs` lê cada parte, une em ordem e salva `main.js`, que é um plugin CommonJS consumido pelo Obsidian. Os estilos `src/styles/base.css` + `src/styles/quality-of-life.css` geram `styles.css`.

**Cuidado:** este sistema é concatenação deliberada de módulos com escopo lexical compartilhado, **não ESM com imports/exports**. Não introduza novos `import`/`export` em arquivos `src` sem migrar o build. As dependências Obsidian são resolvidas por `require('obsidian')` em runtime. Tudo permanece offline.

## Editar o motor de escrita

`src/core/ink-engine.js` contém a função `stabilize(points, strength)`, que suaviza sem perder extremidades e pressão, e os algoritmos de outlines. Edite ali — o arquivo `src/adaptive-smoothing.js` do antigo ZIP de projeto foi removido para evitar uma segunda fonte da mesma função. Rode `npm run verify` depois de alterações. A biblioteca upstream vendorizada tem aviso de licença separado.

## UX e roteamento

`src/plugin/index.js` contém a classe `InkView`, a classe principal do plugin, o bloco de incorporação Markdown, o gerenciamento de documentos e as configurações básicas. `src/features/legacy-features.js` e `src/features/quality-of-life.js` estendem `InkView.prototype` após a definição da classe. Na lógica atual, alguns métodos originais são interceptados pela camada de UX. Quando modificar o fluxo de menus, revise **os métodos originais e os wrappers** para evitar ações duplicadas.

## Persistência de documentos (0.13.1)

`InkView.changed()` resolve conexões, incrementa a revisão em memória e chama `SmartInkPlugin.scheduleSessionSave(session)`. O agendador pertence à sessão, não à aba: reabrir ou editar o mesmo documento em outra view não cria cronômetros independentes. Após **5000 ms sem um novo commit**, `saveSession(session)` valida/serializa uma fotografia do documento e passa a gravação pela `Ink.SaveQueue`, que compara a versão esperada do vault antes da escrita.

Salvar manualmente, fechar uma aba e descarregar o plugin cancelam o timer e aguardam a gravação. `savedRevision` só avança quando o salvamento tem sucesso. Em caso de erro, a rotina de recuperação anterior é mantida. Preferências do plugin (`data.json`) são persistidas separadamente e não integram o debounce dos documentos.

A execução em memória é síncrona, mas **não há durabilidade no disco durante a janela de cinco segundos**. Evite apresentar o estado pendente como salvo.

## Dados e compatibilidade

- `manifest.json`: id do plugin `smart-ink` — **não mudar** em atualizações.
- `.smartink`: esquema v9, com migração explícita das versões 1–8; tipos `path` e `region` exigem a versão 0.16. Veja IMPLEMENTACAO-0.16.md.
- `data.json`: persistência de preferências do Obsidian, preservada durante a instalação.
- `snapOrigin` e `snapObjects`: controlados independentemente; `snapPoints` é o interruptor legado/global.
- `THIRD-PARTY-NOTICES.txt`: manter nas versões distribuídas.

## Testes

- `tests/smoke.cjs`: inicialização headless, menu radial, camadas, histórico, contornos.
- `tests/ux.cjs`: encaixes separados, preferências, zoom e exclusão de camadas.
- `tests/autosave.cjs`: cronômetro simulado, flush manual, encerramento e gravação concorrente.
- `tests/smoothing.cjs`: preservação de cantos/pontos, redução de tremor e pressão.
- `tests/source-build.cjs`: manifesto, CSS e integridade da integração.
- `scripts/check.mjs`: sintaxe de todos os módulos, igualdade entre fonte compilada e arquivos gerados.

Os mocks dos testes **não** simulam com fidelidade pointer events/driver de pressão, desempenho real, renderer Chromium, API completa do Obsidian ou tema. Realizar regressão manual antes de uma release pública.

## Regras para mudanças futuras

1. Altere `src/`, jamais apenas o `main.js`/`styles.css` gerado.
2. Novos arquivos exigem entrada explícita em `scripts/build.mjs`.
3. Teste tanto o algoritmo (unitário) quanto o comportamento (UX mock) e valide no Obsidian.
4. Mantenha recursos reversíveis por undo/redo quando mutarem o documento.
5. Preserve esquema e arquivos antigos; não faça migrações silenciosas.
6. Não substitua `src/vendor` sem auditoria de licença, API e regressão.
7. Para abandonar concatenação no futuro, faça uma migração isolada com comparação de API e testes de snapshots, de preferência com `esbuild`.

## Extensões 0.14

`evolution.js` é carregado depois de quality-of-life.js; `notebook.js` vem por último. O índice de caderno é separado da sessão de tinta. `paperSpacing` e `gridStyle` participam do histórico de metadados. Os controles de backup são globais e verificados antes da clonagem e da execução na fila. Contratos e limites estão em IMPLEMENTACAO-0.14.md.

## Construção vetorial (0.16)

`core/vector-ops.js` implementa operações explícitas puras usando o polygon-clipping já vendorizado. `features/vector-tools.js` integra painel, prévias e ponteiros. Ambos estão na lista ordenada de build; nenhuma nova dependência ou chamada de rede foi adicionada.

`path`: nós absolutos, alças absolutas opcionais, tipo de nó e fechamento. SVG usa cúbicas; seleção/booleans usam amostragem de 24 subdivisões por segmento curvo. `region`: MultiPolygon de anéis fechados, exterior seguido de furos. Canvas/SVG usam evenodd para regiões e mantêm nonzero para tinta com pressão.

Preenchimento constrói um grafo planar limitado, divide interseções, adiciona pontes virtuais pequenas e percorre faces fechadas. Não altera a tinta de contorno. Recorte de tinta interpola pressão, inclinação e tempo nas extremidades; recorte de curvas resulta em caminho poligonal. Operações rodam após ação explícita, nunca no início da escrita.

Hover/continuação consultam o índice espacial já renderizado. Não serializam nem recompõem a página em pointerdown. Continuação registra uma única substituição do objeto original, e a recuperação intermediária usa a mesma união. Testes específicos em `tests/vector-tools.cjs`.

## Edição e assistência local (0.17)

`core/refinement.js` fornece primitivas puras de edição e o dispatcher de geometria. O build inclui uma cópia dos módulos necessários como `SMART_INK_WORKER_SOURCE`, sem dependência de um arquivo extra ou rede. A constante fica após os módulos para não interferir nas extrações antigas de testes. `features/refinement-ui.js` gerencia workers, cancelamento, sessão/revisão, hover e interação direta. Sem Worker, o caminho explícito permanece limitado e síncrono.

`core/digit-assist.js` compara nuvens amostradas e normalizadas com modelos vetoriais autorais e amostras pessoais. Não é rede neural nem OCR treinado. `features/digit-ui.js` implementa sugestões sem conversão automática e resultados confirmáveis. Exemplos são limitados/validados no carregamento de preferências; não há upload.

`features/temporary-tools.js` unifica retorno de cursor, borracha e navegação por teclado/botão. A pilha trata soltura fora de ordem e perda de foco. Modelos de documento permanecem no esquema 9.
