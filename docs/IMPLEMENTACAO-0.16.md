# Smart Ink 0.16 — uso e limites

## Acesso e interação

Selecione objetos com o cursor e abra **Construir e editar** na seleção ou em **Organizar**. O painel agrupa Combinar formas, Recortar e preencher, Curvas e nós, Repetição e relações. As ações dependem da seleção; nenhuma nova ferramenta ocupa permanentemente a barra principal.

As operações complexas exibem prévia. **Aplicar** registra uma ação; **Cancelar**, fechar ou Esc descartam a prévia. Confirmar uma prévia de uma revisão antiga é recusado. Arrastar nós usa a interação direta existente: soltar confirma, Esc durante o arraste cancela, Desfazer restaura.

| Recurso | Como usar | Limite ou comportamento |
| --- | --- | --- |
| União, subtração, interseção, exclusão | Selecione formas fechadas na mesma camada | 2–32 formas, até 20 mil vértices de entrada; curvas amostradas. Na subtração, o primeiro objeto na ordem do documento, de trás para frente, é a base. |
| Recortar | Selecione contorno e objetos que o cruzam; clique no trecho | Até 900 segmentos nos delimitadores. Círculos e curvas viram caminhos poligonais; pressão da tinta é interpolada. Não recorta imagens, regiões compostas, setas ou objetos com borracha aplicada. |
| Preencher | Selecione contornos e clique dentro da área | Até 64 objetos / 800 segmentos originais; tolerância 0–20 unidades. Pequenas pontes fecham aberturas sem alterar a tinta. Área aberta é recusada. |
| Bézier | Selecione uma forma simples e abra Editar nós | Converter é explícito. Tinta torna-se linha de largura uniforme, amostrada em até 128 nós. Traços longos recortados com mais de 128 nós não habilitam edição de alças. |
| Nós | Arraste os brancos e as alças amarelas; painel escolhe nó por número | Canto: alças livres. Suave: alinhadas. Simétrico: alinhadas e iguais. Inserir divide uma cúbica sem mudar sua curva. Remover pode mudar a curva; há prévia. Dividir abre um caminho fechado ou separa um aberto em dois. |
| Tangência | Selecione uma linha reta e um círculo | Relação persistente, preserva comprimento/direção da linha. Não é um solver CAD geral e não inclui tangência entre duas elipses. Remova em Propriedades e geometria. |
| Repetição | Defina quantidade, X, Y e rotação | Até 100 cópias / 2 mil objetos novos. Ângulo e deslocamento acumulam a partir do original. Grupos e conexões internas recebem novos IDs. Vínculos externos são retirados. |
| Continuação | Ative em Curvas e nós ou Precisão; toque uma extremidade | Desativada por padrão. Mesmo estilo do original, pressão preservada, mesma camada editável. Alt inicia separado. Não atua com reconhecimento de formas, régua ou limite ativo. Até 20 mil pontos no original e 40 mil no resultado. |
| Hover | Aproxime caneta/mouse sem pressionar | Prévia de extremidades/cantos/pontos cardinais; verde para continuar, azul para snap. Respeita os tipos habilitados e o encaixe na escrita. Não é prévia de todos os tipos avançados de snap. |
| QuickShape | Segure após desenhar com reconhecimento ativo | Arraste para escala; Alt gira; Shift restringe proporção e rotação em 15°. Trocar entre escala e rotação conserva o tamanho. Soltar ainda pede confirmação da forma. |

Formas com furos conservam transparência na tela e no SVG, sem remendos brancos. Regiões compostas podem ser movidas, giradas, redimensionadas, preenchidas e submetidas a novas operações. Nesta versão seus anéis não têm editor individual de nós.

## Suavização e desempenho

O motor perfect-freehand e a estabilização adaptativa existentes continuam responsáveis pela escrita. O novo editor Bézier é uma operação posterior opcional; não substitui automaticamente manuscritos. Pressão e inclinação não são descartadas ao continuar ou recortar tinta.

Operações geométricas têm limites explícitos para conter custo. Preenchimento e booleans executam na thread de interface após uma ação explícita, não em worker. Se uma região for complexa, divida a seleção. O benchmark headless não mede latência de ponta, driver, GPU ou composição visual.

## Atualizar e voltar

1. Preserve uma cópia das páginas/vault para poder voltar à versão anterior.
2. Feche as páginas Smart Ink e desative o plugin no Obsidian.
3. Extraia o conteúdo da pasta `smart-ink` do ZIP sobre `.obsidian/plugins/smart-ink/`.
4. Preserve seu `data.json`; o ZIP não o contém.
5. Reative o plugin e teste inicialmente em uma cópia de página.

Documentos 1–8 são lidos e migrados em memória. Ao salvar pela 0.16, usam **esquema 9**, necessário para caminhos e regiões. A 0.15 não abre esquema 9, mesmo que uma página não tenha usado as ferramentas novas. Para voltar, restaure o plugin anterior e as cópias anteriores dos documentos. Exportar SVG preserva a aparência, mas não substitui o arquivo editável para rollback.

## Validação ainda necessária

Testar no Obsidian Desktop com sua mesa: hover suportado pelo driver, pressão, botão de borracha, perda de captura, zoom/rotação, menus em janela estreita, temas claro/escuro, gravação/reabertura e páginas extensas. Não foi feita validação visual real nem teste físico de hardware nesta entrega.
