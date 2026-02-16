console.log('started @', new Date().toISOString())

import client from 'prom-client'
import express from 'express'
import sb from 'skyblock.js'
import * as listeners from './listeners.json' with { type: 'json' }

const app = express()

const playerCountCounter = new client.Gauge({
    name: "skyblock_player_total",
    help: "Players online on Skyblock",
    labelNames: ["location"], // survival | economy
})

const tpsCounter = new client.Gauge({
    name: "skyblock_tps_1m",
    help: "TPS at the 1m average point",
    labelNames: ["location"], // survival | economy
})

const msptCounter = new client.Gauge({
    name: "skyblock_mspt",
    help: "MSPT for each server",
    labelNames: ["location"], // survival | economy
})

const scrape_ok = new client.Gauge({
    name: "sbpad_scrape_success",
    help: "1 if last Skyblock fetch succeeded, 0 otherwise",
})

app.get("/metrics", async (_req, res) => {
    const t0 = Date.now();
    try {
        res.set("Content-Type", client.register.contentType);
        res.end(await client.register.metrics());
    } finally {
        console.log("served /metrics in", Date.now() - t0, "ms at", new Date().toISOString());
    }
});

app.get("/healthz", (_req, res) => res.send("ok"));

app.listen(19862, () => {
    console.log(`Metrics server listening on http://::19862`);
});

function diffArray(newArray: string[], oldArray: string[]): {lost: string[], added: string[]} {
    const newSet = new Set(newArray);
    const oldSet = new Set(oldArray);
  
    const lost = oldArray.filter((item: string) => !newSet.has(item));
    const added = newArray.filter((item: string) => !oldSet.has(item));
  
    return { lost, added };
}

function deduplicate(arr: any[]): any[] {
    return [...new Set(arr)]
}

const survivalHook = process.env.SURVIVAL_PLAYER_WEBHOOK
const economyHook = process.env.ECONOMY_PLAYER_WEBHOOK


let lastSurvival: string[] = []
let lastEconomy: string[] = []

setInterval(async () => {
    try {
        console.log('loop started @ ' + new Date().toISOString())
        const survivalResult = await sb.getGamemode(sb.Gamemodes.skyblock)
        const economyResult = await sb.getGamemode(sb.Gamemodes.economy)

        const survivalPlayers = (sb.isGamemodeOnline(survivalResult) ? survivalResult.players : []).sort()
        const economyPlayers = (sb.isGamemodeOnline(economyResult) ? economyResult.players : []).sort()

        const survivalDifference = diffArray(survivalPlayers, lastSurvival)
        const economyDifference = diffArray(economyPlayers, lastEconomy)

        for (const uuid of deduplicate([...survivalDifference.lost, ...survivalDifference.added, ...economyDifference.lost, ...economyDifference.added])) {
            if (!listeners[uuid as never]) continue;

            const player = await sb.getPlayer(uuid);

   //         const isOnline = player && player.status && !!player.status.connectVersion
            const isOnline = player && player.status && 
        (player.status.switchGamemodeTs == player.status.disconnectTs ? !!player.status.connectVersion : (player?.status.disconnectTs < player?.status.connectTs))
    

            console.log(player, isOnline)
    

            const msg = `${player.mojangUsernamePretty} (${uuid}) is ${isOnline ? 'connected to' : 'disconnected from'} ${player.status.switchGamemode}. ${listeners[uuid as keyof typeof listeners].pings}`

            await fetch(listeners[uuid as keyof typeof listeners].webhook, { method: 'POST', body: JSON.stringify({content: msg}), headers: {'Content-Type': 'application/json'} })
        }

        let survivalContent = `Survival is ${sb.isGamemodeOnline(survivalResult) ? 'online' : 'offline'}, with: ${sb.isGamemodeOnline(survivalResult) ? survivalResult.playerCount : 0} players.\n`
        let economyContent = `Economy is ${sb.isGamemodeOnline(economyResult) ? 'online' : 'offline'}, with: ${sb.isGamemodeOnline(economyResult) ? economyResult.playerCount : 0} players.\n`

        playerCountCounter.set({ location: "economy"  }, sb.isGamemodeOnline(economyResult) ? Number(economyResult.playerCount || 0) : 0);
        playerCountCounter.set({ location: "survival" }, sb.isGamemodeOnline(survivalResult) ? Number(survivalResult.playerCount || 0) : 0);

        tpsCounter.set({ location: "economy"  }, sb.isGamemodeOnline(economyResult) ? Number(economyResult.metrics.tps[0] || 0) : 0);
        tpsCounter.set({ location: "survival"  }, sb.isGamemodeOnline(survivalResult) ? Number(survivalResult.metrics.tps[0] || 0) : 0);

        msptCounter.set({ location: "economy"  }, sb.isGamemodeOnline(economyResult) ? Number(economyResult.metrics.mspt[0] || 0) : 0);
        msptCounter.set({ location: "survival"  }, sb.isGamemodeOnline(survivalResult) ? Number(survivalResult.metrics.mspt[0] || 0) : 0);
        
        scrape_ok.set(1);

        if (survivalDifference.lost.length > 50 || survivalDifference.added.length > 50) {
            survivalContent += `Too many players to list individually. Lost: ${survivalDifference.lost.length}, Added: ${survivalDifference.added.length}`
        } else {
            for (const item of [...survivalDifference.added.map((name)=>['Added', name]), ...survivalDifference.lost.map((name)=>['Lost', name])]) {
                survivalContent += `- **${item[0]}**: \`${item[1]}\`\n`
            }
        }


        if (economyDifference.lost.length > 50 || economyDifference.added.length > 50) {
            economyContent += `Too many players to list individually. Lost: ${economyDifference.lost.length}, Added: ${economyDifference.added.length}`
        } else {
            for (const item of [...economyDifference.added.map((name)=>['Added', name]), ...economyDifference.lost.map((name)=>['Lost', name])]) {
                economyContent += `- **${item[0]}**: \`${item[1]}\`\n`
            }
        }


        lastSurvival = survivalPlayers
        lastEconomy = economyPlayers

        console.log('survivalcontentsplit',    survivalContent.trim().split('\n'), survivalContent.trim().split('\n').length > 1 )
        console.log('economycontentsplit',    economyContent.trim().split('\n'), economyContent.trim().split('\n').length > 1 )

        if (survivalContent.trim().split('\n').length > 1) 
            await fetch(survivalHook!, { method: 'POST', body: JSON.stringify({content: survivalContent}), headers: {'Content-Type': 'application/json'} })

        if (economyContent.trim().split('\n').length > 1) 
            await fetch(economyHook!, { method: 'POST', body: JSON.stringify({content: economyContent}), headers: {'Content-Type': 'application/json'} })
            
        console.log(new Date().toISOString(), 'made it through the loop')
    } catch (e) {
        console.log(`${new Date().toISOString()} threw on loop, error: `, e)

//        playerCountCounter.set({ location: "economy"  }, NaN);
//        playerCountCounter.set({ location: "survival" }, NaN);
        scrape_ok.set(0);
    }

}, 10_000) // every 30 seconds:
