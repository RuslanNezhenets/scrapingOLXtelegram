const chrome = require('selenium-webdriver/chrome')
const {Builder, By, until} = require('selenium-webdriver')
const fs = require('fs')
require('dotenv').config()

const EMAIL = process.env.EMAIL
const PASSWORD = process.env.PASSWORD
const URL = 'https://www.olx.ua/uk/'

async function getFromOLX() {
    try {
        console.log("Процесс начат")
        const data = await WebScrapingLocalTest()
        console.log("Процесс завершён")
        return data
    } catch (error) {
        console.log(error)
    }
}

async function WebScrapingLocalTest() {
    let driver
    try {
        const options = new chrome.Options()
        options.addArguments('headless')
        options.excludeSwitches(['enable-logging'])
        driver = await new Builder()
            .forBrowser('chrome')
            .setChromeOptions(options)
            .build()

        await driver.get(URL)

        await login(driver)

        await driver.get('https://www.olx.ua/uk/favorites/search/')

        const searchLinks = []
        const searches = await driver.findElements(By.css(".box.rel.br4.observedsearch"))

        for (let search of searches) {
            const searchLink = await search.findElement(By.css(".searchLink"))
            const value = await search.findElement(By.css(".block.fbold")).getText()
            const href = await searchLink.getAttribute('href')
            const text = await searchLink.getText()
            const novelties = parseInt(text.match(/\d+/)[0])
            if (novelties > 0)
                searchLinks.push({href: href, value: value, novelties: novelties})
        }

        const ads = {}

        for (let search of searchLinks) {
            await driver.get(search.href)
            console.log("Произвожу поиск по категории:", search.value)

            await driver.sleep(3000)
            const currentUrl = await driver.getCurrentUrl()
            if (currentUrl !== search.href) {
                await driver.get(search.href)
            }

            const cards = await driver.findElements(By.css('[data-cy="l-card"]'))
            await driver.wait(async () => {
                return cards.length > 0
            }, 20000)

            const ads_by_search = []
            for (let card of cards) {
                const novelty = await card.findElements(By.css('.css-1kyngsx.er34gjf0'))
                if (novelty.length > 0) {

                    const name = await card.findElement(By.css('.css-16v5mdi.er34gjf0')).getText()
                    const src = await card.findElement(By.css('.css-rc5s2u')).getAttribute('href')
                    ads_by_search.push({
                        name: name ?? '',
                        src: src ?? '',
                        seller: {}
                    })
                }
            }

            for (let ad of ads_by_search) {
                await driver.get(ad.src)

                let author = await FindElementSafe(driver, By.css('.css-1lcz6o7.er34gjf0'), 5000)
                if(author) author = await author.getText()
                else author = null

                const date_element = await driver.findElement(By.css('.css-16h6te1.er34gjf0'))
                const date = await date_element.findElement(By.tagName('b')).getText()

                let rating = await FindElementSafe(
                    driver,
                    By.css('[data-testid="sentiment-description"]'),
                    5000
                )
                if(rating) {
                    const rating_title = await FindElementSafe(
                        driver, By.css('[data-testid="sentiment-title"]'), 1000
                    )
                    const total_ratings = await FindElementSafe(
                        driver, By.css('[data-testid="total-ratings"]'), 1000
                    )
                    if(rating_title)
                        rating = `${await rating_title.getText()} ${await total_ratings.getText()}`
                    else
                        rating = null
                }

                const deliveries_element = await FindElementSafe(
                    driver, By.css('[data-testid="delivery-badge"]')
                )
                let deliveries = null
                if(deliveries_element) {
                    deliveries = await deliveries_element.findElement(By.tagName('b')).getText()
                }

                ad.seller = {
                    author: author ?? '',
                    date: date ?? '',
                    rating: rating ?? '',
                    deliveries: deliveries ?? ''
                }
            }

            ads[search.value] = ads_by_search
        }
        return ads
    } catch (error) {
        throw new Error(error)
    } finally {
        await driver.quit()
    }
}

async function login(driver) {
    const cookiesExist = fs.existsSync('cookies.json')
    let cookiesValid = false

    if (cookiesExist) {
        const cookies = JSON.parse(fs.readFileSync('cookies.json', 'utf8'))
        for (const cookie of cookies) {
            await driver.manage().addCookie(cookie)
        }

        await driver.get(URL)
        cookiesValid = await checkCookiesValidity(driver)
    }

    if(!cookiesExist || !cookiesValid) {
        console.log("Куки отсутсвуют или не в порядке, пытаюсь сам войти в аккаунт")
        const profile = await driver.findElement(By.xpath("//*[@id=\"my-account-link\"]/div"))
        await profile.click()

        await driver.sleep(1000)

        const email = await driver.findElement(
            By.xpath("//div[@id='__next']/div/div/div/div/main/div/div[3]/div/form/div/div/div/input")
        )
        await email.sendKeys(EMAIL)

        const password = await driver.findElement(
            By.xpath("//div[@id='__next']/div/div/div/div/main/div/div[3]/div/form/div[2]/div/div/div/input")
        )
        await password.sendKeys(PASSWORD)

        const submit = await driver.findElement(
            By.xpath("//*[@id=\"__next\"]/div/div/div/div/main/div/div[3]/div/form/button[2]")
        )
        await submit.click()

        await driver.wait(until.urlIs("https://www.olx.ua/d/uk/myaccount/"), 20000)

        if (fs.existsSync('cookies.json'))
            fs.unlinkSync('cookies.json')

        const currentCookies = await driver.manage().getCookies()
        fs.writeFileSync('cookies.json', JSON.stringify(currentCookies))
        console.log("Обновил куки")
    } else {
        console.log("Куки в порядке")
    }
    console.log("Зашёл в аккаунт")
}

async function FindElementSafe(driver, locator, time = 0) {
    try {
        if(time)
            return await driver.wait(until.elementLocated(locator), time)
        else
            return await driver.findElement(locator)
    } catch (error) {
        return null
    }
}

async function checkCookiesValidity(driver) {
    try {
        const profileLink = await FindElementSafe(driver, By.css("#userLoginBox"), 5000)
        return profileLink !== null
    } catch (error) {
        return false
    }
}

module.exports = getFromOLX