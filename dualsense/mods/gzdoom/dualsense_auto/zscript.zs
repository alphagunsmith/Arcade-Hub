version "4.10"

// =============================================================================
// DualSense Auto - ponte para Doom no GZDoom (Doom, Doom II, Final Doom, SIGIL,
// Doom 64 para GZDoom e a maioria dos WADs e mods de armas)
//
// Escreve, só no arquivo de log (nada aparece na tela), linhas "DSA|..." com:
//   a arma na mão, cada disparo, a munição, o dano com a DIREÇÃO, a vida e a morte.
// O app DualSense Auto lê o log e dá a cada arma os seus gatilhos adaptáveis.
//
// Abra o jogo pelo "Doom com DualSense.bat" (ele liga o log: -logfile dualsense_eventos.txt).
// =============================================================================

class DSA_Eventos : EventHandler
{
	String ultimaArma;
	int ultimaMunicao;
	int ultimaVida;
	int tiqueMelee;

	static void Enviar(String txt)
	{
		Console.PrintfEx(PRINT_LOG, "DSA|%s\n", txt);
	}

	override void WorldLoaded(WorldEvent e)
	{
		ultimaArma = "";
		ultimaVida = -1;
		Enviar("inicio");
	}

	override void WorldTick()
	{
		if (consoleplayer < 0 || !playeringame[consoleplayer])
			return;
		PlayerInfo p = players[consoleplayer];
		if (!p.mo)
			return;

		let w = p.ReadyWeapon;
		String nome = "none";
		int municao = -1;
		if (w)
		{
			nome = w.GetClassName();
			if (w.Ammo1)
				municao = w.Ammo1.Amount;
		}

		if (nome != ultimaArma)
		{
			Enviar(String.Format("arma|%s|?|0|%d", nome, municao));
			Enviar(String.Format("municao|%d", municao));
			ultimaArma = nome;
			ultimaMunicao = municao;
		}
		else if (municao != ultimaMunicao)
		{
			// munição a menos na mesma arma = disparo(s)
			if (municao >= 0 && municao < ultimaMunicao)
			{
				int n = min(ultimaMunicao - municao, 6);
				for (int i = 0; i < n; i++)
					Enviar("tiro");
			}
			Enviar(String.Format("municao|%d", municao));
			ultimaMunicao = municao;
		}

		// punho e motosserra não gastam munição: segurando o ataque, um "golpe" a cada 8 tiques
		if (w && !w.Ammo1 && (p.cmd.buttons & BT_ATTACK) && p.health > 0)
		{
			tiqueMelee++;
			if (tiqueMelee >= 8)
			{
				tiqueMelee = 0;
				Enviar("tiro");
			}
		}
		else
		{
			tiqueMelee = 7;
		}

		if (p.health != ultimaVida)
		{
			ultimaVida = p.health;
			Enviar(String.Format("estado|0|%d", clamp(p.health, 0, 100)));
		}
	}

	override void WorldThingDamaged(WorldEvent e)
	{
		if (consoleplayer < 0)
			return;
		PlayerInfo p = players[consoleplayer];
		if (!p.mo || e.Thing != p.mo)
			return;
		String lado = "frente";
		Actor fonte = e.DamageSource;
		if (!fonte)
			fonte = e.Inflictor;
		if (fonte && fonte != p.mo)
		{
			// ângulo de onde veio o ataque, em relação para onde você está olhando
			double d = Actor.DeltaAngle(p.mo.angle, p.mo.AngleTo(fonte));
			if (abs(d) > 135)
				lado = "tras";
			else if (d > 45)
				lado = "esquerda";
			else if (d < -45)
				lado = "direita";
		}
		Enviar(String.Format("dano|%d|%s|%d|100", e.Damage, lado, max(0, p.health)));
	}

	override void WorldThingDied(WorldEvent e)
	{
		if (consoleplayer >= 0 && players[consoleplayer].mo && e.Thing == players[consoleplayer].mo)
			Enviar("morte");
	}
}
