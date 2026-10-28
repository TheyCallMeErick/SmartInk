# Smart Ink 0.15.0 — formas e edição da tinta

Base: código 0.14.0. Esta entrega adiciona ferramentas funcionais; não representa uma certificação de produção. O motor de suavização e a política de autosave de 5 segundos foram preservados.

## Reconhecimento com miniaturas

Com **Reconhecer** ativo, desenhe uma forma em um ou vários traços. Quando houver candidatos, aparece perto do desenho o popover **Você queria um…?**, com imagens vetoriais e nomes. Clique numa imagem para comparar a prévia e em **Aplicar forma** para confirmar. **Manter desenho**, Esc ou fechar preserva a tinta. Enter com foco no canvas aplica a prévia atual. A sugestão não ocupa mais a faixa superior quando há uma correspondência.

O popover respeita os limites da área visível, não captura foco automaticamente e acompanha zoom/pan. O algoritmo tolera pequenas aberturas e irregularidades maiores, oferece quadrado separadamente do retângulo e inclui quadriláteros livres. Continua heurístico e local. Não transforma escrita normal quando a assistência está desligada; não garante distinguir todas as letras e símbolos quando o reconhecimento está habilitado.

## Inserir formas diretamente

O novo botão **Inserir forma**, ao lado de Reconhecer, abre uma biblioteca com busca, 30 opções e parâmetros. Selecione uma opção, ajuste os parâmetros, pressione **Desenhar por arraste** e arraste no canvas. Shift restringe proporções; Alt usa o centro como origem. Cursor permite selecionar, mover, girar e redimensionar. A seleção oferece **Parâmetros da forma** e **Editar pontos**.

| Família | Opções |
| --- | --- |
| Quadriláteros | Retângulo, quadrado, paralelogramo, losango, trapézio isósceles, trapézio retângulo, deltoide e quadrilátero livre |
| Triângulos | Equilátero, isósceles, escaleno, retângulo, acutângulo e obtusângulo |
| Círculos, elipses e partes | Círculo, elipse, arco elíptico, setor elíptico e segmento elíptico |
| Polígonos regulares | Pentágono, hexágono, heptágono, octógono e polígono de n lados |
| Estrelas e formas derivadas | Estrela de n pontas e retângulo arredondado |
| Linhas e curvas | Segmento de reta, seta, curva de Bézier e espiral |

As classes dos triângulos se sobrepõem matematicamente: a classificação por lados não é uma partição junto à classificação por ângulos. Os modelos equilátero, escaleno, acutângulo e obtusângulo mantêm proporções que respeitam o nome. Editar seus vértices permite uma forma livre, removendo o vínculo paramétrico. Polígonos regulares têm lados iguais mesmo ao arrastar uma caixa não quadrada.

Parâmetros: 3–32 lados; 3–16 pontas e proporção de raios; abertura de arco e ângulo inicial; deslocamento de paralelogramos/trapézios; raio relativo de arredondamento; 0,25–5 voltas da espiral. Os parâmetros continuam editáveis depois de mover, girar e escalar. O limite é explícito: **não se trata de todas as formas matemáticas possíveis**, nem há cônicas gerais, furos/aneis ou operações booleanas novas nesta versão. Vértices editáveis cobrem outras variações dentro dos limites.

Arcos, setores, segmentos e cantos arredondados usam aproximação poligonal; espirais são amostradas a 64 intervalos por volta. Bézier usa os controles do modelo existente e renderização amostrada. Não prometemos a precisão analítica de um editor CAD.

## Edição de traços e escrita

Selecione tinta e abra **Editar tinta**:

- **Unir dois traços:** escolhe as extremidades mais próximas, cria um caminho único e permite transição curva ou reta. Prévia, confirmar/cancelar e uma operação de undo. Mantém amostras, pressão e inclinação originais fora da transição; normaliza a ordem temporal e conserva intervalos internos. O estilo final é o do primeiro traço. Exige a mesma camada, até a distância máxima configurada e ausência de recortes de borracha. Não é uma união booleana de áreas preenchidas.
- **Modelar trecho da curva:** arraste qualquer ponto próximo do traço para deslocar suavemente a vizinhança, conforme o raio configurado. Partes distantes e pressão/inclinação são preservadas. Limite de 20 mil pontos por traço; recortes de borracha não são editados por essa ferramenta. Bézier criado diretamente continua editável pelos seus dois controles via Editar pontos. A ferramenta de modelagem não converte automaticamente uma palavra em Bézier.
- **Ajustar escrita:** prévia opcional para aproximar bases, uniformizar alturas moderadamente e corrigir inclinação, com intensidade. É uma heurística geométrica **experimental**, sem OCR, segmentação semântica de letras ou garantia de embelezamento. Recomenda-se selecionar uma linha curta; descendentes, acentos e símbolos precisam ser conferidos. Não se aplica automaticamente durante a escrita.

## Diagramas e pincel

**Interpretar diagrama**, na seleção, tenta converter formas fechadas e ligações selecionadas, associando as extremidades aos pontos de ancoragem próximos. Ao mover as formas, as ligações acompanham. Mostra prévia e confirmação antes de alterar os objetos. Limite de 150 traços por operação e alcance de ligação de 24 pixels no zoom atual. Esta primeira implementação reconhece cada objeto do diagrama a partir de um traço; o reconhecimento de uma única forma com vários traços continua disponível pelo popover, mas o agrupamento automático de todos esses traços em um diagrama complexo não foi implementado.

Com o pincel ativo, **segure D e arraste**: horizontal altera espessura; vertical altera opacidade. Soltar confirma e salva a preferência; Esc durante o gesto cancela. Nenhuma tinta é criada. A tecla é personalizável em Atalhos e favoritos. O raio do pincel e o texto de estado dão retorno visual.

## Páginas/PDF

Ao abrir um caderno, uma barra inferior oferece anterior/próxima, índice de páginas, ajuste à página e abertura do PDF original. **Alt+PageUp / Alt+PageDown** navegam com foco no canvas. Salva antes de navegar e bloqueia a troca se há erro de salvamento. Páginas importadas abrem enquadradas na área nominal.

A impressão do caderno agora especifica o tamanho individual de cada página, incluindo orientação, em vez de forçar A4. O diálogo e o driver ainda podem substituir essas dimensões. O importador continua rasterizando o fundo, com a tinta separada e editável. PDF/cadernos permanecem experimentais: importação e impressão reais no Obsidian não foram validadas nesta sessão.

## Arquitetura e referências

Novos módulos: `shape-kit.js` (geometria e operações puras), `shapes-and-ink.js` (interação/UI) e `page-navigation.js`. Esquema 8 preservado com campos opcionais validados `shapeKind`, `shapeOptions`, `shapeFrame`; a geometria principal continua compatível com a 0.14. Sem dependências de runtime novas e sem código do Inkscape incorporado.

Referências de interação: [tutorial oficial de formas do Inkscape](https://inkscape.org/cs/doc/tutorials/shapes/tutorial-shapes.pt_BR.html), [operações de nós](https://inkscape-manuals.readthedocs.io/en/1.1/node-operations.html) e [tutorial avançado](https://inkscape.org/pt/doc/advanced/tutorial-advanced.pt_BR.html). A referência é criação por arraste, parâmetros de famílias e edição/união explícita de caminhos; não uma reprodução completa do Inkscape.
