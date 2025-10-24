const https = require('https');
const httpProxy = require('http-proxy');
const fs = require('fs');
const express = require('express');

const privateKeyPath = '/app/privatekey.pem';
const certificatePath = '/app/cert.pem';

const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
const certificate = fs.readFileSync(certificatePath, 'utf8');

const httpsOptions = {
    key: privateKey,
    cert: certificate
};

const traget2053 = 'http://172.11.0.4:2053';
const app2053 = express();
const proxy2053 = httpProxy.createProxyServer({});
app2053.use((req, res, next) => {
    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const dateTime = new Date().toISOString();
    console.log(`[${dateTime}] ${clientIp}: ${req.method} ${req.url}`);
    next();
});
app2053.use((req, res) => {
    proxy2053.web(req, res, { target: traget2053 });
});

let server2053 = https.createServer(httpsOptions, app2053);

server2053.listen(2053, () => {
    console.log('Server running on port 2053');
});