# Implementação 0.14.0

Evolução sobre o fonte 0.13.1 fornecido. A validação desta entrega é automatizada/headless; nenhum recurso novo foi validado com hardware ou em uma instalação real do Obsidian. Não foi adicionado reconhecimento de escrita por IA.

## Alterações implementadas e cobertas por testes

| Área | Resultado |
| --- | --- |
| Pauta | Espaçamento por documento de 8 a 200 unidades, padrão anterior de 28; histórico, persistência e SVG com papel. A grade usa o mesmo passo. |
| Backups | Controle global persistente para impedir novas cópias, inclusive intermediárias de traços longos; verificação antes da clonagem e antes da execução da fila. Não apaga arquivos nem desativa autosave/recuperação por conflito. |
| QuickShape | Limite de erro configurável, reconhecimento adicional de polígonos, proporção com modificador, manutenção do traço original até Aplicar. Alternativas e edição de pontos existentes preservadas. Reconhecimento ao soltar é adiado para fora do handler. |
| Escrita | Motor adaptativo anterior preservado; perfis pequena/normal/caligrafia/diagramas e controles independentes. Preservação de inclinação nas amostras. Fechamento na origem usa sinal incremental em vez de procurar em todo o histórico do traço. |
| Precisão | Snap de centros, interseções de segmentos retos e grades cartesianas/isométricas; redução opcional do raio com velocidade. Recursos desativados por padrão e sem atração da escrita normal. |
| Seleção | Seleção poligonal, adicionar/subtrair, inversão e seleção da camada; transformações e edição de estilo com prévia existentes preservadas. |
| Radial | Seleção direcional opcional ao soltar, zona morta e proteção de 100 ms; clique, configuração contextual e zoom curvo mantidos. |
| Controles | Conta-gotas, troca de cor anterior, dois favoritos, atalhos e mapeamento dos botões. Sliders do painel do pincel ganham precisão ao afastar o cursor verticalmente. |
| Camadas | Reordenação por arraste, duplicação atômica com undo, seleção para visibilidade/bloqueio em lote e assistência de formas por camada. |
| Presets | Sete estilos iniciais e coleção personalizada com criar/renomear/duplicar/excluir/importar/exportar. Importações validadas e normalizadas antes de alterar a coleção. |

Os testes exercitam lógica e partes da UI com DOM simulado. Conta-gotas, captura de ponteiro, sliders nativos, atalhos de driver e renderização visual precisam de verificação no aplicativo real.

## Recursos parciais e experimentais

- **Navegador:** painel persistente com clique/arraste, teclado e viewport. Usa retângulos de limites dos objetos como representação simplificada, não uma reprodução fiel de toda a tinta. Ativado explicitamente; manutenção adiada enquanto há um gesto.
- **Miniaturas de camadas:** SVG em cache por referências dos objetos, até 300 objetos por miniatura. A comparação do cache ainda percorre elementos por camada. Não é um renderer incremental completo; camadas extensas podem ter miniaturas incompletas.
- **Cadernos/PDF:** índice separado `.smartink-book.json`, páginas `.smartink` independentes, criar/renomear/ordenar/remover do índice, histórico em memória, comparação antes de gravar e miniatura sob demanda. Remover do índice conserva o arquivo. PDF é rasterizado por página em fundo bloqueado, com anotações vetoriais editáveis sobre ele. Máximo de 10 páginas por importação, 100 por caderno, PDF de 50 MB e raster de 1600 px por lado. Exportação usa o diálogo de impressão do sistema em A4 e permite salvar PDF. A saída do caderno recorta cada página à sua área nominal; o exportador comum continua disponível para canvas infinito. Testes de PDF usam uma implementação simulada de PDF.js; importação/impressão reais não foram verificadas. A importação aguarda gestos entre páginas, mas um raster já em andamento não é pausado quando começa outro traço.
- **Reconhecimento:** polígonos de 5–12 vértices inferidos por simplificação do contorno; não regulariza obrigatoriamente todos os lados/ângulos. Reconhecimento é heurístico, local e revisável, sem garantia de identificar todo desenho.
- **Interseções:** limitado a segmentos retos de até 64 objetos próximos e 80 segmentos; não contempla interseções analíticas de curvas/elipses ou todos os pontos de um traço livre.
- **Assistência por camada:** habilita intenção de reconhecimento geométrico; não constitui uma régua com perspectiva por camada.

## Não implementado nesta entrega

- Grupos hierárquicos de camadas e reordenação coletiva das camadas marcadas.
- Novas guias completas de distâncias iguais/distribuição: as guias de alinhamento anteriores continuam disponíveis.
- Thumbnail fiel do canvas completo em resolução adaptativa e renderer incremental de todas as miniaturas.
- Catálogo de PDFs virtualizado, texto pesquisável do PDF e exportação de anotações PDF nativas. O fundo importado é uma imagem.
- Um novo algoritmo de suavização: preservou-se o motor adaptativo já aprovado, com novos perfis, evitando prometer superioridade sem medições reais.

## Arquitetura e dependências

O build continua sendo concatenação determinística dos módulos existentes. `evolution.js` reúne extensões de UI e ferramentas; `notebook.js` mantém o índice e PDF isolados da sessão de tinta. Não houve reescrita de framework. Os wrappers de métodos preservam a arquitetura recebida, mas são um acoplamento a reduzir em uma futura refatoração isolada.

Esquema 8: aceita e migra documentos 1–7; inclui campos opcionais de papel, assistência de camada, inclinação e polígonos. A migração ocorre em memória e é persistida no próximo salvamento. A versão 0.13.1 rejeita esquema 8, portanto voltar à versão antiga exige restaurar cópias anteriores.

Nenhuma dependência npm nova. PDF.js é carregado pela API `loadPdfJs` do Obsidian somente por solicitação de importação, com verificação de disponibilidade. As bibliotecas vendorizadas e seus avisos foram preservados. Referências técnicas: [API Obsidian](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts) e [exemplos oficiais PDF.js](https://mozilla.github.io/pdf.js/examples/).

Contratos: não serialize documentos ao iniciar um traço; mantenha autosave de 5000 ms e fila de gravação; preserve dados originais até confirmar uma correção; execute manutenção auxiliar fora dos gestos; valide um novo documento antes de gravar; nunca apague páginas ao remover entradas de um caderno.
