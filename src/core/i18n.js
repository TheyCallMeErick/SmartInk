/* Exact UI messages, scoped DOM localization and a Portuguese fallback. */
const I18n = (() => {
  const en = Object.fromEntries(
    `
Documento|Document
Documento e configurações|Document and settings
Configurações|Settings
Buscar configurações|Search settings
Categorias de configurações|Settings categories
Resultados da busca|Search results
Limpar|Clear
Fechar|Close
Fechar painel|Close panel
Fechar mensagem|Dismiss message
Salvar|Save
Salvar agora|Save now
Salvando…|Saving…
Salvo|Saved
Não foi possível salvar|Could not save
Ajustando…|Editing…
Alterações salvas automaticamente|Changes are saved automatically
As preferências são salvas automaticamente.|Preferences are saved automatically.
Preferências do plugin|Plugin preferences
Preferências|Preferences
Interface|Interface
Interface e gestos|Interface and gestures
Atalhos e favoritos|Shortcuts and favorites
Atalhos e pincéis|Shortcuts and brushes
Atalhos e pincéis favoritos|Shortcuts and favorite brushes
Menu radial|Radial menu
Precisão|Precision
Precisão e encaixes|Precision and snapping
Mesa digitalizadora|Pen tablet
Navegação e medidas|Navigation and measurements
Biblioteca de pincéis|Brush library
Pincel atual|Current brush
Idioma|Language
Automático|Automatic
Português (Brasil)|Portuguese (Brazil)
Inglês|English
Tipo de papel|Paper type
Pontos|Dots
Grade|Grid
Pautado|Ruled
Liso|Plain
Espaço entre linhas / grade|Line / grid spacing
Tipo de grade|Grid type
Cartesiana|Cartesian
Isométrica|Isometric
Modelos de página|Page templates
Réguas e guias desta página|Page rulers and guides
Regiões e minimapa|Regions and minimap
Abrir camadas|Open layers
Criar nota vinculada a esta página|Create a note linked to this page
Copiar incorporação para nota|Copy note embed
Personalizar radial e zoom|Customize radial menu and zoom
Perfis da mesa digitalizadora|Pen tablet profiles
Arquivo e segurança|Files and recovery
Criar backups automáticos|Create automatic backups
Exportar e imprimir|Export and print
Baixar cópia editável|Download editable copy
Cópias de recuperação|Recovery copies
Histórico visual|Visual history
Diagnóstico de desempenho|Performance diagnostics
Caderno e páginas (experimental)|Notebook and pages (experimental)
Mostrar / ocultar navegador|Show / hide navigator
Barra de ferramentas|Toolbar
Superior|Top
Inferior|Bottom
Lateral esquerda|Left side
Lateral direita|Right side
Modo canhoto (barra à direita)|Left-handed mode (toolbar on the right)
Densidade dos controles|Control density
Compacta|Compact
Confortável|Comfortable
mesa digitalizadora|pen tablet
Tecla do menu radial|Radial menu key
Restaurar posições dos painéis|Reset panel positions
Botão secundário|Secondary button
Botão do meio|Middle button
Ponta borracha|Eraser tip
Padrão do plugin|Plugin default
Radial|Radial
Mover|Move
Borracha|Eraser
Cursor|Selection
Conta-gotas|Eyedropper
Movimento mínimo para arrastar seleção (px)|Selection drag threshold (px)
Gestos e botões avançados|Advanced gestures and buttons
Botão secundário abre menu radial|Secondary button opens the radial menu
Riscar para apagar|Scratch to erase
Gesto para desfazer|Undo gesture
Laço temporário|Temporary lasso
Salvar pincel atual nos favoritos|Save current brush as favorite
Caneta|Pen
Lápis|Pencil
Marca-texto|Highlighter
Laço|Lasso
Conector|Connector
Modo foco|Focus mode
Segurar|Hold
borracha temporária|temporary eraser
cursor temporário|temporary selection
Lado máximo de imagens importadas|Maximum imported image dimension
Alternar cor atual/anterior|Swap current and previous colors
Alternar dois favoritos|Swap two favorites
Alternar cor|Swap color
Alternar favoritos|Swap favorites
Segurar e arrastar|Hold and drag
ajustar pincel|adjust brush
Voltar à escrita|Return to writing
Restaurar atalhos|Reset shortcuts
Escrita fina|Fine writing
Escrita normal|Normal writing
Caligrafia|Calligraphy
Títulos|Headings
Diagramas|Diagrams
Linhas técnicas|Technical lines
Salvar pincel atual|Save current brush
Exportar presets|Export presets
Importar presets|Import presets
Nome do preset|Preset name
Prontos para usar|Ready to use
Ativar encaixe de pontos|Enable point snapping
Fechar traço na própria origem|Close stroke at its start
Encaixar em outros objetos|Snap to other objects
Atrair escrita livre para outros objetos|Snap freehand ink to other objects
Extremidades|Endpoints
Cantos|Corners
Meios e pontos cardinais|Midpoints and cardinal points
Distância de encaixe (pixels)|Snap distance (pixels)
Mostrar guias|Show guides
Encaixar nas guias|Snap to guides
Guias inteligentes ao mover|Smart guides while moving
Corrigir forma ao segurar|Correct shape on hold
Tempo para corrigir forma (ms)|Shape hold delay (ms)
Testar minha escrita|Test my handwriting
Encaixar em interseções|Snap to intersections
Encaixar no centro dos objetos|Snap to object centers
Encaixar na grade|Snap to grid
Reduzir magnetismo em movimento rápido|Reduce snapping during fast movement
Erro máximo de QuickShape (menor = mais rigoroso)|Maximum QuickShape error (lower = stricter)
Tecla de proporções|Proportion key
Prévia de encaixe ao aproximar a caneta|Preview snapping on pen hover
Continuar tinta a partir de extremidades|Continue ink from endpoints
Oferecer assistência de números após pausa|Offer number assistance after a pause
Exibir zoom curvo no menu radial|Show curved zoom in the radial menu
Escrita|Writing
8 ações|8 actions
Selecionar|Select
Réguas|Rulers
Reconhecer formas|Recognize shapes
Desfazer|Undo
Refazer|Redo
Enquadrar|Fit view
Suavizar seleção|Smooth selection
Camadas|Layers
Encaixes|Snapping
Restaurar padrão|Restore defaults
Selecionar por direção ao soltar|Select by direction on release
Salvar perfil atual|Save current profile
Prévia de pressão e largura|Pressure and width preview
Proteger escrita pequena (novos traços)|Protect small handwriting (new strokes)
Rotação da vista (graus)|View rotation (degrees)
Restaurar orientação|Reset orientation
Voltar à vista anterior|Previous view
Avançar na navegação|Next view
Unidade|Unit
Unidades do canvas|Canvas units
Milímetros|Millimeters
Centímetros|Centimeters
Polegadas|Inches
Unidades por polegada|Units per inch
Preto|Black
Cinza|Gray
Cinza claro|Light gray
Prata|Silver
Cinza suave|Soft gray
Branco|White
Vinho|Burgundy
Vermelho|Red
Laranja|Orange
Âmbar|Amber
Amarelo|Yellow
Amarelo claro|Light yellow
Verde escuro|Dark green
Verde|Green
Verde lima|Lime green
Verde água|Teal
Menta|Mint
Verde claro|Light green
Azul marinho|Navy blue
Azul|Blue
Azul turquesa|Turquoise
Ciano|Cyan
Azul claro|Light blue
Azul suave|Soft blue
Roxo|Purple
Violeta|Violet
Orquídea|Orchid
Rosa|Pink
Rosa claro|Light pink
Marrom|Brown
+ Cor personalizada|+ Custom color
Escolher cor personalizada|Choose custom color
Espessura|Width
Espessura em pixels|Width in pixels
Opacidade|Opacity
Letra pequena|Small handwriting
Desenho|Drawing
Experimentar a caneta|Try the pen
Limpar teste|Clear test
Usar ajuste atual como referência|Use current settings as reference
Antes|Before
Atual|Current
Mais opções do pincel|Advanced brush options
Usar pressão da caneta|Use pen pressure
Suavização|Smoothing
Preservar mudanças de direção|Preserve corners
Estabilização|Stabilization
Espessura mínima (fração)|Minimum width (fraction)
Curva de pressão|Pressure curve
Restaurar suavização|Reset smoothing
Restaurar pressão|Reset pressure
Comparar pontos originais durante escrita|Compare original points while writing
Testar e calibrar pressão|Test and calibrate pressure
Manter painel aberto ao escolher|Keep panel open after choosing
Perfil de suavização|Smoothing profile
Personalizado|Custom
Valores variados|Mixed values
Teste e calibração|Test and calibration
Aplicar faixa capturada|Apply captured range
Restaurar pressão padrão|Reset pressure defaults
Voltar ao pincel|Back to brush
Área de teste limpa.|Test area cleared.
Até 24 traços de teste.|Up to 24 test strokes.
Mouse|Mouse
pressão fixa|fixed pressure
Pressão|Pressure
Amostra com o ajuste anterior|Sample with previous settings
Área de teste da caneta|Pen test area
Prévia do traço|Stroke preview
Teste aqui sem marcar a página. Alterar o pincel atualiza a amostra. Mouse usa pressão fixa.|Try here without marking the page. Brush changes update the sample. A mouse uses fixed pressure.
Restaurar afeta somente o grupo indicado. Cor, espessura e os outros ajustes são preservados.|Reset affects only the indicated group. Color, width and other settings are preserved.
A estabilização reduz tremores, mas valores altos podem arredondar letras pequenas.|Stabilization reduces jitter, but high values can round off small letters.
Sobre suavização|About smoothing
Sobre estabilização|About stabilization
Sobre curva de pressão|About the pressure curve
Arredonda o contorno do traço. Compare a mesma amostra antes e depois para preservar detalhes.|Rounds the stroke outline. Compare the same sample before and after to preserve details.
Reduz tremores acompanhando a trajetória. Valores altos podem atrasar a ponta e arredondar letras pequenas.|Reduces jitter along the path. High values can lag behind the pen and round off small letters.
Muda a resposta à força da caneta. Valores maiores exigem mais pressão para engrossar o traço.|Changes how force affects the pen. Higher values require more pressure for a thicker stroke.
← Voltar à categoria|← Back to category
Nenhum resultado. Tente “pressão”, “backup” ou “atalho”.|No results. Try “pressure”, “backup” or “shortcut”.
Nome do favorito|Favorite name
Nome do pincel favorito|Favorite brush name
Arrastar favorito|Drag favorite
Mover favorito para cima|Move favorite up
Mover favorito para baixo|Move favorite down
Usar|Use
Atualizar|Update
Remover|Remove
Excluir|Delete
Duplicar|Duplicate
Substituir pelo pincel atual|Replace with current brush
Favoritos atualizados|Favorites updated
Atalhos restaurados|Shortcuts reset
Ajuste do pincel restaurado|Brush settings reset
Desfazer ajuste|Undo setting change
Este ajuste já mudou. Desfazer não substituirá alterações posteriores.|This setting has changed again. Undo will not overwrite later changes.
Aplicar alterações|Apply changes
Aplicar à seleção|Apply to selection
Cancelar alterações|Cancel changes
Cancelar|Cancel
Aplicar prévia|Apply preview
Continuar editando|Continue editing
Descartar prévia|Discard preview
Próximos traços|Future strokes
ajustes imediatos|immediate changes
Seleção atual|Current selection
prévia até aplicar|preview until applied
Esta página|This page
papel e grade / Preferências do plugin|paper and grid / Plugin preferences
arquivo e segurança|files and recovery
neste vault|in this vault
teste fora da página|test outside the page
Estilo da seleção|Selection style
Estilos rápidos|Quick styles
Cores|Colors
Recentes|Recent
Estilo da linha|Line style
Contínua|Solid
Tracejada|Dashed
Pontilhada|Dotted
Ajustes finos dos traços|Fine stroke settings
Ferramenta|Tool
próximas formas|future shapes
Objeto selecionado|Selected object
alterações em prévia|preview changes
Trocar forma|Change shape
Propriedades|Properties
Editar forma criada|Edit created shape
Inserir formas|Insert shapes
Buscar formas|Search shapes
Formas|Shapes
Largura|Width
Altura|Height
Rotação (°)|Rotation (°)
Manter proporção|Lock aspect ratio
Usar tamanho fixo|Use fixed size
Arredondamento (%)|Corner radius (%)
Círculo|Circle
Elipse|Ellipse
Quadrado|Square
Retângulo|Rectangle
Retângulo arredondado|Rounded rectangle
Triângulo|Triangle
Triângulo equilátero|Equilateral triangle
Triângulo isósceles|Isosceles triangle
Triângulo retângulo|Right triangle
Losango|Rhombus
Paralelogramo|Parallelogram
Trapézio|Trapezoid
Polígono|Polygon
Estrela|Star
Seta|Arrow
Linha|Line
Arco|Arc
Espiral|Spiral
Quadriláteros|Quadrilaterals
Triângulos|Triangles
Polígonos|Polygons
Curvas|Curves
Reconhecer|Recognize
Organizar|Organize
Organizar e conectar|Arrange and connect
Inserir texto|Insert text
Inserir imagem|Insert image
Inserir espaço|Insert space
Elementos reutilizáveis|Reusable elements
Seleção avançada|Advanced selection
Mais|More
Mais ações da seleção|More selection actions
Copiar|Copy
Colar|Paste
Recortar|Cut
Colar na posição original|Paste in original position
Colar na posição do cursor|Paste at cursor
Copiar como PNG transparente|Copy as transparent PNG
Substituir imagem…|Replace image…
Ajustar à seleção|Fit selection
Selecionar tudo|Select all
Limpar seleção|Clear selection
Agrupar|Group
Desagrupar|Ungroup
Bloquear|Lock
Desbloquear|Unlock
Trazer para frente|Bring to front
Enviar para trás|Send to back
Excluir seleção|Delete selection
Editar pontos|Edit points
Comparar suavização|Compare smoothing
Formatar diagrama|Format diagram
Reconhecer seleção (formas)|Recognize selection (shapes)
Girar seleção · Shift encaixa em 15°|Rotate selection · Shift snaps to 15°
Redimensionar seleção|Resize selection
Mover seleção|Move selection
Nova página de escrita|New handwriting page
Salvar página atual|Save current page
Página, salvamento e recuperação|Page, saving and recovery
Nova camada|New layer
Renomear|Rename
Ocultar|Hide
Mostrar|Show
Selecionar camada acima|Select layer above
Selecionar camada abaixo|Select layer below
Selecionar camada ativa|Select active layer
Mostrar camadas|Show layers
Ocultar camadas|Hide layers
Desempenho observado|Observed performance
Copiar diagnóstico|Copy diagnostics
Limpar diagnóstico por etapa|Clear stage diagnostics
Atualizar leitura|Refresh measurements
Limpar medições|Clear measurements
Exportar SVG|Export SVG
Exportar PNG|Export PNG
Imprimir|Print
Copiar SVG|Copy SVG
Salvar cópia|Save copy
Recuperação|Recovery
Restaurar|Restore
Confirmar|Confirm
Concluir|Done
Fechar sem alterar|Close without changes
Prévia|Preview
Aplicar|Apply
Parcial|Partial
Objeto inteiro|Whole object
Modo|Mode
Área da borracha|Eraser area
Raio da borracha|Eraser radius
Apagar toda a tinta|Erase all ink
Encaixe de pontos|Point snapping
Tipos de âncora|Anchor types
Guias e formas|Guides and shapes
Página atual|Current page
Pasta de páginas|Pages folder
Ative Encaixe de pontos para usar esta opção.|Enable point snapping to use this option.
Ative Encaixe de pontos e Encaixar em outros objetos.|Enable point snapping and snapping to other objects.
Selecione pelo menos um traço de tinta.|Select at least one ink stroke.
Selecione um único contorno editável.|Select one editable outline.
Selecione pelo menos duas formas fechadas.|Select at least two closed shapes.
Selecione um único objeto com pontos editáveis.|Select one object with editable points.
Selecione um traço de tinta sem apagamentos parciais.|Select an ink stroke without partial erasures.
Confira os requisitos descritos nesta seção.|Check the requirements in this section.
Tecla já utilizada.|Key already in use.
Tecla já usada.|Key already in use.
Não foi possível concluir|Could not complete
tente novamente.|try again.
Desligar impede novas cópias automáticas, inclusive de traços longos. Mantém as cópias existentes, o salvamento da página após 5 s e a recuperação em caso de conflito. Uma gravação já iniciada pode terminar.|Turning this off prevents new automatic copies, including long-stroke backups. Existing copies, page saving after 5 seconds and conflict recovery are preserved. A write already in progress may finish.
Gestos desligados por padrão. Com Alt segurado: zigue-zague apaga objetos tocados; traço horizontal para a esquerda desfaz. Com Shift segurado: laço temporário. Se o gesto não for reconhecido, nada muda. Arraste o título de um painel para guardar sua posição.|Gestures are off by default. Hold Alt: zigzag erases touched objects; a horizontal stroke to the left undoes. Hold Shift for a temporary lasso. Unrecognized gestures make no changes. Drag a panel title to save its position.
O driver precisa expor o botão ao navegador; gestos do sistema podem interceptá-lo.|The driver must expose the button to the browser; system gestures may intercept it.
Imagens: mantenha a proporção ao arrastar; Shift libera largura/altura; Alt usa o centro. Imagens com recortes de borracha preservam a proporção.|Images keep their proportions while dragging; Shift unlocks width/height; Alt uses the center. Images with erased areas keep their proportions.
Ative gestos apenas se fizerem parte do seu fluxo. Os botões disponíveis dependem do driver da mesa.|Enable gestures only if you use them. Available buttons depend on your tablet driver.
Clique em um atalho e pressione a nova tecla. Espaço navega temporariamente. O modo foco mantém um botão visível para sair.|Click a shortcut and press its new key. Space temporarily pans. Focus mode keeps an exit button visible.
Desligue “Fechar traço na própria origem” para desenhar livremente sem perder o encaixe entre objetos.|Turn off “Close stroke at its start” to draw freely while keeping snapping between objects.
Alt suspende os encaixes durante o gesto. O encaixe nas guias funciona independentemente do encaixe nos pontos.|Alt temporarily disables snapping. Guide snapping works independently of point snapping.
Personalizar menu radial|Customize radial menu
Personalize as oito posições por contexto. Pincéis abrem cor e espessura; réguas têm submenu. Zoom fica abaixo da roda.|Customize eight positions per context. Brushes open color and width controls; rulers have a submenu. Zoom is below the wheel.
Segure a tecla do radial ou o botão secundário, aponte e solte. Zona central cancela; gestos muito curtos não ativam. Clique e zoom curvo continuam disponíveis.|Hold the radial key or secondary button, point and release. The center cancels; very short gestures do not activate. Clicking and curved zoom remain available.
Perfis de dispositivo|Device profiles
Troca manual: o navegador nem sempre identifica o modelo da mesa. A proteção reduz o filtro em traços pequenos para preservar detalhes e acentos.|Switch manually: the browser may not identify your tablet model. Protection reduces filtering on small strokes to preserve details and accents.
A rotação afeta somente a vista. As medidas dependem da escala configurada; não medem o tamanho físico da tela.|Rotation only affects the view. Measurements depend on the configured scale, not the physical screen size.
Desenhe aqui com pressão leve e forte. Esta área não é salva na nota. A calibração exige caneta com pressão real.|Draw here using light and firm pressure. This area is not saved in the note. Calibration requires a pressure-sensitive pen.
Aguardando amostras da caneta…|Waiting for pen samples…
Preparando imagens…|Preparing images…
Preparando imagem da seleção…|Preparing selection image…
Smart Ink — padrões para novas abas|Smart Ink — defaults for new tabs
Pasta das páginas|Pages folder
Clique na ferramenta ativa para escolher cores, espessura, pressão e suavização. Cada pincel guarda suas preferências automaticamente.|Click the active tool to choose color, width, pressure and smoothing. Each brush saves its preferences automatically.
Funciona offline. Formas: linha, círculo, elipse, retângulo, triângulo e seta, com seleção e confirmação. Não inclui OCR ou sugestões de objetos.|Works offline. Shapes include lines, circles, ellipses, rectangles, triangles and arrows, with selection and confirmation. Does not include OCR or object suggestions.
Editar desenho|Edit drawing
Arraste para reordenar ou use as setas ao lado do favorito.|Drag to reorder or use the arrows next to the favorite.
Abra ou crie uma página.|Open or create a page.
Exportar|Export
Ferramentas de desenho|Drawing tools
Caneta — toque novamente para cores e espessura|Pen — tap again for colors and width
Configurar caneta|Configure pen
Lápis — toque novamente para cores e espessura|Pencil — tap again for colors and width
Configurar lápis|Configure pencil
Marca-texto — toque novamente para cores e espessura|Highlighter — tap again for colors and width
Configurar marca-texto|Configure highlighter
Conector folha|Page connector
Cursor folha|Page selection
Laço folha|Page lasso
Borracha — toque novamente para opções|Eraser — tap again for options
Mover folha|Pan page
Reconhecer formas desenhadas em um ou vários traços|Recognize shapes drawn with one or more strokes
Réguas e guias|Rulers and guides
Diminuir zoom|Zoom out
Voltar a 100%|Reset to 100%
Aumentar zoom|Zoom in
Zoom de 10 a 800 por cento|Zoom from 10 to 800 percent
Desfazer (Ctrl+Z)|Undo (Ctrl+Z)
Refazer (Ctrl+Shift+Z)|Redo (Ctrl+Shift+Z)
Escolher uma forma e desenhar por arraste|Choose a shape and drag to draw
Inserir forma geométrica|Insert geometric shape
Inserir forma|Insert shape
Área de desenho. Espaço para navegar; Esc encerra a ação atual.|Drawing area. Space to pan; Esc ends the current action.
Ações contextuais do desenho|Contextual drawing actions
Sua página está pronta|Your page is ready
Escreva com a caneta ou escolha uma forma.|Write with the pen or choose a shape.
Espaço: navegar · Ctrl/Cmd+Z: desfazer · Esc: encerrar ação|Space: pan · Ctrl/Cmd+Z: undo · Esc: end action
Canvas infinito · Ctrl + roda: zoom · Espaço + arrastar: navegar · V: cursor|Infinite canvas · Ctrl + wheel: zoom · Space + drag: pan · V: select
Camadas do documento|Document layers
Paleta de cores|Color palette
 Arraste para ajustar; afaste verticalmente para maior precisão.| Drag to adjust; move vertically away for finer control.
Arraste para ajustar · Shift: passos maiores · Alt+Backspace no campo: restaurar valor inicial|Drag to adjust · Shift: larger steps · Alt+Backspace in the field: restore initial value
Aplicar o estilo caneta à seleção|Apply pen style to selection
Aplicar o estilo lápis à seleção|Apply pencil style to selection
Aplicar o estilo marca-texto à seleção|Apply highlighter style to selection
Ajustes de suavização e pressão só se aplicam a traços de tinta.|Smoothing and pressure settings apply only to ink strokes.
Prévia reversível · Aplicar registra uma única ação no histórico · Esc cancela.|Reversible preview · Apply creates one history entry · Esc cancels.
Navegue e desenhe para registrar quadros.|Pan and draw to record frames.
Relatório de desempenho sem conteúdo do desenho|Performance report without drawing content
Comparar a mesma amostra|Compare the same sample
Seu ajuste|Your settings
Contexto da amostra|Sample context
Opcional: modelo da mesa, sistema, driver e o que incomoda no traço|Optional: tablet model, system, driver and stroke issues
Aplicar ajuste à seleção|Apply settings to selection
Salvar cópia da amostra|Save a copy of the sample
Inserir|Insert
Texto|Text
Espaço entre anotações|Space between notes
Biblioteca de elementos|Asset library
Estrutura|Structure
Seleção e grupos|Selection and groups
Construir e editar…|Construct and edit…
Nome da camada|Layer name
Excluir camada…|Delete layer…
Mover seleção aqui|Move selection here
Ativa|Active
+ Nova camada|+ New layer
Quadriculado|Squared
Fichas|Flashcards
Pergunta e resposta|Question and answer
Objetos e links|Objects and links
Nota de destino|Target note
Pasta/Nota ou Nota#Seção|Folder/Note or Note#Section
Salvar link na seleção|Save link on selection
Abrir nota vinculada|Open linked note
Bloquear seleção|Lock selection
Desconectar extremidades|Disconnect endpoints
Rotação (graus)|Rotation (degrees)
Girar seleção|Rotate selection
Ferramentas rápidas|Quick tools
Fechar menu radial|Close radial menu
FERRAMENTAS|TOOLS
Controle rápido de zoom|Quick zoom control
Arraste para ajustar · setas ± zoom · Home 10% · End 800%|Drag to adjust · arrows ± zoom · Home 10% · End 800%
Zoom do canvas|Canvas zoom
Texto do objeto|Object text
Título, legenda ou explicação|Title, caption or explanation
Tamanho|Size
Alinhamento|Alignment
Esquerda|Left
Centro|Center
Direita|Right
Negrito|Bold
Aplicar texto|Apply text
Nome do elemento|Asset name
Salvar seleção como elemento|Save selection as asset
Pesquisar elementos|Search assets
Pesquisar nome ou categoria|Search name or category
Exportar coleção JSON|Export JSON collection
Importar coleção de elementos|Import asset collection
Comparar recuperação|Compare recovery copies
Nenhuma cópia disponível ainda.|No copies available yet.
Nome da região|Region name
Marcar área visível|Mark visible area
Marcar seleção|Mark selection
Minimapa: clique para navegar|Minimap: click to navigate
Preencher formas|Fill shapes
Remover preenchimento|Remove fill
Alinhar à esquerda|Align left
Alinhar à direita|Align right
Alinhar acima|Align top
Alinhar abaixo|Align bottom
Centralizar horizontalmente|Center horizontally
Centralizar verticalmente|Center vertically
Distribuir horizontalmente|Distribute horizontally
Distribuir verticalmente|Distribute vertically
Trazer à frente na camada|Bring to front within layer
Enviar ao fundo na camada|Send to back within layer
Opções dependentes do encaixe de pontos|Options dependent on point snapping
Conectores|Connectors
Caminho|Path
Reto|Straight
Curvo|Curved
Cotovelo|Elbow
Pontos intermediários|Intermediate points
Seta no início|Start arrow
Seta no fim|End arrow
Rótulo do conector|Connector label
Aplicar rótulo|Apply label
Adicionar ponto intermediário|Add intermediate point
Remover último ponto intermediário|Remove last intermediate point
Editar / reconectar extremidades|Edit / reconnect endpoints
Excluir camada|Delete layer
Manter objetos em outra camada|Keep objects in another layer
Excluir camada e objetos|Delete layer and objects
Imagem: recorte e opacidade|Image: crop and opacity
Esquerda (%)|Left (%)
Topo (%)|Top (%)
Largura (%)|Width (%)
Altura (%)|Height (%)
Opacidade (%)|Opacity (%)
Incluir pautas e modelo|Include ruling and template
Somente seleção|Selection only
Papel|Paper
A4 retrato|A4 portrait
A4 paisagem|A4 landscape
Carta|Letter
Margem (pixels a 96 dpi)|Margin (pixels at 96 dpi)
Salvar SVG|Save SVG
Imprimir / salvar como PDF|Print / save as PDF
Salvar PNG transparente (seleção ou página)|Save transparent PNG (selection or page)
Copiar PNG transparente|Copy transparent PNG
Comparar cópias visualmente|Visually compare copies
Criar ponto de recuperação agora|Create recovery point now
Réguas, guias e linha reta|Rulers, guides and straight line
Segurar para linha reta|Hold for a straight line
Meta / Cmd|Meta / Cmd
Personalizar tecla…|Customize key…
Encaixar nos alinhamentos|Snap to alignments
Adicionar régua rotacionável|Add rotatable ruler
+ Guia horizontal|+ Horizontal guide
+ Guia vertical|+ Vertical guide
Editar guias e delimitador|Edit guides and boundary
Remover todas as guias|Remove all guides
Adicionar área delimitadora|Add bounded area
Área de seleção|Selection area
Tocar no objeto|Touch object
Conter todo o objeto|Contain entire object
Filtrar tipo|Filter type
Todos|All
Cor do filtro|Filter color
Filtrar pela cor escolhida|Filter by chosen color
Limpar filtros|Clear filters
Isolar grupo selecionado|Isolate selected group
Sair do isolamento|Exit isolation
Operação|Operation
Substituir|Replace
Adicionar|Add
Subtrair|Subtract
Seleção poligonal|Polygon selection
Seleção retangular|Rectangle selection
Inverter seleção|Invert selection
Propriedades e geometria|Properties and geometry
Largura proporcional|Proportional width
Altura proporcional|Proportional height
Girar seleção (graus)|Rotate selection (degrees)
Aplicar propriedades|Apply properties
Manter restrição geométrica após editar|Keep geometric constraint after editing
Remover restrições da seleção|Remove selection constraints
Ajustar para quadrado|Fit to square
Ajustar para círculo|Fit to circle
Paralela à primeira linha|Parallel to first line
Perpendicular à primeira linha|Perpendicular to first line
Mesmo comprimento da primeira linha|Same length as first line
Ex.: Wacom · escrita pequena|E.g. Wacom · small handwriting
Histórico visual da sessão|Session visual history
Etapa|Step
Ir para esta etapa|Go to this step
Até 80 operações nesta sessão. Uma nova edição descarta o futuro.|Up to 80 operations in this session. A new edit discards future history.
Estilos de papel do vault|Vault paper styles
Nome do estilo|Style name
Salvar papel atual|Save current paper
Sincronizar estilo vinculado|Sync linked style
Desvincular|Unlink
Renomear camada|Rename layer
Ordem e conteúdo|Order and content
Subir camada|Move layer up
Descer camada|Move layer down
Mover seleção para esta camada|Move selection to this layer
Desbloquear objetos desta camada|Unlock objects in this layer
Selecionar objetos da camada|Select layer objects
Duplicar camada|Duplicate layer
Assistência de formas nesta camada|Shape assistance on this layer
Alternar visibilidade das camadas marcadas|Toggle marked layers visibility
Alternar bloqueio das camadas marcadas|Toggle marked layers lock
Ações da seleção|Selection actions
Voltar à visualização anterior|Return to previous view
Caderno e páginas · experimental|Notebook and pages · experimental
Nome do novo caderno|New notebook name
Criar caderno com esta página|Create notebook with this page
Pasta/Caderno.smartink-book.json|Folder/Notebook.smartink-book.json
Abrir pelo caminho|Open by path
Importar PDF · experimental|Import PDF · experimental
PDF do vault|Vault PDF
Primeira página|First page
Última página|Last page
Importar intervalo|Import range
Cancelar importação|Cancel import
Buscar forma|Search shapes
Buscar forma…|Search shapes…
Escolha uma forma e arraste no canvas.|Choose a shape and drag on the canvas.
Trapézio isósceles|Isosceles trapezoid
Trapézio retângulo|Right trapezoid
Deltoide|Kite
Quadrilátero livre|Free quadrilateral
Equilátero|Equilateral
Isósceles|Isosceles
Escaleno|Scalene
Acutângulo|Acute
Obtusângulo|Obtuse
Círculos, elipses e partes|Circles, ellipses and parts
Arco elíptico|Elliptical arc
Setor elíptico|Elliptical sector
Segmento elíptico|Elliptical segment
Polígonos regulares|Regular polygons
Pentágono|Pentagon
Hexágono|Hexagon
Heptágono|Heptagon
Octógono|Octagon
Polígono de n lados|N-sided polygon
Estrelas e formas derivadas|Stars and derived shapes
Estrela de n pontas|N-pointed star
Linhas e curvas|Lines and curves
Segmento de reta|Line segment
Curva de Bézier|Bézier curve
Nenhuma forma encontrada. Tente outro nome.|No shapes found. Try another name.
Dimensões e rotação|Dimensions and rotation
Geometria|Geometry
Editar tinta|Edit ink
Modelar trecho da curva|Reshape curve section
Raio da edição local|Local editing radius
Distância máxima para unir extremidades|Maximum endpoint joining distance
Transição suave na união|Smooth transition at join
Unir dois traços|Join two strokes
Ajustar escrita com prévia…|Adjust handwriting with preview…
Conferir números escritos…|Review handwritten numbers…
Ajustar escrita · sem OCR|Adjust handwriting · no OCR
Aproximar bases dos traços|Align stroke baselines
Uniformizar alturas suavemente|Gently normalize heights
Correção de inclinação (°)|Slant correction (°)
Intensidade|Strength
Aplicar ajuste|Apply adjustment
Construir e editar|Construct and edit
Combinar formas|Combine shapes
Unir áreas|Union areas
Selecione pelo menos duas formas fechadas na mesma camada.|Select at least two closed shapes on the same layer.
Subtrair da forma de trás|Subtract from the back shape
Manter interseção|Keep intersection
Excluir sobreposições|Exclude overlaps
Recortar e preencher|Trim and fill
Recortar entre interseções…|Trim between intersections…
Selecione o contorno e as linhas que o cruzam.|Select the outline and intersecting lines.
Tolerância de aberturas (unidades da página)|Gap tolerance (page units)
Preencher área fechada…|Fill enclosed area…
Selecione os contornos que delimitam a área.|Select the outlines bounding the area.
Curvas e nós|Curves and nodes
Editar nós Bézier…|Edit Bézier nodes…
Continuar traços pelas extremidades|Continue strokes from endpoints
Mostrar encaixe antes de tocar|Show snapping before contact
Repetição e relações|Repetition and relationships
Repetir com deslocamento e rotação…|Repeat with offset and rotation…
Manter linha tangente ao círculo|Keep line tangent to circle
Selecione uma linha reta e um círculo.|Select a straight line and a circle.
Paralelismo, igualdade e propriedades…|Parallelism, equality and properties…
Repetir seleção|Repeat selection
Quantidade de cópias|Number of copies
Deslocamento horizontal|Horizontal offset
Deslocamento vertical|Vertical offset
Rotação por cópia (°)|Rotation per copy (°)
Aplicar cópias|Apply copies
Editar nós Bézier|Edit Bézier nodes
Canto: alças independentes|Corner: independent handles
Suave: alças alinhadas|Smooth: aligned handles
Simétrico: alças iguais|Symmetric: equal handles
Inserir nó no próximo segmento|Insert node in next segment
Remover nó|Remove node
Abrir caminho neste nó|Open path at this node
Continuar editando no canvas|Continue editing on canvas
Localizar abertura|Find gap
Procurando extremidades abertas…|Looking for open endpoints…
Editar contornos e furos|Edit outlines and holes
Contorno|Outline
Editar no canvas|Edit on canvas
Objetos sob o cursor|Objects under cursor
Passe o cursor ou use Tab para realçar; clique ou pressione Enter para selecionar.|Hover or use Tab to highlight; click or press Enter to select.
Conferir números escritos|Review handwritten numbers
Sua escrita original|Your original handwriting
Número confirmado|Confirmed number
Prévia abaixo do original; sua tinta será mantida.|Preview below the original; your ink will be preserved.
Uma das sugestões por semelhança|One of the similarity suggestions
Os três candidatos destacados são alternativas, não certezas.|The three highlighted candidates are alternatives, not certainties.
Resultado|Result
Algarismos desenhados e editáveis|Drawn and editable digits
Texto digitado|Typed text
Manter original e inserir abaixo|Keep original and insert below
Aplicar número confirmado|Apply confirmed number
Manter somente o original|Keep only the original
Ensinar este exemplo com o algarismo escolhido|Teach this example with the chosen digit
Preferências de números|Number preferences
Oferecer ajuda após uma pausa na escrita|Offer help after a handwriting pause
Remover exemplos aprendidos|Remove learned examples
Configura as próximas formas. Fechar este painel mantém a ferramenta ativa.|Configures future shapes. Closing this panel keeps the tool active.
Ative Usar tamanho fixo para definir a dimensão|Enable Use fixed size to set dimensions
Parcial remove somente a região tocada, inclusive nas formas. Objeto remove o elemento inteiro.|Partial erases only the touched area, including shapes. Object erases the entire element.
escolha cor, espessura ou um estilo rápido. Visualize e aplique tudo de uma vez; a caneta atual não será modificada.|choose a color, width or quick style. Preview and apply everything at once; the current pen will not change.
Mede o trabalho JavaScript do canvas principal; não mede a latência física da caneta, composição da tela ou overlay ao escrever.|Measures JavaScript work on the main canvas, not physical pen latency, screen compositing or the writing overlay.
Os mesmos pontos aparecem em três versões. Nada muda na nota até aplicar. Use letras pequenas, acentos e curvas da sua mesa.|The same points appear in three versions. The note changes only after applying. Use small letters, accents and curves from your tablet.
Papel, encaixes, atalhos e outras preferências estão em •••. As camadas têm painel próprio no canto inferior direito.|Paper, snapping, shortcuts and other preferences are in •••. Layers have their own panel in the bottom-right corner.
A ordem abaixo vai do fundo para a frente. Camadas ocultas não são exportadas; bloqueadas não podem ser editadas.|The order below runs from back to front. Hidden layers are not exported; locked layers cannot be edited.
Altera apenas as referências do papel; preserva sua tinta. Cornell e perguntas/respostas se repetem por blocos de 900 × 1200 unidades.|Changes only paper references and preserves your ink. Cornell and question/answer layouts repeat in 900 × 1200 unit blocks.
Os elementos ficam nas preferências do plugin deste vault. Inserir cria objetos independentes e preserva conexões internas.|Assets are stored in this vault's plugin preferences. Inserting creates independent objects and preserves internal connections.
Escolha uma cópia para comparar na mesma escala e recuperar como nova página. O original é preservado.|Choose a copy to compare at the same scale and recover as a new page. The original is preserved.
Restaura as teclas de ferramentas, gestos temporários, linha reta e proporção. Mantém favoritos e pincéis.|Resets tool, temporary gesture, straight-line and proportion keys. Keeps favorites and brushes.
A impressão divide o desenho em páginas na escala de 96 unidades por polegada. No diálogo do sistema, selecione Salvar como PDF e desative cabeçalhos/rodapés.|Printing divides the drawing into pages at 96 units per inch. In the system dialog, choose Save as PDF and disable headers/footers.
Até três versões por página, em Smart Ink Backups. Abrir uma cópia não substitui o original. Durante traços longos, uma cópia de emergência pode ser criada a cada 5 segundos; alterações salvas têm cópias periódicas a cada 30 segundos. A página principal só é salva após 5 segundos sem edições, salvo comando manual ou fechamento.|Up to three versions per page in Smart Ink Backups. Opening a copy does not replace the original. During long strokes, an emergency copy may be created every 5 seconds; saved edits have periodic copies every 30 seconds. The main page is saved after 5 seconds without edits, or when saved manually or closed.
Segure a tecla durante o traço: direção em passos de 15°. Solte para retomar o traço livre. O transferidor mostra o ângulo; 0° aponta à direita e 90° para cima.|Hold the key during a stroke to constrain direction in 15° steps. Release for freehand drawing. The protractor shows the angle; 0° points right and 90° points up.
O delimitador restringe novos traços e suspende as sugestões automáticas de formas. Conteúdo existente e objetos movidos pelo cursor não são recortados. Guias e área ficam salvas nesta página.|The boundary constrains new strokes and suspends automatic shape suggestions. Existing content and objects moved with the cursor are not clipped. Guides and the area are saved in this page.
Alt + clique repetido alterna objetos sobrepostos. Agrupar preserva subgrupos; Desagrupar remove um nível.|Repeated Alt-click cycles overlapping objects. Grouping preserves subgroups; Ungroup removes one level.
A última dimensão editada define a escala, preservando proporções. A rotação é relativa ao estado atual.|The last edited dimension sets the scale while preserving proportions. Rotation is relative to the current state.
Restrições são opcionais e reversíveis. Linhas de referência precisam estar sem restrições; objetos bloqueados não são alterados.|Constraints are optional and reversible. Reference lines must be unconstrained; locked objects are not changed.
Estilos compartilhados neste vault. Páginas abertas sincronizam ao atualizar o estilo; outras, ao abrir. Alterações permitem Desfazer; objetos desenhados conservam suas cores.|Styles are shared within this vault. Open pages sync when the style updates; other pages sync when opened. Changes support Undo; drawn objects keep their colors.
Visibilidade e bloqueio podem ser alterados diretamente na lista. Todas as alterações podem ser desfeitas.|Visibility and locking can be changed directly in the list. All changes can be undone.
Cada página continua sendo um arquivo Smart Ink editável. O índice apenas organiza a ordem. Remover do caderno preserva o arquivo e permite desfazer.|Each page remains an editable Smart Ink file. The index only organizes their order. Removing a page from the notebook preserves its file and supports undo.
Importa até 10 páginas por operação, uma de cada vez, como fundo bloqueado. As anotações continuam vetoriais. O PDF original não é modificado. Máximo 50 MB; renderização limitada a 1600 px por lado.|Imports up to 10 pages per operation, one at a time, as locked backgrounds. Annotations remain vector-based. The original PDF is not modified. Maximum 50 MB; rendering is limited to 1600 px per side.
Medidas em unidades do canvas, independentes do zoom. Formas regulares preservam suas proporções. A prévia só é salva ao aplicar.|Measurements use canvas units, independent of zoom. Regular shapes keep their proportions. The preview is saved only when applied.
A união usa as extremidades mais próximas e o estilo do primeiro traço. Recortes de borracha não são unidos.|Joining uses the nearest endpoints and the first stroke's style. Erased portions are not joined.
Selecione uma linha ou poucas palavras. Este ajuste geométrico não reconhece letras; confira acentos e descendentes antes de aplicar.|Select a line or a few words. This geometric adjustment does not recognize letters; check accents and descenders before applying.
Na subtração, a forma de trás é a base. Os demais objetos retiram área dela. O resultado usa o estilo da base.|In subtraction, the back shape is the base. Other objects remove area from it. The result uses the base style.
Clique no trecho a remover ou dentro da área a preencher. Você poderá cancelar a prévia. Curvas recortadas usam aproximação poligonal.|Click the section to remove or inside the area to fill. You can cancel the preview. Trimmed curves use a polygonal approximation.
Continuar usa o pincel, a pressão e a suavização do traço original. Alt inicia um traço separado.|Continuing uses the original stroke's brush, pressure and smoothing. Alt starts a separate stroke.
A rotação usa o centro da seleção original. Deslocamento e ângulo são acumulados a cada cópia; vínculos internos são preservados.|Rotation uses the original selection center. Offset and angle accumulate with each copy; internal links are preserved.
Arraste os nós brancos e as alças amarelas no canvas. Escolha abaixo o nó para operações exatas. Esc encerra a edição.|Drag white nodes and yellow handles on the canvas. Choose a node below for precise operations. Esc ends editing.
Duplo clique num segmento insere um nó. Shift + clique seleciona vários nós. Arraste a curva entre os nós para modelá-la diretamente.|Double-click a segment to insert a node. Shift-click selects multiple nodes. Drag the curve between nodes to reshape it directly.
Arraste um vértice do contorno realçado. Soltar abre uma prévia para validar a nova região. Furos continuam transparentes. Até 256 vértices por contorno para edição direta.|Drag a vertex of the highlighted outline. Releasing opens a preview to validate the new region. Holes remain transparent. Direct editing supports up to 256 vertices per outline.
Sugestões geométricas experimentais, não OCR treinado. Confira cada algarismo; o original só muda se você aplicar.|Experimental geometric suggestions, not trained OCR. Review each digit; the original changes only when applied.
Quadrados, círculos e polígonos regulares preservam suas proporções. O arredondamento é relativo ao menor lado.|Squares, circles and regular polygons keep their proportions. Corner radius is relative to the shorter side.
Escrevendo|Writing
traço ainda em andamento|stroke still in progress
Ação de remoção|Removal action
Erro na exportação|Export error
Não foi possível salvar as preferências do pincel|Could not save brush preferences
Aceitar somente caneta|Accept pen input only
Desative se seu driver identificar a mesa como mouse. Toque não desenha neste protótipo.|Disable if your driver identifies the tablet as a mouse. Touch does not draw in this prototype.
Você queria um…?|Did you mean…?
Manter desenho|Keep drawing
Área de escrita|Writing area
Espaços iguais|Equal spacing
Início do traço|Stroke start
Extremidade|Endpoint
Canto|Corner
Ponto central|Midpoint
Ponto|Point
contorno externo|outer outline
atual|current
`
      .trim()
      .split('\n')
      .map((line) => line.split('|'))
  );
  const originals = new WeakMap(),
    attributes = new WeakMap();
  let locale = 'pt-BR';
  const language = (value, host = 'pt-BR') =>
    value === 'auto'
      ? String(host).toLowerCase().startsWith('pt')
        ? 'pt-BR'
        : 'en'
      : value === 'en'
        ? 'en'
        : 'pt-BR';
  const t = (source, params = {}, lang = locale) => {
    let result = String(source ?? '');
    if (lang === 'en') {
      if (en[result]) result = en[result];
      else if (
        /^“(.+)” contém (\d+) objeto(s?)\. Escolha o destino do conteúdo\. É possível desfazer\.$/.test(
          result
        )
      )
        result = result.replace(
          /^“(.+)” contém (\d+) objeto(s?)\. Escolha o destino do conteúdo\. É possível desfazer\.$/,
          (m, name, n) =>
            '“' +
            name +
            '” contains ' +
            n +
            ' object(s). Choose where to move the content. You can undo this.'
        );
      else if (/^\d+ objeto\(s\) selecionado\(s\)\./.test(result))
        result = result.replace(
          /^(\d+) objeto\(s\) selecionado\(s\)\. Operações mostram uma prévia antes de aplicar\.$/,
          '$1 object(s) selected. Operations show a preview before applying.'
        );
      else if (/^Parte \d+$/.test(result)) result = result.replace('Parte', 'Part');
      else if (/^\d+ nós$/.test(result)) result = result.replace('nós', 'nodes');
      else if (/^Escolher algarismo \d$/.test(result))
        result = result.replace('Escolher algarismo', 'Choose digit');
      else if (/^Etapa \d+( \(atual\))?$/.test(result))
        result = result.replace('Etapa', 'Step').replace('(atual)', '(current)');
      else if (/^\d+ (objeto\(s\)|objetos|cópia\(s\)|objetos novos)$/.test(result))
        result = result
          .replace('objeto(s)', 'object(s)')
          .replace('objetos novos', 'new objects')
          .replace('objetos', 'objects')
          .replace('cópia(s)', 'copy/copies');
      else if (/^Nó selecionado \(1–\d+\)$/.test(result))
        result = result.replace('Nó selecionado', 'Selected node');
      else if (result.includes(' · '))
        result = result
          .split(' · ')
          .map((x) => t(x, {}, lang))
          .join(' · ');
      else if (result.includes(': '))
        result = result
          .split(': ')
          .map((x) => t(x, {}, lang))
          .join(': ');
      else if (/^Posição \d+$/.test(result)) result = result.replace('Posição', 'Position');
      else if (/^Espessura [\d.]+ pixels$/.test(result))
        result = result.replace('Espessura', 'Width');
      else if (/^Restaurar (.+) ao valor de abertura$/.test(result))
        result =
          'Reset ' +
          t(result.match(/^Restaurar (.+) ao valor de abertura$/)[1], {}, lang) +
          ' to the opening value';
      else if (/ #[\da-f]{6}$/i.test(result)) {
        const i = result.lastIndexOf(' #');
        result = t(result.slice(0, i), {}, lang) + result.slice(i);
      }
    }
    return result.replace(/\{(\w+)\}/g, (m, k) => params[k] ?? m);
  };
  const source = (node) => {
    const value = originals.get(node);
    return value && node.nodeValue === value.translated ? value.source : node.nodeValue || '';
  };
  const canonical = (node) =>
    node?.childNodes
      ? Array.from(node.childNodes)
          .map((n) => (n.nodeType === 3 ? source(n) : canonical(n)))
          .join('')
      : node?.textContent || '';
  const localize = (root, lang = locale) => {
    if (!root?.ownerDocument?.createTreeWalker) return;
    const doc = root.ownerDocument,
      walker = doc.createTreeWalker(root, 4);
    let n;
    while ((n = walker.nextNode())) {
      if (
        n.parentElement?.closest(
          'input,textarea,svg,.si-layer-name,.si-title,[contenteditable="true"],[data-si-user-text]'
        )
      )
        continue;
      const raw = source(n),
        translated = t(raw, {}, lang);
      originals.set(n, { source: raw, translated });
      if (n.nodeValue !== translated) n.nodeValue = translated;
    }
    for (const el of [
      root,
      ...(root.querySelectorAll?.('[title],[aria-label],[placeholder]') || [])
    ]) {
      if (el.closest?.('[data-si-user-text],.si-layer-name,.si-title')) continue;
      let values = attributes.get(el);
      if (!values) {
        values = {};
        attributes.set(el, values);
      }
      for (const key of ['title', 'aria-label', 'placeholder']) {
        const raw = el.getAttribute?.(key);
        if (raw === null || raw === undefined) continue;
        const old = values[key],
          original = old && raw === old.translated ? old.source : raw,
          translated = t(original, {}, lang);
        values[key] = { source: original, translated };
        if (raw !== translated) el.setAttribute(key, translated);
      }
    }
  };
  const attribute = (el, key) => {
    const raw = el.getAttribute?.(key),
      old = attributes.get(el)?.[key];
    return old && raw === old.translated ? old.source : raw;
  };
  return {
    t,
    language,
    canonical,
    attribute,
    en,
    localize,
    get locale() {
      return locale;
    },
    set locale(value) {
      locale = value === 'en' ? 'en' : 'pt-BR';
    }
  };
})();
