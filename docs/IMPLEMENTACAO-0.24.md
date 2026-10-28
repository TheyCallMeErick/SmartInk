# Smart Ink 0.24.0 — revisão de UX

## Mudanças de uso

O inspetor de formas acompanha a seleção enquanto está aberto e não há prévia pendente. Com alterações, a interação de edição no canvas apresenta opções para aplicar, descartar ou continuar. Navegar com Espaço permanece possível. Alterar o documento por outra via continua protegido pelas verificações de sessão/revisão; fechar ou cancelar descarta a prévia.

Manter proporção vincula largura e altura, respeitando limites dos campos. O recurso aplica-se à edição da forma selecionada; formas matematicamente regulares continuam com restrições próprias. Os campos numéricos compartilhados rejeitam vazio/fora de limites com mensagem junto ao campo. Enter confirma, setas ajustam, Shift acelera, Alt+Backspace restaura o valor inicial. Esc em um campo inválido recupera o último valor válido antes de fechar o painel. Arrastar o rótulo prepara o valor e soltar confirma uma alteração; cancelar o gesto restaura.

A galeria guarda busca e rolagem na sessão. Os painéis diferenciam Ferramenta/próximas formas de Objeto/prévia. Estilo de seleção informa diferenças de cor, espessura e opacidade; apenas os ajustes explicitamente feitos entram no patch existente.

Ações de remoção têm destaque e separação; atalhos reconhecidos aparecem como teclas à direita. Botões assíncronos impedem acionamento repetido enquanto aguardam e anunciam ocupação. Mensagens iguais consecutivas são reduzidas; mensagens com foco/ponteiro permanecem até fechamento. Preparação de imagens tem feedback. Falhas de salvamento continuam seguindo as rotas de recuperação já existentes.

Controles de painéis ficam maiores quando a entrada é caneta. Foco visível, cores forçadas, movimento reduzido e indicação textual melhoram acessibilidade. A barra contextual reserva espaço para o inspetor em painéis largos. A dica de página vazia não captura cliques e some ao desenhar.

## Cobertura do escopo aprovado

| Área | Tratamento |
| --- | --- |
| Organização visual | Base 0.22/0.23 mantida; hierarquia de remoções, atalhos e contexto refinada |
| Canvas e painéis | Limites responsivos existentes mantidos; barra contextual evita inspetor em área larga |
| Seleção/manipulação | Alças e tolerância já existentes preservadas; propriedades seguem a seleção |
| Propriedades/campos | Proporção, validação, restauração, valores mistos, contexto e prévias |
| Caneta | Áreas maiores nos painéis; caminho de amostragem/suavização preservado |
| Formas | Galeria imediata existente; memória de busca/rolagem e melhor edição |
| Cores/estilos | Editor compartilhado preservado; aviso de valores diferentes |
| Teclado/foco | Esc de campo inválido, setas, Enter, restauração e proteção de composição IME |
| Feedback | Estado ocupado, bloqueio de repetição assíncrona e mensagens menos repetitivas |
| Prevenção de erros | Prévia pendente, validação antes de aplicar, guardas de revisão mantidas |
| Acessibilidade/temas | Foco, rótulos, estados, cores forçadas e movimento reduzido |
| Desempenho | Cache/RAF e autosave existentes preservados; ajustes de UI fora da amostragem da caneta |
| Primeiro uso | Dica contextual de página vazia, sem modal ou configuração adicional |
| Validação integrada | 18 suítes headless; validação visual e tablet real ainda pendentes |

## Limitações verificáveis

Não há certificação de acessibilidade nem garantia para todos os temas. Algumas mensagens de ação desabilitada são genéricas. O acompanhamento automático é do inspetor de formas, não de todos os diálogos de operações. Busca e rolagem são lembradas apenas enquanto a view permanece aberta. A proteção explícita de prévia cobre o inspetor de formas; os outros editores mantêm seus fluxos próprios de aplicar/cancelar. Não foi feita uma nova medição de FPS real.

Build reproduzível, sintaxe, manifesto e 18 suítes de regressão passaram. A tentativa de instalar Chromium recebeu um arquivo inválido/truncado; a validação visual real não pôde ser executada. Antes de tratar a revisão como encerrada, validar temas claro/escuro, janelas estreitas, zoom do aplicativo, mesa digitalizadora e documentos grandes no Obsidian.

Preserve data.json e desenhos na atualização. Substitua main.js, styles.css, manifest.json e avisos do plugin com o ZIP.
