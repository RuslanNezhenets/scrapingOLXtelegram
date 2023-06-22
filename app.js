const App = require('node-telegram-bot-api')
const getFromOLX = require('./scraping')
const fs = require("fs");
require('dotenv').config()

const TOKEN = process.env.TOKEN
const CHAT = process.env.CHAT

const bot = new App(TOKEN)

const sleep = (milliseconds) => {
    return new Promise(resolve => setTimeout(resolve, milliseconds))
}

function escapeString(stringToEscape) {
    const symbols = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!']
    const ourRegex = new RegExp('([' + symbols.map(s => '\\' + s).join('|') + '])', 'g');

    return stringToEscape.replace(ourRegex, '\\$1')
}

function escapeJson(jsonData) {
    for (let key in jsonData) {
        for (let ad of jsonData[key]) {
            ad.name = escapeString(ad.name)
            for (let key in ad.seller) {
                ad.seller[key] = escapeString(ad.seller[key])
            }
        }
    }
}

function beautify(jsonMessage) {
    escapeJson(jsonMessage)

    let messages = []
    for (let key in jsonMessage) {
        let stringOutput = `*${escapeString(key)}*:`
        for (let ad of jsonMessage[key]) {
            stringOutput += `\n[${ad.name}](${ad.src}): `
            stringOutput += (`${ad.seller.author} на OLX з ${ad.seller.date} ` +
                `з рейтингом \"${ad.seller.rating}\" та ${ad.seller.deliveries} успішних доставок\\.`)
        }
        messages.push(stringOutput)
    }
    return messages
}

async function sendMessageByToken(chatId, message) {
    const array = beautify(message)
    for (let item of array) {
        await bot.sendMessage(chatId, item, {
            'parse_mode': 'MarkdownV2',
            'disable_web_page_preview': true
        })
        await sleep(400)
    }
}

function checkHistory(history, data) {
    let result = {}
    for (let key in data) {
        let temp = []
        if(history.hasOwnProperty(key)) {
            for (let ad of data[key]) {
                if (!history[key].some(obj => obj.src === ad.src))
                    temp.push(ad)
            }
            if (Object.keys(temp).length > 0)
                result[key] = temp
        } else result[key] = data[key]
    }
    return result
}

getFromOLX().then(async data => {
    if (!fs.existsSync('history.json'))
        fs.writeFileSync('history.json', '{}')

    const history = JSON.parse(fs.readFileSync('history.json', 'utf8'))

    const result = checkHistory(history, data)
    const formattedData = JSON.stringify(data, null, 2)
    fs.writeFileSync(`history.json`, formattedData)

    try {
        await sendMessageByToken(CHAT, result)
    }
    catch (e) {
        fs.writeFileSync('text.txt', e)
    }
})
