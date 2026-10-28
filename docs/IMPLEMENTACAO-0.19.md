# Smart Ink 0.19.0

## Uso

| Ação | Controle |
| --- | --- |
| Copiar/colar seleção | Ctrl/Cmd+C e Ctrl/Cmd+V com o canvas em foco; botão Copiar na barra |
| Inserir arquivo de imagem | Arraste PNG, JPEG ou WebP até a posição marcada no canvas |
| Redimensionar imagem proporcionalmente | Arraste uma alça |
| Redimensionar imagem livremente | Shift + arraste; eixos locais preservados em imagens giradas |
| Redimensionar pelo centro | Alt + arraste; combina com Shift |
| Enquadrar seleção | Botão Enquadrar ou Shift+2 |
| Voltar à vista anterior | Mais → Voltar à visualização anterior |
| Voltar à última caneta | Botão Escrever ou W, configurável em Atalhos e favoritos |
| Ajustar proteção de arrasto | Interface e gestos → Movimento mínimo para arrastar seleção |
| Confirmar estilo em prévia | Aplicar à seleção ou Ctrl/Cmd+Enter dentro do painel |
| Cancelar | Esc, um nível de cada vez |

W é o padrão somente quando disponível. Configurações antigas que já usam W recebem outra tecla livre entre N, U e J; se todas estiverem ocupadas, use o botão e configure uma tecla. O preset da caneta mantém cor e espessura.

A barra contextual apresenta Recortar para uma imagem, Fonte e texto para texto, Cor e espessura para tinta e Estilo/Parâmetros para formas compatíveis. Mais conserva as ações avançadas. Ela continua flutuante, sem reduzir o canvas. Alças de caneta têm 13 px; tolerância de seleção 14 px, independente do zoom. O limiar de arrasto começa em 5 px e aceita 0–20 px.

## Área de transferência e imagens

Seleções usam um formato Smart Ink identificado na área de transferência, com fallback em texto. Pode aparecer como JSON se colado em outro aplicativo; o recurso é para transferência entre páginas Smart Ink. Campos de texto não são interceptados. Os objetos colados entram na camada ativa visível/desbloqueada, centralizados na visualização atual, com IDs e grupos novos. Conexões e regras entre objetos do lote são remapeadas; vínculos geométricos com objetos não copiados são removidos. Links de notas permanecem como estavam. Camadas de origem não são recriadas.

A importação por arraste usa a mesma validação da colagem: PNG/JPEG/WebP, até 8 imagens, 8 MB por arquivo, 16 MB no lote, 40 milhões de pixels por imagem e redução conforme o lado máximo configurado. Não baixa imagens de URLs. A posição de soltura é capturada antes da leitura. Trocar de página ou bloquear/remover a camada impede a inserção.

Imagens com apagamentos parciais (máscaras da borracha) mantêm a proporção mesmo com Shift, para preservar a máscara. Recorte normal da imagem continua compatível com ajuste livre. Transformações são validadas ao concluir. Copiar e colar não muda o esquema 9.

## Cancelamento, prévias e feedback

Esc cancela o gesto ativo sem desfazer trabalhos anteriores; depois descarta uma sugestão pendente, fecha o painel, fecha o radial, encerra a edição de pontos/recorte e limpa a seleção em passos separados. O modo foco só sai depois desses passos. Um traço ainda em andamento é descartado; o apagamento em andamento é restaurado.

A prévia de estilo já existente foi preservada e reforçada: cor e espessura não alteram o documento até Aplicar, cancelar restaura o original, confirmar registra uma operação e a caneta não é alterada. A confirmação também verifica a sessão para evitar aplicar a prévia em outra página.

Mensagens discretas aparecem dentro do canvas para cópia, colagem, duplicação, exclusão, estilo, enquadramento e retorno à escrita. Desfazer só atua diretamente se aquela ainda for a última revisão da mesma página; caso contrário, orienta usar o histórico. Erros de arquivo continuam explícitos.

## Verificação

Treze suítes automatizadas passaram (docs/checkpoints/verify-0.19.0.log). Os novos testes cobrem transferência entre sessões, IDs/grupos/estilos, desfazer/refazer, enquadrar/voltar, movimentos abaixo do limiar, ajuste livre de imagem girada pelo centro, cancelamento em etapas, descarte do traço em andamento, prévia de estilo, retorno ao pincel e posição de soltura.

O teste opcional Chromium inclui comparação de layout, eventos de clipboard e ordem de captura de Esc. Não foi executado nesta versão: o ambiente continua sem Chromium instalado. Testes headless usam DOM e entrada simulados; falta validar aparência, clipboard nativo, temas e mesa digitalizadora no Obsidian real.

## Atualização

Desative o plugin, substitua os quatro arquivos do pacote em .obsidian/plugins/smart-ink e reative. Preserve data.json e os documentos .smartink.
