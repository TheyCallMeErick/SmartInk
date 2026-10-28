# Smart Ink 0.20.0 — desempenho de seleções

## Causa e correção

A rotina anterior copiava os pontos dos objetos selecionados em cada pointermove, reconstruía o índice espacial, invalidava os caminhos de desenho e recalculava os limites usados nas alças. Dispositivos com frequência de eventos maior que a frequência da tela repetiam esse custo várias vezes por quadro.

A partir de 32 objetos, mover usa um deslocamento sobre a geometria original. Os eventos são agrupados com requestAnimationFrame; são mantidos os limites, a ordem dos objetos e os caminhos Path2D originais. O desenho aplica uma translação temporária no contexto Canvas, sem rasterizar ou reduzir a qualidade da tinta. A visibilidade considera o deslocamento, incluindo objetos originalmente fora da tela. Alças e guias usam o retângulo calculado no início do gesto. Limites dos alvos de alinhamento são reaproveitados.

Conectores afetados têm prévia própria para acompanhar as âncoras. Ao soltar, a posição do último evento é usada mesmo sem um quadro pendente ter executado. Os pontos definitivos são gerados uma vez e a operação continua correspondendo a um desfazer. Cancelar mantém o documento original. Alteração da revisão ou sessão invalida a prévia; callbacks pendentes são cancelados ao cancelar/fechar.

## Escopo e limites

A otimização é para mover seleções com pelo menos 32 objetos. Seleções pequenas, rotação e redimensionamento mantêm os caminhos existentes. Não há mudança de formato nem perda de precisão. O primeiro quadro prepara limites; soltar ainda exige atualizar coordenadas, conexões e histórico. Desenhos extremamente densos podem continuar limitados pelo trabalho de pintura da GPU; esta mudança reduz cópias e cálculos JavaScript durante o arraste. O custo de pintura dos objetos visíveis continua existindo.

## Verificação

Quatorze suítes automatizadas aprovadas em docs/checkpoints/verify-0.20.0.log. A nova regressão verifica agrupamento de eventos, reutilização de caminhos, ausência de cópias de geometria comum por quadro, conector externo acompanhando a seleção, aplicação do último evento, um desfazer, cancelamento e revisão concorrente.

scripts/benchmark-selection.cjs compara a mesma carga nas duas versões: 500 traços, 64.000 pontos, 30 quadros e quatro eventos de ponteiro por quadro, com guias desligadas. A pintura e o overlay são desativados nessa medição isolada; os resultados medem apenas processamento JavaScript do arraste, não FPS real nem latência da mesa. Uma tentativa com pintura simulada completa foi interrompida pelo custo elevado da versão anterior, sem resultado quantitativo. Resultados em docs/checkpoints/selection-before-0.20.json e selection-after-0.20.json. A validação visual no Obsidian continua pendente.

## Instalação

Substitua os arquivos do plugin com ele desativado e reative. Preserve data.json e os documentos .smartink.

Resultado isolado: mediana por lote de quatro eventos de 124,22 ms antes e 0,01 ms depois; p95 de 146,23 ms e 0,10 ms. Cópias de geometria durante os 30 quadros: 60.000 antes e zero depois. A preparação inicial e a confirmação final não são representadas pela mediana; a medição exclui desenho/overlay e não deve ser interpretada como FPS.
