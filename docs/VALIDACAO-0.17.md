# Validação 0.17.0

`npm run verify` executa build reproduzível, sintaxe, consistência de versão, onze suítes e empacotamento. Log: `checkpoints/verify-0.17.0.log`.

A suíte `refinement.cjs` cobre:

- Trecho exato do recorte e diagnóstico de uma fresta entre quatro linhas.
- Contorno externo/furo, fechamento dos anéis e normalização após edição.
- Arraste do segmento Bézier, múltiplos nós, inserção por duplo clique, cancelamento, histórico rotulado e parâmetros preservados.
- Raio de círculo reconhecido com centro preservado; dimensões/arredondamento do retângulo.
- Seletor visual de objetos sobrepostos, realce por foco e escolha.
- Ferramentas temporárias aninhadas, liberação fora de ordem e retorno após botão da caneta.
- Comparação dos dez modelos de algarismos, agrupamento de uma sequência, correção manual, manutenção do original, confirmação/undo, exemplos pessoais e preferências.
- Gravação e leitura em disco de documento de exemplo com pressão, curva, região com furo e conector vinculado.
- Execução do código do Web Worker em thread Node real, cancelamento, limpeza de URLs, recusa de revisão obsoleta, prévia/aplicar/undo e diagnóstico assíncrono.
- Hover de recorte e limpeza ao trocar de ferramenta.

Os testes de algarismos usam modelos autorais conhecidos; **não constituem avaliação de reconhecimento em escrita real**. As dez suítes anteriores continuam cobrindo suavização, pressão, persistência, ausência de backups no primeiro movimento e ferramentas existentes.

## Desempenho sintético

20 mil objetos, 80 inícios de traço e 800 movimentos prolongados. O benchmark desativa renderização real; resultados não são latência da mesa.

| Operação | Mediana (ms) | p95 (ms) |
| --- | --- | --- |
| Início do traço | 0,1906 | 0,4703 |
| Primeiro movimento | 0,0218 | 0,1306 |
| Finalização | 5,4368 | 10,0960 |
| Movimento prolongado | 0,0066 | 0,0224 |
| Consulta espacial | 0,0334 | 0,1213 |

Zero clonagens integrais/backups nos handlers medidos. Não houve ensaio da acurácia ou custo de reconhecimento em documentos extensos. Resultado bruto em `checkpoints/benchmark-0.17.0.json`.

## O que não foi validado

Obsidian real, canvas/GPU, foco no Chromium, Web Worker sob as políticas do Obsidian, hardware, driver e temas. Chromium não está instalado neste ambiente. `npm run test:browser` permanece como teste opcional em ambiente com Playwright/Chromium. Os testes automatizados não substituem a rodada manual descrita em IMPLEMENTACAO-0.17.md.
