// =============================================================================
// DualSense Auto - ponte para Call of Duty: Black Ops II (Plutonium T6)
//
// Grava, em tempo real, o que acontece com o seu personagem em
//   %LOCALAPPDATA%\Plutonium\storage\t6\dualsense\eventos.txt
// e o app DualSense Auto transforma isso em gatilhos e vibração, com a
// configuração de cada arma (multiplayer e zumbis, incluindo as armas melhoradas).
//
// Precisa do plugin t6-gsc-utils (ele dá ao script as funções de arquivo).
// Funciona onde os scripts do seu PC rodam: zumbis solo, partidas privadas e
// partidas que você hospeda.
// =============================================================================

init()
{
    level.dsa_arquivo = "dualsense/eventos.txt";
    if (!directoryexists("dualsense"))
        createdirectory("dualsense");
    writefile(level.dsa_arquivo, gettime() + "|inicio\n", false);
    level thread dsa_procura_jogador();
}

dsa_escreve(texto)
{
    writefile(level.dsa_arquivo, gettime() + "|" + texto + "\n", true);
}

dsa_procura_jogador()
{
    for (;;)
    {
        p = undefined;
        if (isdefined(level.players) && level.players.size > 0)
            p = level.players[0];

        if (isdefined(p) && !isdefined(p.dsa_ativo))
        {
            p.dsa_ativo = 1;
            p thread dsa_arma();
            p thread dsa_tiros();
            p thread dsa_dano();
            p thread dsa_estado();
            p thread dsa_municao();
            p thread dsa_recarga();
            p thread dsa_granada();
            p thread dsa_morte();
        }
        wait 0.5;
    }
}

// troca de arma (verifica 10x por segundo); o app reconhece a arma pelo nome
dsa_arma()
{
    self endon("disconnect");
    ultimo = "";
    for (;;)
    {
        w = self getcurrentweapon();
        if (!isdefined(w))
            w = "none";
        if (w != ultimo)
        {
            ultimo = w;
            dsa_escreve("arma|" + w + "|?|0|0");
        }
        wait 0.1;
    }
}

dsa_tiros()
{
    self endon("disconnect");
    for (;;)
    {
        self waittill("weapon_fired");
        dsa_escreve("tiro");
    }
}

// dano com a direção de onde veio, relativa para onde você está olhando
dsa_dano()
{
    self endon("disconnect");
    for (;;)
    {
        self waittill("damage", quantidade, atacante, direcao);
        para_atacante = undefined;
        if (isdefined(atacante) && isdefined(atacante.origin) && atacante != self)
            para_atacante = atacante.origin - self.origin;
        else if (isdefined(direcao) && length(direcao) > 0.01)
            para_atacante = direcao * -1;

        lado = "frente";
        if (isdefined(para_atacante) && length((para_atacante[0], para_atacante[1], 0)) > 0.01)
        {
            v = vectornormalize((para_atacante[0], para_atacante[1], 0));
            angulos = self getplayerangles();
            olhar = (0, angulos[1], 0);
            f = vectordot(v, anglestoforward(olhar));
            d = vectordot(v, anglestoright(olhar));
            if (f < -0.5)
                lado = "tras";
            else if (f > 0.5)
                lado = "frente";
            else if (d > 0)
                lado = "direita";
            else
                lado = "esquerda";
        }
        vida = 0;
        maxima = 100;
        if (isdefined(self.health))
            vida = self.health;
        if (isdefined(self.maxhealth) && self.maxhealth > 0)
            maxima = self.maxhealth;
        dsa_escreve("dano|" + quantidade + "|" + lado + "|" + vida + "|" + maxima);
    }
}

// mira (ADS) e vida, só quando mudam
dsa_estado()
{
    self endon("disconnect");
    ultimo = "";
    for (;;)
    {
        ads = 0;
        if (self playerads() > 0.5)
            ads = 1;
        vida = 100;
        if (isdefined(self.health) && isdefined(self.maxhealth) && self.maxhealth > 0)
            vida = int(self.health * 100 / self.maxhealth);
        txt = ads + "|" + vida;
        if (txt != ultimo)
        {
            ultimo = txt;
            dsa_escreve("estado|" + txt);
        }
        wait 0.15;
    }
}

// balas no pente, só quando muda (pente vazio = gatilho leve, sem tranco)
dsa_municao()
{
    self endon("disconnect");
    ultimo = "";
    for (;;)
    {
        w = self getcurrentweapon();
        txt = "-1";
        if (isdefined(w) && w != "none")
            txt = "" + self getweaponammoclip(w);
        if (txt != ultimo)
        {
            ultimo = txt;
            dsa_escreve("municao|" + txt);
        }
        wait 0.1;
    }
}

dsa_recarga()
{
    self endon("disconnect");
    for (;;)
    {
        self waittill("reload_start");
        dsa_escreve("recarga");
    }
}

dsa_granada()
{
    self endon("disconnect");
    for (;;)
    {
        self waittill("grenade_fire");
        dsa_escreve("granada");
    }
}

dsa_morte()
{
    self endon("disconnect");
    for (;;)
    {
        self waittill("death");
        dsa_escreve("morte");
    }
}
