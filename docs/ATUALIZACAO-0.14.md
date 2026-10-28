# Atualização para Smart Ink 0.14.0

1. Feche as páginas abertas do Smart Ink e preserve uma cópia dos arquivos `.smartink` e de `.obsidian/plugins/smart-ink/data.json`.
2. Extraia o ZIP instalável e substitua `main.js`, `manifest.json`, `styles.css` e os avisos de terceiros em `.obsidian/plugins/smart-ink/`. Não substitua `data.json`.
3. Reative o plugin no Obsidian Desktop. O pacote não envia notas para serviços externos.

## Pauta e backups

Abra **••• → Pauta, grade e backups**. Escolha o fundo pautado nas configurações do documento e ajuste **Espaço entre linhas / grade**, entre 8 e 200 unidades do canvas (pixels em zoom 100%). Padrão: 28. O ajuste pertence ao documento, acompanha exportações com papel e aceita Desfazer/Refazer.

Desmarque **Criar backups automáticos** para desligar novas cópias de recuperação em todas as páginas. Esse controle também aparece em **Cópias de recuperação**. Mantém as cópias antigas, o autosave de 5 segundos e a recuperação de conflitos de gravação. Uma gravação de backup já iniciada pode concluir. Enquanto desligado, o comando de criar ponto de recuperação também não cria cópias. Religue o controle para voltar a criá-las.

## Novos controles

| Caminho | Opções |
| --- | --- |
| ••• → Precisão e encaixes | Centros, interseções, grade, sensibilidade à velocidade, rigor QuickShape e tecla de proporções |
| ••• → Personalizar radial e zoom | Habilitar seleção direcional ao soltar |
| Organizar → Seleção avançada | Polígono, operações de conjunto, inversão e seleção da camada |
| Organizar → Biblioteca de pincéis | Estilos prontos, coleção própria, JSON de importação/exportação |
| Atalhos e favoritos | Personalizar conta-gotas, troca de cores/favoritos e seleção temporária |
| Interface | Ações para botões secundário, do meio e ponta borracha |
| Opções da camada | Duplicar, selecionar objetos, assistência e visibilidade/bloqueio em lote |
| ••• → Mostrar / ocultar navegador | Navegador no canto inferior esquerdo |
| ••• → Caderno e páginas (experimental) | Índice de páginas, importação de intervalo PDF e impressão |

Atalhos novos padrão, com foco no canvas: **I** conta-gotas, **X** troca de cor, **B** alterna dois favoritos, **segurar Q** cursor temporário. Espaço e borracha temporária continuam como antes. Esc cancela seleção poligonal; Enter a conclui. No pincel, arraste sliders e afaste o cursor verticalmente para ajustes menores. A suavização e estabilização continuam configuráveis separadamente.

No QuickShape, segurar no fim mostra a prévia; solte e clique **Aplicar** para converter. O original permanece no documento até confirmar, e Desfazer restaura a tinta.

## Compatibilidade

Documentos anteriores continuam abrindo e passam ao esquema 8 no próximo salvamento. A versão antiga não lê esquema 8: para retornar à 0.13.1, restaure seus arquivos anteriores. Cadernos são apenas índices; arquivos de páginas permanecem utilizáveis individualmente. Não há migração automática de documentos para cadernos.

PDF e cadernos são experimentais. O importador exige que a instalação disponibilize `loadPdfJs`; caso contrário informa a indisponibilidade e não importa. Para exportar, escolha Salvar como PDF no diálogo do sistema; os arquivos de origem preservam tinta editável. Veja limites e itens pendentes em `IMPLEMENTACAO-0.14.md`.
