# Registro de validação local — 0.13.1

Automatizado (Node, sem Obsidian):
- Startup headless e comandos principais do menu radial
- Compatibilidade do esquema de camadas e desfazer/refazer
- Encaixes de origem e outros objetos isolados, guarda Alt e master switch
- Guias independentes do encaixe em pontos
- Abertura e localização das opções de precisão e do menu •••
- Slider curvo de zoom: exibição, limites 10%–800%, teclado e arraste, histórico limitado a um estado por gesto, opção de esconder
- Exclusão de camada e seu conteúdo, em uma transação que permite desfazer
- Suavização determinística, preservação de pressão/ângulos/pontas e amortecimento de tremor
- Ausência do reconhecimento de escrita por IA antigo

A verificar **manualmente no Obsidian**: toque e pressão da mesa digitalizadora, side-button para radial, pinch/touch quando disponível, leitura de tela, posicionamento em layouts horizontais/verticais compactos, cor/contraste dos temas, camadas com projetos grandes e fluxos de backup/recuperação.


## Atualização 0.13.0

- Testes com relógio simulado verificam debounce de 5000 ms, reinício, flush manual/saída e edições durante escrita pendente.
- Testes do painel de seleção verificam paleta compartilhada, prévia sem alteração de documento, cancelamento, aplicação em ação única e undo.
- O funcionamento real no Obsidian/mesa digitalizadora continua sujeito a teste manual.

## Atualização 0.13.1

- Regressão automatizada de `pointerdown/pointermove` confirma ausência de backup no início do novo traço.
- Cópia intermediária somente após 5 segundos de traço contínuo, em ociosidade quando suportada.
- Finalização da escrita cancela cópias ainda agendadas.
