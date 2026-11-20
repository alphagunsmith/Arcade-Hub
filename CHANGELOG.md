# Novidades

## 1.0.3

**Modo TV (no estilo do Big Picture)**
- Tela cheia, feita para jogar do sofá com controle. Abre pelo botão de TV no topo, pelo botão Guia do controle ou pelo ajuste "Abrir direto no Modo TV" (Ajustes › Geral).
- Início: destaque grande do jogo em foco, com o fundo desfocado da capa, e fileiras de jogos:
  - Continue jogando, Favoritos, Mais jogados e Adicionados recentemente;
  - uma fileira por loja e uma por console.
- Biblioteca em grade de A a Z, e um resumo de Estatísticas.
- Página do jogo com tempo de jogo, sessões, última vez, nota, descrição e os botões Jogar e Favoritar.
- Controle:
  - direcional ou analógico para navegar (segurar repete);
  - A abre o jogo e X joga direto;
  - Y favorita e B volta;
  - LB/RB trocam de seção;
  - Start abre o menu e Select escolhe um jogo aleatório;
  - Guia sai do Modo TV.
- Teclado: setas, Enter, Esc, Espaço, F, Q/E e M. O mouse também funciona.
- A barra de baixo mostra os botões certos para o que está na tela: os do controle quando há um conectado, ou as teclas quando não há.
- Sons de navegação gerados na hora, sem arquivos de áudio. Dá para desligar no menu.

**Abertura animada**
- O logo aparece como um molde vazio, o controle cai girando e encaixa, e o encaixe solta um pulso.
- Cada capa da sua biblioteca que o pulso alcança acende e se liga ao logo por um fio de energia.
- Usa as capas dos seus jogos, começando pelos mais jogados.
- Qualquer tecla ou botão pula a animação. Dá para desligar no menu do Modo TV.
- Com "reduzir movimento" ligado no Windows, a animação é trocada por uma versão curta e parada.

## 1.0.2

**Tempo de jogo**
- Jogos da Steam, Epic e GOG agora têm o tempo contado. O app procura programas rodando dentro da pasta do jogo enquanto ele está aberto.
- Jogos que abrem por um launcher próprio também contam. Antes, o launcher fechava em segundos e a sessão era descartada.
- Cada sessão entra num histórico, que alimenta a página de estatísticas.
- O card mostra "jogando agora" enquanto o jogo está aberto.

**Durante o jogo**
- O Arcade Hub vai para perto do relógio quando o jogo abre e volta sozinho quando ele fecha. Dá para desligar em Ajustes › Geral.

**Biblioteca**
- O app procura jogos novos sozinho, ao abrir e quando algo muda nas pastas de jogos, nas pastas de ROMs ou na Steam. Dá para desligar em Ajustes › Geral.
- No diagnóstico, os jogos cujo arquivo sumiu aparecem um por um, com os botões "Apontar arquivo" e "Remover". A ficha do jogo também ganhou o botão "Apontar o arquivo".
- O backup agora é um `.zip` que leva as imagens das capas junto, então funciona em outro PC. Backups `.json` antigos continuam sendo importados.

**Visual**
- Página de estatísticas (menu › Estatísticas), com:
  - tempo total, sessões e média por sessão;
  - os jogos mais jogados;
  - horas por mês, por plataforma e por origem;
  - os jogos instalados que ainda não têm tempo de jogo.
- Tamanho dos cards ajustável no menu.
- Aviso de atualização dentro do app ("Reiniciar agora") e botão "Procurar atualizações" em Ajustes › Sobre.

**Desempenho**
- As lojas instaladas ficam em cache. Antes, cada clique consultava o registro do Windows de novo.
- As capas carregam só quando aparecem na tela.
- A vigia de pastas é ligada depois que a janela já abriu.
