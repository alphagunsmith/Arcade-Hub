# Arcade Hub 1.0.1: correções

## Como aplicar no seu projeto

- **Pelo diff (recomendado):** na pasta do projeto, rode `git apply arcade-hub-correcoes.diff` (ou `patch -p1 < arcade-hub-correcoes.diff`).
  O diff foi gerado a partir do código que estava dentro do instalador 1.0.0. Se você mexeu no projeto depois, revise os conflitos.
- **Não substitua o seu `package.json`** pelo da pasta `codigo/`. O que vai dentro do instalador é uma versão enxuta, sem as dependências e a configuração de build. Só mude `"version"` para `1.0.1`.
- **Arquivo novo:** `src/scan-worker.js`. Se o seu `electron-builder` usa uma lista `files`, inclua esse arquivo nela.
- **Para testar sem recompilar:** troque `resources\app.asar` na pasta onde o Arcade Hub está instalado pelo `app.asar` que vem junto. Faça backup do original antes.
  Se o app não abrir assim, é porque o seu build tem verificação de integridade do asar ativa. Nesse caso, gere o instalador normalmente.

## O que mudou

### Bugs que apagavam ou bagunçavam dados
1. **Reescanear zerava o tempo de jogo**, as notas, a origem da capa e os argumentos editados. Agora a varredura só atualiza os campos dela (de onde o jogo veio e como abrir). O resto continua sendo do usuário (`mergeScanned`).
2. **"Substituir" no importar agia como "mesclar".** O mapa de jogos era montado antes de zerar a lista.
3. **Jogos de CD apareciam várias vezes** (um `.cue` mais as faixas `.bin`). Agora `.cue`, `.gdi` e `.m3u` são lidos e os arquivos que eles listam não viram jogos à parte. Um jogo de vários discos com `.m3u` aparece uma vez só.
4. **A plataforma era deduzida por pedaço do caminho.** `C:/Users/dcosta` virava Dreamcast e qualquer "cd" no caminho virava PC Engine. Agora a comparação é por palavra inteira, da pasta mais próxima do arquivo para a raiz. Também:
   - um `.iso` sem pista no caminho vira PS2;
   - um `.bin` numa pasta "Mega Drive", "Genesis" ou "Atari 2600" vira cartucho.
5. **Dreamcast, Saturn e PSP passaram a ter emulador configurável.** O Flycast e o PPSSPP detectados agora são aplicados. Também foi adicionada a extensão `.cso` (PSP).

### Abrir jogos
6. **"Jogar" só diz que deu certo depois que o Windows confirma que o processo abriu.** Se falhar, aparece um erro em português.
7. **Jogo que exige administrador:** sem argumentos, é aberto pelo shell e o Windows mostra o pedido de permissão (UAC). Nesse caso o tempo de jogo não é medido.
8. **`.bat`, `.cmd`, `.lnk` e `.url` abrem pelo Windows.** Antes, o `spawn` falhava com esses arquivos.
9. **"Abrir pasta" só abre pastas.** Antes, num jogo sem `installDir`, ele executava o `.exe`.
10. **O fim de sessão é enviado para a janela que pediu o lançamento**, e não para uma referência que podia estar vazia.

### Desempenho
11. **A varredura roda num processo separado** (`utilityProcess` + `src/scan-worker.js`), então a janela não congela. Se não der para usar esse processo (Electron antigo, erro ou demora), o app cai na varredura antiga automaticamente. Um clique duplo no botão não dispara duas varreduras.
12. **O `library.json` é gravado em lote** (no máximo uma vez a cada 400 ms) e sem indentação. A gravação final acontece ao fechar o app (`store.flush()` no `will-quit`). Se o antivírus travar o rename, o arquivo é gravado direto.
13. **O `libraryfolders.vdf` da Steam é lido uma vez por varredura**, e não uma vez por jogo.
14. **Cada jogo não guarda mais uma cópia de `launchersOk`.**

### Leitura de nomes e capas
15. **O `identity.js` lê a seção `.rsrc` de onde ela estiver no arquivo.** Antes lia só os 3 primeiros MB, e em executáveis grandes o nome do jogo nunca era encontrado. Testado com um executável que tinha a `.rsrc` depois dos 5 MB: antes `null`, agora o nome sai certo.
16. **Capas da Steam no formato novo do cliente** (`appcache/librarycache/<appid>/…`). Confira na sua máquina: não tenho um cliente Steam recente aqui para testar.

### Segurança
17. **Importar backup:** os jogos são validados um a um e os inválidos são descartados. Se o backup tiver programas ou links que o app vai abrir, aparece uma confirmação listando cada um. Os campos calculados (`problem`, `installed`) e o `windowBounds` não vêm do arquivo.
18. **Links:** só são aceitos `http(s)` e os esquemas das lojas (`steam:`, `com.epicgames.launcher:`, `goggalaxy:`, Ubisoft, EA, Battle.net, itch, Heroic, Amazon, Xbox). Esquemas como `file:`, `ms-msdt:` e `search-ms:` são recusados ao adicionar, editar, importar e lançar.
19. **Capas:** são aceitas `https` ou arquivos dentro da pasta de capas do próprio app. A capa local precisa ser uma imagem.
20. **`sandbox: true` na janela.** O preload só usa `contextBridge` e `ipcRenderer`, que funcionam no sandbox.
21. **`el()` agora usa `textContent`.** Marcação fixa do app passa a usar `elHtml()`, que tem só dois usos. Antes, uma plataforma vinda de um backup (por exemplo `<b>PC</b>`) virava HTML no destaque "continue jogando".
22. **CSP:** foi adicionado `media-src`, então o vídeo via `http://127.0.0.1` deixa de ser bloqueado. Também entraram `object-src 'none'` e `base-uri 'none'`.
23. **Servidor de vídeo:** o `Range` é validado e um pedido fora do tamanho do arquivo responde 416.

### Limpeza
24. **Saíram os ajustes que nada usava:** `launchFullscreen` e `confirmLaunch`. O `launchArgs` do `game:add` agora vira `launch.args`.
25. **Controle:** o launcher ignora o gamepad quando a janela não está em foco, ou seja, quando o jogo está aberto por cima.

## O que ainda depende de você
- **Assinatura digital do instalador:** precisa de um certificado de assinatura de código. Sem ele, o SmartScreen continua avisando.
- **Atualização automática:** precisa instalar o `electron-updater` e configurar `publish` no `electron-builder`, por exemplo com GitHub Releases.
- **Metacritic e SteamGridDB:** os endpoints usados não são oficiais e podem parar de funcionar sem aviso. O app já falha sem quebrar, mas vale acompanhar.
