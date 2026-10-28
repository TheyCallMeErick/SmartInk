# Auditoria 0.13.1

Base: ZIP fornecido, build e seis suítes headless existentes executados antes das alterações. Referência sintética em baseline-0.13.1.json; primeiro movimento não clonou documentos nem chamou backups.

Entrada, render, sessões e salvamento residem em src/plugin/index.js. O motor de tinta em src/core/ink-engine.js já tem reamostragem, estabilização adaptativa e proteção de cantos: será preservado. Geometry cuida de encaixes/reconhecimento/transformações; Visibility, de geometria apagada e índice espacial; Document, de validação/SVG/histórico; Brushes, de preferências. As camadas legacy-features e quality-of-life sobrepõem métodos: os novos módulos ficam delimitados e a manutenção do pipeline permanece explícita.

Riscos encontrados: renderLayerDock filtra todos os objetos por camada e recria controles; snap percorre objetos; finish faz manutenção de conexões; cópias já são adiadas para idle após 5 s de traço. Não adicionar manutenção síncrona no início da caneta. Sem novas dependências para as ferramentas. PDF usará a API loadPdfJs do Obsidian apenas mediante ação explícita.

Formato 8: campos opcionais paperSpacing/gridStyle e polígonos editáveis. Leitura dos formatos 1–7 preservada e migração testada; versões anteriores não devem abrir documentos novos com polígonos. Páginas múltiplas serão arquivos smartink independentes, associados por índice de caderno, sem reescrever o modelo de tinta.
