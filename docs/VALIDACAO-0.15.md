# Validação 0.15.0

`npm run verify`: build, sintaxe, consistência de versão, nove suítes headless e ZIP instalável. Log em `checkpoints/verify-0.15.0.log`.

As oito suítes anteriores foram mantidas. `shapes-and-ink.cjs` acrescenta:

- Todas as 30 opções e limites dos parâmetros passam pela validação normal do documento e exportação SVG.
- Proporções do quadrado e edição paramétrica após rotação; edição de vértices remove o vínculo paramétrico.
- Pointerdown/move/up, uma operação no histórico, cancelamento e rejeição de gesto se a página mudou.
- Círculo aberto, retângulo em quatro traços e popover com SVGs; seleção, aplicar, manter original e undo.
- União de extremidades invertidas, distância máxima, continuidade temporal e conservação de pressão; prévia/cancelar/aplicar/undo.
- Deformação local, partes distantes intactas, pressão/inclinação e histórico.
- Ajuste geométrico de escrita não modifica as amostras originais e conserva pressão.
- Diagrama de duas caixas e ligação: conexão acompanha a caixa ao movê-la.
- Gesto de pincel não cria tinta, altera tamanho e permite cancelar.

`notebook.cjs` passou a testar navegação, bloqueio por erro de salvamento e geração do HTML de impressão com tamanho por página. PDF.js e Obsidian são simulados nesses testes.

## Desempenho

Mesmo benchmark CPU headless da 0.14, com 20 mil objetos, 80 inícios de traço, 800 movimentos prolongados e 100 consultas espaciais:

| Operação | Mediana (ms) | p95 (ms) |
| --- | --- | --- |
| Iniciar traço | 0,1127 | 0,2880 |
| Primeiro movimento | 0,0143 | 0,0628 |
| Finalizar traço | 4,8453 | 10,6837 |
| Movimento prolongado | 0,0055 | 0,0158 |
| Consulta espacial | 0,0319 | 0,1180 |

Zero clonagens completas e zero backups nos handlers medidos. O teste não inclui Canvas/GPU, disco, popover ou reconhecimento ativo e não mede latência física. Pequenas diferenças em relação à 0.14 não permitem concluir uma melhoria percentual; a finalização p95 ficou maior nesta execução. O motor de suavização não foi substituído.

## Verificação visual e limites

Foi criado `npm run test:browser`, teste opcional de DOM/Canvas real com Playwright e host Obsidian simulado. **Não foi executado até o fim:** Chromium não estava instalado, e o download forneceu arquivos inválidos/truncados. Essa falha de ambiente não é contabilizada como teste aprovado. O script fica disponível para execução local após instalar Playwright e Chromium.

Não houve validação em Obsidian, mesa física, driver, tema real, exportação PDF real ou sessão prolongada. Portanto, a entrega continua beta. Ajuste de escrita, interpretação de diagrama e páginas/PDF têm limites explicitados em IMPLEMENTACAO-0.15.md; não são reconhecimento semântico universal nem equivalentes completos às ferramentas do Inkscape.
