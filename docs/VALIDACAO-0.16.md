# Validação 0.16.0

`npm run verify`: build reproduzível, sintaxe, versão, dez suítes headless e ZIP instalável. Resultado completo em `checkpoints/verify-0.16.0.log`.

A suíte nova `vector-tools.cjs` cobre:

- Booleans, região com furo, roundtrip JSON, dados inválidos, transformação, seleção e SVG evenodd; tinta mantém nonzero.
- Prévia sem mutação, cancelar, aplicar, rejeição de revisão obsoleta e undo/redo.
- Inserção Bézier por de Casteljau comparada em vários parâmetros, alças simétricas, remoção, abertura e divisão.
- Recorte interpolando pressão/inclinação; intervalo circular que atravessa o início do contorno.
- Preenchimento entre linhas, abertura recusada, tolerância de fresta, subdivisão por interseção, furos e clique externo recusado.
- Repetição com remapeamento de conexões e retirada de vínculo externo; tangência após mover o círculo.
- Fluxo de ponteiro para preenchimento com confirmação; continuação opt-in, uma ação de histórico, Alt e cancelamento; orientação preservada ao prolongar o início.
- QuickShape não muda de tamanho ao alternar escala para rotação; Shift restringe em 15°.
- Preferências persistentes e painel de nós.

As nove suítes anteriores continuam cobrindo suavização, jitter/cantos/pressão, ausência de backup no primeiro movimento, salvamento, UI existente, cadernos/PDF simulados e reconhecimento de formas.

## Benchmark CPU sintético

20 mil objetos; 80 inícios de traço, 800 movimentos prolongados. Resultado em `checkpoints/benchmark-0.16.0.json`.

| Operação | Mediana (ms) | p95 (ms) |
| --- | --- | --- |
| Início do traço | 0,1284 | 0,2434 |
| Primeiro movimento | 0,0159 | 0,0682 |
| Finalização | 4,8290 | 10,3103 |
| Movimento prolongado | 0,0054 | 0,0128 |
| Consulta espacial | 0,0340 | 0,1034 |

Zero clonagens integrais ou backups durante os handlers medidos. O cenário mede escrita comum, não duração de operações booleanas ou preenchimento.

## Limites da evidência

DOM, canvas, API Obsidian e relógio são simulados. Os testes não certificam aparência, foco no Chromium real, drivers, pressão física ou fluidez na máquina do usuário. Chromium não está disponível neste ambiente; a suíte de navegador não foi executada. `npm run test:browser` permanece disponível no projeto para um ambiente com Playwright/Chromium configurado.
