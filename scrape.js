const axios = require('axios'); // used for making HTTP requests.
const cheerio = require('cheerio'); // lean implementation of core jQuery to parse HTML.
const robotsParser = require('robots-parser'); //parse for 'robots.txt' of the website.
const Bottleneck = require('bottleneck'); // a powerful rate limiter to control request rate.
const fs = require('fs'); // file system module, for saving HTML content to the filesystem.
const path = require('path'); // provides utilities for working with file and directory paths.
const url = require('url'); // utilities for URL resolution and parsing.

const baseUrl = 'https://bkuperberg.gitbook.io/chataigne-docs'; // replace with target URL.
const visitedUrls = new Set(); // a set object to keep track of visited URLs.
const limiter = new Bottleneck({
    maxConcurrent: 1,
    minTime: 2000 // Adjust as necessary; 1000ms = 1 second between requests
});

// Ensure directories exist
const htmlDir = path.join(__dirname, 'html');
if (!fs.existsSync(htmlDir)) {
    fs.mkdirSync(htmlDir, { recursive: true });
}

/* Attempts to download and parse the robots.txt file from the specified
baseUrl. It uses axios to fetch the robots.txt file and robotsParser to parse it. This
function helps the script respect the site's scraping policies. */
async function loadRobotsTxt(baseUrl) {
    try {
        const robotsUrl = new URL('/robots.txt', baseUrl).href;
        const response = await axios.get(robotsUrl);
        return robotsParser(robotsUrl, response.data);
    } catch (error) {
        console.error(`Failed to load robots.txt from ${baseUrl}`, error);
        return null;
    }
}

/* Checks if the targetUrl is allowed to be scraped according to the site's robots.txt
rules. This function ensures that the scraper respects the site's wishes regarding bot
access. */
async function isUrlAllowed(robotRules, targetUrl) {
    // Replace 'my-web-scraper' with something unique to your project
    const userAgent = 'ShoreLine/1.0 (+http://example.com/bot-info)';
    if (!robotRules) return true; // Proceed if unable to load robots.txt
    return robotRules.isAllowed(targetUrl, userAgent);
}

/* Saves the given HTML content to a file named filename within the htmlDir directory.
This function is used to persist the HTML content of each scraped page. */
function saveHTML(filename, content) {
    fs.writeFileSync(path.join(htmlDir, filename), content);
}

/* Processes all <a> tags found in the HTML content of the current page, represented by the 
Cheerio object $. For each link, it resolves the absolute URL and checks if it has not been
visited and is allowed by robots.txt. If so, it recursively calls scrapeWebpage to scrape
the linked page. */
async function processLinks($, currentUrl, robotRules) {
    $('a').each(async (_, element) => {
        const foundUrl = new URL($(element).attr('href'), currentUrl).href;
        if (foundUrl.startsWith(baseUrl) && !visitedUrls.has(foundUrl) && await isUrlAllowed(robotRules, foundUrl)) {
            await scrapeWebpage(foundUrl, robotRules);
        }
    });
}

/* The core function of the script. It first checks if the URL is allowed and hasn't been
visited. If allowed, it uses axios to fetch the page content, cheerio to parse it, saves
the HTML, and then processes all links on the page for further scraping. */
async function scrapeWebpage(url, robotRules) {
    if (!await isUrlAllowed(robotRules, url) || visitedUrls.has(url)) return;
    visitedUrls.add(url);

    const response = await limiter.schedule(() => axios.get(url));
    const html = response.data;
    const $ = cheerio.load(html);

    // Save HTML content
    const filename = url.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.html'; // Creating a filename from URL
    saveHTML(filename, html);

    // Process links on the page
    await processLinks($, url, robotRules);
}

/* Initiates the scraping process by loading the robots.txt rules and starting the
recursive scraping from the baseUrl. */
async function startScraping(baseUrl) {
    const robotRules = await loadRobotsTxt(baseUrl);
    await scrapeWebpage(baseUrl, robotRules);
    console.log('Scraping completed.');
}

startScraping(baseUrl);
