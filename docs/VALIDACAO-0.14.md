# Validação 0.14.0

Ambiente: Node.js 24.19.0, testes headless com DOM/API Obsidian simulados. `npm run verify` passou: build, sintaxe de 28 fontes, reprodução determinística do bundle, consistência de versões, oito suítes e geração do ZIP instalável. Log completo em `checkpoints/verify-0.14.0.log`.

## Cobertura executada

| Suíte | Evidência |
| --- | --- |
| smoke.cjs | Inicialização, camadas/histórico, radial, pincel, menus, geometria e ausência de IA |
| ux.cjs | Snaps independentes, guias, roteamento de menus, zoom curvo/teclado/histórico, camada/exclusão/undo e estilo de seleção com aplicar/cancelar |
| autosave.cjs | Relógio determinístico: 5000 ms, reinício após alteração, salvar manualmente, descarregar e edições durante gravação |
| stroke-start.cjs | Primeiro movimento sem backup; recuperação após 5 s de traço contínuo em tarefa idle, cancelada ao concluir |
| smoothing.cjs | Suavização determinística, atenuação de tremores, cantos, pressão e extremidades |
| source-build.cjs | Integração dos fontes, manifesto e verificações básicas de CSS |
| evolution.cjs | Pauta pela UI, exportação, histórico, migração 1–7, backups desligados sem clonagem, inclinação, QuickShape preservando tinta, hexágono, snaps adicionais, seleção poligonal, camadas/undo/reordenação, presets, slider fino, direção radial e navegador |
| notebook.cjs | Índice, criar/ordenar/remover/undo/redo, conflito externo; PDF simulado com limites, processamento serial, fundo bloqueado e liberação de recursos |

## Benchmark comparativo

Execute `node scripts/benchmark.cjs [caminho/para/main.js]`. Para a referência, foi usada uma cópia do bundle 0.13.1 original antes das edições. Medição CPU de 80 inícios/primeiros movimentos/finalizações em documento de 20 mil objetos; 800 movimentos prolongados e 100 consultas espaciais. Renderização Canvas/GPU e escrita em disco estão desabilitadas. Não mede latência ponta–pixel nem seleção visual completa. JSONs preservados em `checkpoints/`.

| Operação | 0.13.1 mediana / p95 (ms) | 0.14.0 mediana / p95 (ms) |
| --- | --- | --- |
| Iniciar traço | 0,1576 / 0,4742 | 0,1348 / 0,2296 |
| Primeiro movimento | 0,0181 / 0,2787 | 0,0168 / 0,0654 |
| Finalizar traço | 5,2978 / 10,9011 | 5,0443 / 8,8254 |
| Movimento prolongado | 0,0137 / 0,0334 | 0,0053 / 0,0176 |
| Consulta espacial | 0,0380 / 0,1576 | 0,0419 / 0,1689 |

Ambas as execuções registraram zero clonagens completas e zero backups nos handlers medidos. A diferença temporal de uma única execução é sensível a JIT, sistema e coleta de lixo: não demonstra uma porcentagem de melhoria física. A consulta espacial foi ligeiramente mais lenta; os resultados são compatíveis com ruído de execução. A finalização ainda contém trabalho proporcional ao número de objetos herdado da base e não é tempo constante.

## Problemas encontrados e corrigidos

- Agendamento auxiliar pressupunha timer/configurações em objetos de teste mínimos: adicionadas verificações, sem alterar o salvamento.
- Guarda de backups precisava aceitar plugin ainda sem preferências inicializadas; isso evitou transformar um erro auxiliar em recuperação de salvamento nos testes.
- Validação de polígonos ainda exigia quatro vértices: corrigida para 3–32, com teste de reconhecimento e round-trip de hexágono. Âncoras agora aceitam os índices correspondentes.
- Duplicação de camada agora valida limites antes de alterar o documento; importação PDF mantém proporções e pausa entre páginas enquanto um gesto estiver ativo.

## Limites da evidência e próximos testes reais

Não houve acesso a um Obsidian real, mesa digitalizadora, driver, tela de alta densidade ou diálogo de impressão. Não foram medidos frames perdidos, GPU, memória real de grandes PDFs, latência física ou estética dos traços. A API PDF.js foi confirmada nas fontes oficiais, mas os testes de importação usam doubles; PDF/cadernos continuam experimentais.

Antes de uso intensivo, verificar em uma cópia do vault: pressão/inclinação/coalescência com a mesa; escrita pequena e curvas; menus por teclado e botões reais; conta-gotas e sliders; salvamento com arquivo externo alterado; tema claro/escuro e zoom/rotação; importação PDF com cancelamento e impressão; camadas grandes com miniaturas/navegador ativos. Isso não foi apresentado como validação já concluída.
