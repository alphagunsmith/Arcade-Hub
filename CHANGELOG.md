# Novidades

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
