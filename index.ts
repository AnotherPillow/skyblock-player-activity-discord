console.log('started @', new Date().toISOString())

import sb from 'skyblock.js'

function diffArray(newArray: string[], oldArray: string[]): {lost: string[], added: string[]} {
  const newSet = new Set(newArray);
  const oldSet = new Set(oldArray);
  
  const lost = oldArray.filter((item: string) => !newSet.has(item));
  const added = newArray.filter((item: string) => !oldSet.has(item));
  
  return { lost, added };
}

const survivalHook = process.env.SURVIVAL_PLAYER_WEBHOOK
const economyHook = process.env.ECONOMY_PLAYER_WEBHOOK


let lastSurvival: string[] = []
let lastEconomy: string[] = []

setInterval(async () => {
    console.log('loop started')
    const survivalResult = await sb.survival()
    const economyResult = await sb.economy()

    const survivalPlayers = survivalResult.player_list.sort()
    const economyPlayers = economyResult.player_list.sort()

    const survivalDifference = diffArray(survivalPlayers, lastSurvival)
    const economyDifference = diffArray(economyPlayers, lastEconomy)

    let survivalContent = `Survival is ${survivalResult.online ? 'online' : 'offline'}, with: ${survivalResult.players_online}/${survivalResult.max_players} players.\n`
    let economyContent = `Economy is ${economyResult.online ? 'online' : 'offline'}, with: ${economyResult.players_online}/${economyResult.max_players} players.\n`

    if (survivalDifference.lost.length > 50 || survivalDifference.added.length > 50) {
        survivalContent = `Too many players to list individually. Lost: ${survivalDifference.lost.length}, Added: ${survivalDifference.added.length}`
    } else {
        for (const item of [...survivalDifference.added.map((name)=>['Added', name]), ...survivalDifference.lost.map((name)=>['Lost', name])]) {
            survivalContent += `- **${item[0]}**: \`${item[1]}\`\n`
        }
    }


    if (economyDifference.lost.length > 50 || economyDifference.added.length > 50) {
        economyContent = `Too many players to list individually. Lost: ${economyDifference.lost.length}, Added: ${economyDifference.added.length}`
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
        
    


}, 10_000) // every 30 seconds
