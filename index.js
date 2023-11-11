import axios from 'axios';
import * as cheerio from 'cheerio';
import randomString from 'randomstring';
import inquirer from 'inquirer';
import readlineSync from 'readline-sync';

const JeketiHeaders = {
    'Host': 'jkt48.com',
    'cache-control': 'max-age=0',
    'sec-ch-ua': '"Microsoft Edge";v="119", "Chromium";v="119", "Not?A_Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'upgrade-insecure-requests': '1',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'sec-fetch-site': 'same-origin',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-user': '?1',
    'sec-fetch-dest': 'document',
    'accept-language': 'en-US,en;q=0.9,id;q=0.8',
    'dnt': '1',
    'sec-gpc': '1'
}

function numbFormat(number){
    return new Intl.NumberFormat(['id']).format(number);
}

async function login(email, pass){
    const formData = `return_path=&login_id=${encodeURIComponent(email)}&login_password=${pass}`;
    const CookieString = randomString.generate(26);
    const Cookie = 'sid=' + CookieString;

    const login = await axios.post('https://jkt48.com/login?lang=id', formData, {
        headers: {
            Cookie
        }
    })

    if (login.data.includes('Alamat email atau Kata sandi salah')) {
        console.log('Alamat email atau password salah')
    } else {
        console.log('Sukses login')
        return CookieString;
    }
}

const getTotalPages = async (cookie) => {
    try {
        const JeketiHeaders = { 'Cookie': `sid=${cookie};` };
        const { data } = await axios.get('https://jkt48.com/mypage/point-history', {
            params: { 'page': '1', 'lang': 'id' },
            headers: JeketiHeaders
        });
        const totalPages = cheerio.load(data)('.page').text().split('/').pop().trim();
        return parseInt(totalPages, 10);
    } catch (error) {
        console.error('Error fetching total pages:', error);
        return 0;
    }
};


async function scrapeTableData(page, cookie) {
    try {
        JeketiHeaders['Cookie'] = `sid=${cookie};`
        const response = await axios.get(`https://jkt48.com/mypage/point-history`, {
            params: { 'page': page, 'lang': 'id' },
            headers: JeketiHeaders
        });
        const $ = cheerio.load(response.data);
        const tableRows = $('.table tbody tr');
        let tableData = [];

        tableRows.each((i, elem) => {
            const row = $(elem).find('td').map((j, td) => $(td).text().trim()).get();
            tableData.push(row);
        });

        return tableData;
    } catch (error) {
        console.error(`Error fetching data from page ${page}:`, error);
        return [];
    }
}

async function getAllTableData(cookie) {
    const totalPages = await getTotalPages(cookie);
    let allData = [];

    for (let page = 1; page <= totalPages; page++) {
        const pageData = await scrapeTableData(page, cookie);
        allData = allData.concat(pageData);
    }

    return allData;
}

function extractAndSumValues(data) {
    let summary = {};
    let totalBonus = 0;
    let totalPoints = 0;

    data.forEach(row => {
        const usage = row[3]; // Tujuan Pemakaian
        const changeColumn = row[5];
        const bonusMatch = changeColumn.match(/Bonus: ([0-9-+,]+)/);
        const pointMatch = changeColumn.match(/Buy: ([0-9-+,]+)/);

        let bonus = bonusMatch ? parseInt(bonusMatch[1].replace(/[+,]/g, ''), 10) : 0;
        let point = pointMatch ? parseInt(pointMatch[1].replace(/[+,]/g, ''), 10) : 0;

        totalBonus += bonus;
        totalPoints += point;

        if (!summary[usage]) {
            summary[usage] = { totalBonus: 0, totalPoints: 0 };
        }

        summary[usage].totalBonus += bonus;
        summary[usage].totalPoints += point;
    });

    return { summary, totalBonus, totalPoints };
}

const loginChoose = await inquirer
    .prompt([
        {
            type: 'list',
            name: 'login',
            message: 'Mau login pakai apa?',
            choices: ['Cookie', 'Email & Password'],
        },
    ])
    .then(answers => answers.login);

let cookie = "";
if(loginChoose == "Cookie"){
    cookie = await inquirer
        .prompt([
            {
                type: 'input',
                name: 'cookie',
                message: 'Cookie (sid):'
            },
        ])
        .then(answers => answers.cookie);
} else {
    const email = await inquirer
        .prompt([
            {
                type: 'input',
                name: 'email',
                message: 'Email:'
            },
        ])
        .then(answers => answers.email);
    const password = await inquirer
        .prompt([
            {
                type: 'password',
                name: 'password',
                mask: '*',
                message: 'Password:'
            },
        ])
        .then(answers => answers.password);
    cookie = await login(email, password);
}
console.log("\n");
const allTableData = await getAllTableData(cookie);

const { summary, totalBonus, totalPoints } = extractAndSumValues(allTableData);
for (let usage in summary) {
    console.log(`${usage} Buy: ${numbFormat(summary[usage].totalPoints)} P`);
    console.log(`${usage} Bonus: ${numbFormat(summary[usage].totalBonus)} P\n`);
}
console.log("====================");
console.log(`Jumlah JKT48 Points: ${numbFormat(totalPoints)} P`);
console.log(`Bonus Points: ${numbFormat(totalBonus)} P`);