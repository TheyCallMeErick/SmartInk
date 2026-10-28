# Smart Ink para Obsidian

Plugin de escrita à mão com mesa digitalizadora para **Obsidian Desktop**, incluindo pincéis, formas, réguas, encaixes (snaps), camadas, zoom radial, seleção com paleta compartilhada, salvamento automático por inatividade, suavização e incorporação em notas Markdown.

**Versão do código:** 0.27.0. **Versão mínima do Obsidian:** 1.5.0. **Status de validação:** testes automatizados headless aprovados; os testes reais com mesa digitalizadora e Obsidian continuam necessários.

## Novidades da versão 0.27.0

- Internacionalização: Automático, Português (Brasil) e English em Documento e configurações → Interface e gestos → Idioma. Mais de 800 mensagens no catálogo inglês; fallback em português para mensagens não catalogadas.
- Busca indexada desde a primeira abertura, com sinônimos e consulta em português/inglês.
- Desfazer configurações separado do histórico do desenho; protege alterações posteriores.
- Mesma amostra antes/depois e preservação dos testes ao visitar a calibração.
- Favoritos com renomeação, atualização, reordenação e remoção reversíveis.
- Alças com alvo maior para caneta, posicionamento que procura evitar a área de trabalho, restauração individual dos parâmetros e ajuda ilustrada.
- Avisos informativos do canvas aguardam o fim do traço; erros de salvamento permanecem imediatos.

## Novidades da versão 0.26.0

- Perfil de suavização ativo, Personalizado e valores variados na seleção; amostras nos cards e ajustes sincronizados.
- Área de teste no próprio painel da caneta, sem alterar a página ou o histórico.
- Busca por categorias e controles, com destaque do campo e abertura da seção correspondente.
- Última categoria lembrada entre sessões; rolagem e seções abertas lembradas durante a sessão.
- Indicação do alcance das alterações e do estado real de salvamento das preferências.
- Restauração separada de suavização, pressão e atalhos; densidade compacta/confortável; requisitos de ações desabilitadas.

## Novidades da versão 0.25.0

- Perfis de escrita e presets prontos em cards compactos com ícone e nome.
- Documento e configurações em modal com oito categorias na navegação lateral, reaproveitando todos os formulários existentes.
- Navegação adaptada à largura disponível, foco contido no modal e retorno ao botão de origem ao fechar.
- Campos de formulário, importação de arquivos e botões padronizados com as cores do tema.

## Novidades da versão 0.21.0 — transformações, edição direta e fluidez visual

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

Veja [uso, implementação e limites](docs/IMPLEMENTACAO-0.21.md).

## Novidades da versão 0.20.0 — desempenho ao mover seleções grandes

- Arrastes com 32 ou mais objetos usam uma prévia por translação, sem recriar todos os pontos a cada evento.
- Eventos de ponteiro são agrupados em uma atualização por quadro; o último evento é aplicado mesmo ao soltar antes do próximo quadro.
- Reutilização dos caminhos Path2D e limites dos objetos, preservando ordem de camadas e objetos que entram no campo de visão.
- Conectores acompanham os alvos durante o arraste. Coordenadas definitivas são materializadas uma vez ao concluir.
- Um único desfazer, cancelamento sem alteração do documento e proteção contra edições concorrentes.
- Quatorze suítes automatizadas aprovadas; medição sintética de JavaScript, sem validação de GPU ou hardware real.

Veja [detalhes e limites](docs/IMPLEMENTACAO-0.20.md).

## Novidades da versão 0.19.0 — fluxo de seleção e escrita

- Copiar/colar traços, formas, textos e imagens entre páginas, com estilos, grupos e conexões internas preservados.
- Arrastar arquivos de imagem para a posição desejada, com indicação de inserção.
- Redimensionar imagens mantendo proporção; Shift libera os eixos e Alt usa o centro, incluindo imagens giradas.
- Alças maiores e tolerância em pixels para caneta, destaque de objeto e limiar ajustável para iniciar arrasto.
- Barra contextual conforme o tipo selecionado; retorno à caneta, enquadrar seleção e voltar à vista anterior.
- Mensagens discretas com Desfazer; Esc cancela apenas um nível por vez.
- Prévia de estilo reversível reforçada com confirmação por teclado e proteção de sessão.
- Treze suítes headless aprovadas. Validação visual e hardware continuam pendentes.

Veja [uso, atalhos e validação](docs/IMPLEMENTACAO-0.19.md).

## Novidades da versão 0.18.0 — seleção flutuante e imagens

- Barra contextual centralizada sobre o canvas, sem ocupar espaço no layout, também nas disposições laterais e no modo foco.
- Ações adicionais de tinta, formas e vetores no popover Mais ações da seleção.
- Destaque consistente para aplicar/confirmar/concluir, foco visível e cancelamento secundário.
- Rodapé de confirmação nas prévias, com Ctrl/Cmd+Enter e retorno do foco ao desenho.
- Colagem local de PNG/JPEG/WebP com Ctrl+V/Cmd+V, seleção imediata e lote com um desfazer.
- Doze suítes automatizadas. Teste visual ampliado, mas não executado por falta de Chromium. Obsidian real e mesa digitalizadora ainda precisam de validação.

Veja [uso e validação](docs/IMPLEMENTACAO-0.18.md).

## Novidades da versão 0.17.0

**Conferir números escritos** oferece sugestões locais experimentais, correção manual, modelos vetoriais ou texto digitado. Mantém a tinta original por padrão; pode aprender exemplos de algarismos no próprio vault. Oferta após pausa é opcional.

Edição direta de segmentos e múltiplos nós, contornos/furos editáveis, alças de dimensões/raio/arredondamento, recorte destacado antes do clique, diagnóstico de frestas, seletor de sobreposições, ferramentas temporárias com retorno consistente e histórico descritivo. Operações complexas têm processamento cancelável em Worker quando disponível.

Veja [uso e limites](docs/IMPLEMENTACAO-0.17.md) e [validação](docs/VALIDACAO-0.17.md). Esquema 9 mantido. Onze suítes automatizadas; mesa digitalizadora, temas e Obsidian real ainda não validados.

## Novidades da versão 0.16.0

**Organizar → Construir e editar** reúne recorte entre interseções, união/subtração/interseção/exclusão de áreas, preenchimento por clique com tolerância de aberturas, edição Bézier, tangência persistente e repetição com deslocamento/rotação. O botão também aparece na seleção. Grupos recolhíveis e ações indisponíveis explicam o que selecionar; alterações complexas têm **prévia, Aplicar e Cancelar**.

A continuação de tinta por extremidades é opcional. Há marcador antes de tocar, preservação do estilo original e uma operação de desfazer. QuickShape permite alternar escala/rotação sem salto de tamanho.

Leia [uso, atualização e limites da 0.16](docs/IMPLEMENTACAO-0.16.md) e [validação](docs/VALIDACAO-0.16.md). **Esquema 9:** lê documentos 1–8; versões antigas do plugin não abrem arquivos já salvos pela 0.16. Preserve uma cópia do vault antes da atualização.

## Novidades da versão 0.15.0

**Inserir forma** abre uma biblioteca visual com 30 opções, busca e parâmetros. **Reconhecer** mostra o popover **Você queria um…?** perto da tinta, com miniaturas, prévia e confirmação.

A seleção oferece união de dois traços, edição local de curvas, ajuste geométrico da escrita e interpretação simples de diagramas. Segurar **D** e arrastar ajusta espessura/opacidade sem desenhar. Cadernos têm navegação anterior/próxima e impressão por dimensão de página.

Leia [recursos, uso e limites](docs/IMPLEMENTACAO-0.15.md) e [validação 0.15](docs/VALIDACAO-0.15.md). Os recursos de escrita geométrica e PDF continuam experimentais; não houve teste real com hardware. Para instalar, siga as instruções abaixo e preserve `data.json`. Esquema 8 mantido, com parâmetros opcionais.

## Novidades da versão 0.14.0

- **••• → Pauta, grade e backups:** espaçamento de 8 a 200 unidades e controle global para desligar backups sem desligar salvamento automático.
- QuickShape com confirmação, polígonos, modificador de proporção; snap adicional, seleção poligonal e radial por direção opcional.
- Coleção de presets, controles rápidos, sliders finos, duplicação/reordenação de camadas e navegador simplificado.
- Cadernos e importação de páginas PDF isolados como **experimentais**.

Consulte [implementação e pendências](docs/IMPLEMENTACAO-0.14.md), [validação](docs/VALIDACAO-0.14.md) e [guia de atualização](docs/ATUALIZACAO-0.14.md). Esses documentos distinguem funcionalidades testadas em simulação de fluxos que ainda precisam de validação real.

## Correção de desempenho na versão 0.13.1

- Corrige um stutter de início do traço: a cópia de recuperação emergencial era acionada **no primeiro evento `pointermove` de cada novo traço**, clonando o documento inteiro. A primeira cópia de um traço agora só pode ser agendada **após cinco segundos de escrita contínua**.
- Quando o ambiente fornece `requestIdleCallback`, a cópia intermediária de traços longos é feita em um período ocioso, com limite de dois segundos. Tarefas pendentes são canceladas ao concluir ou cancelar o traço.
- O salvamento normal após cinco segundos sem alterações permanece igual; os backups regulares após salvar continuam ativos. Não modifica o formato `.smartink` nem as preferências armazenadas.
- O teste automatizado `tests/stroke-start.cjs` cobre início, longos traços, cancelamento e repetição do gesto.

## Funcionalidades trazidas da versão 0.13.0

- **Seleção → Estilo** abre a mesma paleta da Caneta (cores, recentes, seletor personalizado, espessura, estilos Caneta/Lápis/Marca-texto, opacidade e opções avançadas para traços). Formas geométricas também oferecem linha contínua, tracejada ou pontilhada.
- Prévia temporária: **Aplicar à seleção** registra uma única operação no histórico; **Cancelar/Esc** restaura a aparência original. O pincel ativo não é alterado pela edição da seleção.
- A gravação dos documentos `.smartink` ocorre **5 segundos após a última alteração confirmada**. Novas alterações reiniciam o intervalo, coalescendo múltiplos traços em uma escrita no vault.
- **Ctrl+S**, comando Salvar, fechamento da aba e descarregamento do plugin gravam imediatamente as alterações pendentes (segurança). A fila de gravação continua serializada e não sobrescreve silenciosamente modificações externas.
- Opacidade acessível na área principal do painel; indicador de estado distingue edições pendentes de gravação em andamento.

**Trade-off:** uma falha abrupta do processo ou queda de energia durante os 5 segundos de inatividade pode perder as últimas alterações ainda não persistidas. Para anotações críticas, use Ctrl+S. A redução de gravações é intencional e o backup de recuperação acompanha os salvamentos efetivamente concluídos.

## Comece aqui

Requer **Node.js 20+**. Não há dependências npm de runtime ou build; o `npm install` é opcional para executar os scripts localmente.

```bash
npm run build          # Gera main.js e styles.css na raiz
npm run check          # Valida sintaxe, build e versão
npm test               # Testes headless
npm run package        # Gera releases/smart-ink-0.17.0.zip
npm run verify         # Executa tudo acima em sequência
npm run dev            # Recompila quando houver alterações em src/
```

Ao usar Git, os arquivos `main.js` e `styles.css` gerados ficam ignorados em `.gitignore`. Isso é intencional: os arquivos em `src/` são a fonte de verdade, e CI/release os compila novamente. O pacote de origem baixado já inclui esses dois arquivos para facilitar uma instalação local imediata.

## Estrutura do projeto

```text
smart-ink/
├── .github/workflows/ci.yml    # Testa e gera ZIP no GitHub Actions
├── .github/workflows/release.yml # Publica ZIP ao criar tag v*
├── src/
│   ├── core/
│   │   ├── ink-engine.js        # Estabilização, pressão e geometria do traço
│   │   ├── geometry.js          # Interseções, snapping e transformações
│   │   ├── document.js          # Documento .smartink v8, renderização e histórico
│   │   ├── brushes.js           # Pincéis e preferências
│   │   ├── visibility.js        # Cache e índice espacial
│   │   └── workflow.js          # Seleção, viewport, grupos e validação
│   ├── features/
│   │   ├── legacy-features.js   # Recursos expandidos da versão base
│   │   └── quality-of-life.js  # Camadas, menus, snap e zoom radial e camada de UX
│   ├── plugin/index.js         # API do Obsidian, view, comandos e incorporação
│   ├── styles/
│   │   ├── base.css
│   │   └── quality-of-life.css
│   └── vendor/
│       ├── perfect-freehand.bundle.js
│       └── clipper.bundle.js
├── scripts/                    # Build, watch, verificação e ZIP portável
├── tests/                      # Smoke, UX, autosave, suavização e integridade de build
├── docs/                       # Arquitetura e publicação
├── manifest.json
├── package.json
└── THIRD-PARTY-NOTICES.txt
```

## Onde alterar cada função

| Objetivo | Arquivo de código-fonte |
| --- | --- |
| Menu radial, zoom curvo, encaixes independentes, UX de camadas | `src/features/quality-of-life.js` |
| Estilos visuais das melhorias | `src/styles/quality-of-life.css` |
| Algoritmo de estabilização | `src/core/ink-engine.js`, função `stabilize` |
| Reconhecimento, snap, cálculo geométrico | `src/core/geometry.js` e `src/core/document.js` |
| Configurações padrão, pincéis e persistência de preferências | `src/core/brushes.js` |
| View do Obsidian, paleta compartilhada, autosave, embeds | `src/plugin/index.js` |
| Integrações legadas, histórico visual, exportação PNG | `src/features/legacy-features.js` |
| Estilos base | `src/styles/base.css` |

Ao adicionar um **novo arquivo JavaScript ou CSS**, inclua-o explicitamente em `javascriptModules` ou `cssModules`, em `scripts/build.mjs`, na posição em que suas dependências já estejam declaradas. O código compartilha um escopo lexical único: a ordem **importa**. Confira [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Testar no seu Obsidian

1. Faça backup de todo o vault e especialmente de `.obsidian/plugins/smart-ink/data.json` e seus documentos `.smartink`.
2. Execute `npm run verify`.
3. Extraia `releases/smart-ink-0.17.0.zip`.
4. Copie `smart-ink/manifest.json`, `smart-ink/main.js` e `smart-ink/styles.css` para `<seu-vault>/.obsidian/plugins/smart-ink/`.
5. **Não sobrescreva `data.json`**, pois contém preferências do usuário.
6. Reative o Smart Ink em **Configurações → Plugins da comunidade** ou recarregue o Obsidian.
7. Teste pressão, ponteiro da mesa, suavização, réguas, snapping, camadas, exportação e desfazer/refazer.

### Incorporação em notas Markdown

Use o comando **Copiar incorporação para nota** no plugin ou insira um bloco Markdown com a referência para um arquivo existente (o ID é meramente ilustrativo):

````markdown
```smartink id="exemplo"
Smart Ink/meu-desenho.smartink
```
````

Os documentos `.smartink` usam esquema **v8**. A leitura migra versões 1–7; o próximo salvamento grava v8. A 0.13.1 não lê v8. Preserve cópias anteriores se precisar voltar de versão.

## Limitações

Os testes verificam sintaxe, algoritmos e partes da interface simulada, mas **não substituem** uma sessão real no Obsidian. Não há OCR de escrita por IA. O projeto ainda mantém alguns módulos grandes oriundos do bundle distribuído; a modularização futura deve ser incremental, com testes de regressão e compatibilidade de documento.
