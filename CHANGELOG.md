## 0.27.0 — qualidade de vida e internacionalização

- Catálogo completo dos controles de configuração gerado em ambiente isolado, sem depender das categorias já visitadas. Sinônimos de espessura e pesquisa bilíngue.
- Desfazer ajustes de pincel, restauração de atalhos e operações em favoritos, com comparação do estado atual para evitar sobrescrever alterações posteriores. Histórico do desenho independente.
- Comparação antes/depois da mesma amostra de tinta; amostras persistem por vista/página ao sair para calibrar e voltar. Limpar renova a referência.
- Favoritos: renomear, substituir pelo pincel atual, reordenar por arraste ou setas e remover, com recuperação.
- Ajuda ilustrada para suavização, estabilização e pressão. Campos modificados desde a abertura são marcados e podem ser restaurados individualmente.
- Alvos de alças ampliados para caneta com escolha da mais próxima; tamanho visual mantido. Cursor e dica distinguem giro, escala e movimento.
- Painéis/popovers procuram reduzir sobreposição com a seleção ou o último ponto escrito; posição fica estável durante a interação e limitada à vista.
- Avisos informativos repetidos são agrupados e adiados durante traços. Erros via Notice continuam imediatos.
- Internacionalização pt-BR/en/auto com mais de 800 mensagens, atributos acessíveis, textos canônicos para ações, isolamento do conteúdo do usuário, parâmetros e fallback em português.
- 23 suítes headless; idioma testado com nós de texto, retorno pt/en, parâmetros, fallback e preservação de conteúdo. Validação real de Obsidian/mesa continua pendente; não é uma declaração de estabilidade 1.0.

## 0.26.0 — descoberta, prévia e clareza de interação

- Cards de perfis de suavização acima dos ajustes avançados, com amostra visual, estado ativo, Personalizado e Valores variados. Aplicar um perfil atualiza sliders e valores exibidos.
- Teste de caneta no painel com pressão, limpeza e atualização da amostra ao ajustar o pincel. Limites de 24 traços e 2.048 pontos por traço; desenho e histórico não são modificados.
- Busca sem distinção de acentos na central: categorias, termos frequentes e campos das categorias visitadas; seleção do resultado revela o controle.
- Memória da última categoria no vault, rolagem/seções abertas por vista, botão de retorno dos painéis secundários e estado expandido do botão de abertura corrigido.
- Alcance explícito das alterações; salvamento de preferências informa Salvando, Salvo ou erro conforme a gravação real, sem substituir as confirmações das prévias.
- Restauração por grupos de suavização, pressão e atalhos. Restauração de pressão na seleção também respeita a faixa calibrada, com prévia e desfazer.
- Densidade compacta/confortável reutiliza a preferência existente de controles maiores. Gestos e botões avançados agrupados em seção expansível.
- Motivos contextuais para ações indisponíveis, com explicação visível nos painéis e acessível por descrição.
- Nova regressão automatizada para os fluxos acima. Validação visual em Obsidian e com mesa real permanece pendente.

## 0.25.0 — perfis em cards e central de configurações

- Perfis de caneta e presets prontos usam cards compactos com ícones SVG decorativos e nomes acessíveis; ações originais preservadas.
- O menu Documento e configurações abre modal com oito categorias laterais. Formulários originais são reutilizados, inclusive os painéis secundários, sem migração de dados.
- Modal limitado à área útil da vista, navegação compacta em espaços estreitos, rolagem independente, Tab contido e restauração de foco ao fechar. Controles atrás do modal ficam inertes.
- Campos e botões usam tokens do tema; estados inválidos e controles especiais (cores, ranges, checks) preservados.
- Regressão de cards, troca de categorias, persistência de campos, foco e limites de tamanho. Validação visual em Obsidian real continua pendente.

## 0.24.1 — auditoria de botões

- Corrige a extensão de opções de imagem: não tenta adicionar controles quando nenhuma imagem está selecionada, nem insere o botão em outro painel aberto.
- Auditoria reproduzível: 51 telas/estados, 456 ocorrências de botões com eventos associados, incluindo 16 controles de captura de atalhos pelo teclado.
- 19 suítes headless aprovadas; build, sintaxe e versões validados.

## 0.24.0 — revisão ampla de interação e acessibilidade

- Propriedades acompanham seleção sem prévia pendente; prévias oferecem aplicar, descartar ou continuar antes de editar no canvas.
- Trava de proporção, campos numéricos com validação contextual, teclado, restauração e ajuste por arraste do rótulo.
- Busca/rolagem da galeria lembradas durante a sessão; contexto explícito entre ferramenta e objeto.
- Valores diferentes de cor, espessura e opacidade informados na seleção múltipla.
- Ações destrutivas e atalhos diferenciados, controles de caneta maiores, foco visível e modos de movimento reduzido/cores forçadas.
- Barra contextual acomoda o inspetor em painéis largos; dica inicial, feedback de preparação e prevenção de repetição de ações assíncronas.
- 18 suítes headless aprovadas. Testes visuais reais pendentes: download do Chromium falhou.

## 0.23.0 — botões e propriedades de formas

- Ações de menu com largura uniforme, ícones antes do texto, alinhamento consistente e destaque reservado a confirmações.
- Galeria por famílias, miniaturas e busca, sem botão intermediário: escolher a forma já ativa o desenho.
- Painel lateral flutuante de propriedades que pode ser fechado; tamanho fixo opcional para novas formas.
- Dimensões, rotação e parâmetros de formas existentes com prévia, cancelar/aplicar e desfazer.
- Arredondamento relativo disponível em retângulos e quadrados; metadados preservados ao reconstruir a geometria.
- 17 suítes automatizadas aprovadas. Validação visual no Obsidian real pendente.

## 0.22.0 — refinamento de UX

- Navegação comum entre Interface, Atalhos e pincéis, Menu radial e Precisão.
- Papel, espaçamento e grade reunidos; backups em Arquivo e segurança.
- Limites de painéis calculados pela interseção do painel Obsidian com a janela/viewport visual; atualização ao redimensionar, rolar ou arrastar.
- Painel aberto preservado ao redimensionar; posições antigas fora da área são corrigidas.
- Camadas com limites próprios, títulos/ações mais acessíveis, formulários com quebra de linha e estado expandido corrigido.
- 16 suítes headless aprovadas. Verificação visual não executada: Chromium ausente.

# 0.21.0 — transformações, edição direta e fluidez visual

- Prévia leve também para rotação e escala uniforme de seleções com 32 ou mais objetos.
- Reutilização de pixels dos trechos parados, com ordem de composição preservada e limite de memória.
- Reaproveitamento de caminhos e contornos na confirmação; histórico com blocos imutáveis compartilhados e IDs alterados.
- Autopan nas bordas durante movimento, seleção retangular e laço.
- Setas ajustam a seleção em passos de 1 unidade; Shift usa 10; a sequência termina em um desfazer.
- Colagem na posição original ou do cursor; substituição de imagem mantendo posição, tamanho, rotação e opacidade.
- Copiar seleção como PNG transparente, limitado a 4096 px no maior lado.
- Diagnóstico copiável por etapa, sem conteúdo do desenho.
- Ícones com rótulos preservados; transições curtas e respeito a prefers-reduced-motion.
- Quinze suítes headless aprovadas. Teste visual ampliado e CI incluído; Chromium ausente neste ambiente.

# 0.20.0 — desempenho ao mover seleções grandes

- Arrastes com 32 ou mais objetos usam uma prévia por translação, sem recriar todos os pontos a cada evento.
- Eventos de ponteiro são agrupados em uma atualização por quadro; o último evento é aplicado mesmo ao soltar antes do próximo quadro.
- Reutilização dos caminhos Path2D e limites dos objetos, preservando ordem de camadas e objetos que entram no campo de visão.
- Conectores acompanham os alvos durante o arraste. Coordenadas definitivas são materializadas uma vez ao concluir.
- Um único desfazer, cancelamento sem alteração do documento e proteção contra edições concorrentes.
- Quatorze suítes automatizadas aprovadas; medição sintética de JavaScript, sem validação de GPU ou hardware real.

# 0.19.0 — fluxo de seleção e escrita

- Copiar/colar traços, formas, textos e imagens entre páginas, com estilos, grupos e conexões internas preservados.
- Arrastar arquivos de imagem para a posição desejada, com indicação de inserção.
- Redimensionar imagens mantendo proporção; Shift libera os eixos e Alt usa o centro, incluindo imagens giradas.
- Alças maiores e tolerância em pixels para caneta, destaque de objeto e limiar ajustável para iniciar arrasto.
- Barra contextual conforme o tipo selecionado; retorno à caneta, enquadrar seleção e voltar à vista anterior.
- Mensagens discretas com Desfazer; Esc cancela apenas um nível por vez.
- Prévia de estilo reversível reforçada com confirmação por teclado e proteção de sessão.
- Treze suítes headless aprovadas. Validação visual e hardware continuam pendentes.

# 0.18.0 — seleção flutuante e imagens

- Barra contextual centralizada sobre o canvas, sem ocupar espaço no layout, também nas disposições laterais e no modo foco.
- Ações adicionais de tinta, formas e vetores no popover Mais ações da seleção.
- Destaque consistente para aplicar/confirmar/concluir, foco visível e cancelamento secundário.
- Rodapé de confirmação nas prévias, com Ctrl/Cmd+Enter e retorno do foco ao desenho.
- Colagem local de PNG/JPEG/WebP com Ctrl+V/Cmd+V, seleção imediata e lote com um desfazer.
- Doze suítes automatizadas. Teste visual ampliado, mas não executado por falta de Chromium. Obsidian real e mesa digitalizadora ainda precisam de validação.

# 0.17.0 — edição direta e números

- Assistência geométrica local para algarismos: candidatos, confirmação, resultado vetorial/texto, original mantido por padrão e exemplos pessoais opcionais.
- Prévia vermelha de recorte, diagnóstico de frestas e ponte com confirmação.
- Arraste de segmentos, inserção por duplo clique, seleção de nós e edição de contornos/furos.
- Parâmetros para primitivas reconhecidas, alças de dimensão/raio/arredondamento.
- Seletor visual para objetos sobrepostos; retorno consistente de ferramentas temporárias.
- Rótulos/estabilidade de encaixe e histórico descritivo com realce.
- Worker cancelável para geometria, guardas de revisão e limites de execução.
- Onze suítes automatizadas; sem validação real de Obsidian/hardware ou acurácia de números.

# 0.16.0 — construção e edição vetorial

- Painel contextual com grupos recolhíveis, controles rotulados, prévias canceláveis e uma ação no histórico.
- União, diferença, interseção e exclusão de sobreposições; regiões multipoligonais com furos reais.
- Recorte em interseções e preenchimento de regiões entre vários contornos com tolerância de pequenas aberturas.
- Caminhos Bézier persistentes: alças, nós de canto/suaves/simétricos, inserção exata, remoção e divisão.
- Tangência linha–círculo persistente, repetição com deslocamento e rotação e remapeamento de vínculos internos.
- Continuação opcional de tinta, prévia de encaixe em hover e QuickShape com escala/rotação contínuas.
- Esquema 9 com leitura de 1–8. Testes headless; validação física no Obsidian ainda pendente.

# Histórico de versões

## 0.15.0 — Biblioteca de formas e edição da tinta

- Popover contextual “Você queria um…?” com miniaturas vetoriais, seleção de alternativa e confirmação.
- Biblioteca com 30 opções em seis famílias, busca, criação por arraste e parâmetros editáveis após transformação.
- Reconhecimento com tolerância a pequenas aberturas, candidato quadrado e quadriláteros livres.
- União contínua de dois traços, modelagem local da curva e ajuste geométrico de escrita com prévia.
- Interpretação simples de diagramas, conexões vinculadas e gesto D+arraste para tamanho/opacidade.
- Navegação de páginas com salvamento e impressão com dimensões individuais.
- Nove suítes headless; tentativa de teste visual bloqueada pela instalação de Chromium. Limites em docs/IMPLEMENTACAO-0.15.md.

## 0.14.0 — Pauta, precisão e organização

- Espaçamento de pauta por documento, controle persistente de backups e esquema 8 com leitura/migração de 1–7.
- Polígonos QuickShape, confirmação explícita de correções, perfis de escrita e inclinação preservada.
- Novos encaixes opt-in, seleção poligonal e operações de seleção, radial direcional, conta-gotas, atalhos e sliders finos.
- Biblioteca de presets, duplicação e reordenação de camadas com histórico; miniaturas em cache e navegador simplificado.
- Cadernos e PDF isolados em módulo experimental. Limites e pendências em docs/IMPLEMENTACAO-0.14.md.
- Oito suítes headless, benchmark comparativo e documentação de atualização; sem validação física de latência.

## 0.13.1 — Redução de stutter ao começar a escrever

- Cópias emergenciais de recuperação deixam de ser disparadas no primeiro movimento de cada traço.
- Backup intermediário reservado a traços contínuos de pelo menos 5 segundos; executado durante ociosidade do navegador quando disponível.
- Cancelamento seguro de tarefas de backup ainda não iniciadas ao finalizar/cancelar a escrita.
- Teste de regressão simulando eventos da caneta. Salvamento por inatividade da 0.13.0 preservado.

## 0.13.0 — Qualidade de vida

- Paleta de estilos de seleção compartilhada com Caneta; estilos rápidos, cores, espessura e opacidade.
- Prévia reversível antes da aplicação; ação única no histórico; caneta não é alterada.
- Estilo de linha tracejada/pontilhada para seleção de formas.
- Salvamento de `.smartink` após cinco segundos de inatividade, evitando uma gravação a cada traço.
- Salvamento explícito ou ao fechar/descarregar o plugin descarrega imediatamente alterações pendentes.
- Status de gravação e testes de regressão de autosave/seleção.

## 0.12.0

- Menus reorganizados, encaixes independentes e zoom curvo no radial.
