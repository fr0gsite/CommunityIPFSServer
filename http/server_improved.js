const express = require('express');
const { exec, execSync } = require('child_process');
const { promisify } = require('util');
const cors = require('cors');
const https = require('https');
const fs = require('fs');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const winston = require('winston');

// Logger konfigurieren
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' })
    ]
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple()
    }));
}

//For Key compression
const EC = require('elliptic').ec;
const ec = new EC('secp256k1');
const base64url = require('base64url');

const execAsync = promisify(exec);

const app = express();
app.use(cors());
app.use(express.json());

// Rate limiting für Upload endpoint
const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 Minuten
    max: 5, // max 5 uploads per IP per 15 min
    message: { error: 'Too many upload attempts, please try again later.' }
});

// General rate limiter
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 Minuten
    max: 100, // max 100 requests per IP per 15 min
    message: { error: 'Too many requests, please try again later.' }
});

app.use(generalLimiter);

async function initializeWallet() {
    try {
        await execAsync('cleos wallet open');
        console.log('Wallet opened.');

        const walletPassword = process.env.WALLET_PASSWORD;
        if (!walletPassword) {
            throw new Error('WALLET_PASSWORD environment variable is not set.');
        }
        
        await execAsync(`cleos wallet unlock --password ${walletPassword}`);
        console.log('Wallet unlocked.');

        const PRIVKEY = process.env.PRIVKEY;
        if (!PRIVKEY) {
            throw new Error('PRIVKEY environment variable is not set.');
        }
        try {
            await execAsync(`cleos wallet import --private-key ${PRIVKEY}`);
            console.log('Private key imported.');
        } catch (e) {
            console.log('Private key already imported.');
        }

    } catch (error) {
        console.error('Error when initializing the wallet:', error);
        throw error;
    }
}

function unlockWallet() {
    try {
        const walletPassword = process.env.WALLET_PASSWORD;
        if (!walletPassword) {
            throw new Error('WALLET_PASSWORD environment variable is not set.');
        }
        
        execSync(`cleos wallet unlock --password ${walletPassword}`);
        console.log('Wallet successfully unlocked.');
    } catch (error) {
        console.error('Error when unlocking the wallet:', error);
        throw new Error('Error when unlocking the wallet');
    }
}

function ensureWalletUnlocked() {
    try {
        const walletListOutput = execSync('cleos wallet list').toString();
        if (!walletListOutput.includes('*')) {
            console.log('Wallet is locked, will be unlocked...');
            unlockWallet();
        }
    } catch (error) {
        console.error('Error when checking the wallet status:', error);
        throw new Error('Error when checking the wallet status:');
    }
}

const sendmail = process.env.SEND_MAIL;
const emailUser = process.env.EMAIL_USER;
const emailPassword = process.env.EMAIL_PASSWORD;
const emailfrom = process.env.EMAIL_FROM;
const emailto = process.env.EMAIL_TO;

function sendinfomail(username) {
    if (sendmail == 1) {
        let transporter = nodemailer.createTransporter({
            host: process.env.SMTP_HOST || 'localhost',
            port: 587,
            auth: {
                user: emailUser,
                pass: emailPassword,
            },
            tls: {
                rejectUnauthorized: true,
                minVersion: "TLSv1.2"
            }
        });

        let mailOptions = {
            from: emailfrom,
            to: emailto,
            subject: 'New upload on your IPFS Community Server',
            text: `User ${username} has uploaded a new file to the IPFS Community Server.`
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                return console.log(error);
            }
            console.log('Message sent: %s', info.messageId);
        });
    } else {
        console.log('Email notifications are disabled');
    }
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, '/uploads/');
    },
    filename: function (req, file, cb) {
        const hash = crypto.randomUUID();
        const ext = path.extname(file.originalname);
        cb(null, `${hash}${ext}`);
    },
});

function validateUsername(username) {
    const regex = /^[a-z1-5.]{1,12}$/;

    if (!regex.test(username)) {
        return false;
    }

    if (/^[1-5.]/.test(username) || username.endsWith('.')) {
        return false;
    }

    return true;
}

const config = {
    freeslotsperuser: 1,
    freeslotsperday: 50,
    freeslotsusedtoday: 0,
    freeslotslastreset: Date('1970-01-01T00:00:00.000'),
    freeslotsusedsum: 0,
    slotsusedsum: 0,
    priceforslot: 1000,
};

function fetchConfigFromServer() {
    return new Promise((resolve, reject) => {
        try {
            const configs = `cleos -u ${CHAINFQDN} get table tacotoken tacotoken configs`;
            exec(configs, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error executing command: ${error.message}`);
                    return reject(new Error(`Command execution failed: ${error.message}`));
                }
                if (stderr) {
                    console.error(`Standard error: ${stderr}`);
                    return reject(new Error(`Command stderr: ${stderr}`));
                }

                let data;
                try {
                    data = JSON.parse(stdout);
                } catch (parseError) {
                    console.error('Error parsing JSON output:', parseError);
                    return reject(new Error(`JSON parse error: ${parseError.message}`));
                }

                if (data && data.rows && data.rows.length > 0) {
                    data.rows.forEach(row => {
                        if (row.id == 1) config.freeslotsperuser = row.intvalue;
                        if (row.id == 2) config.freeslotsperday = row.intvalue;
                        if (row.id == 3) config.freeslotsusedtoday = row.intvalue;
                        if (row.id == 4) config.freeslotslastreset = new Date(row.timevalue);
                        if (row.id == 5) config.freeslotsusedsum = row.intvalue;
                        if (row.id == 6) config.slotsusedsum = row.intvalue;
                        if (row.id == 10) config.priceforslot = row.intvalue;
                    });
                    console.log(config);
                    resolve(config);
                } else {
                    console.log('Problem with config table');
                    reject(new Error('Config table is empty or malformed'));
                }
            })
        } catch (error) {
            reject(new Error(`Unexpected error in fetchConfigFromServer: ${error.message}`));
        }
    });
}

let lastRequestTime = 0;
const requestDelay = 30000; // 30 Sec

function checkfreeslots() {
    const now = Date.now();

    if (now - lastRequestTime >= requestDelay) {
        lastRequestTime = now;
        console.log("Request Chain")
        fetchConfigFromServer();
    } else {
        console.log("Use Local Data")
    }

    return config.freeslotsperday - config.freeslotsusedtoday;
}

const upload = multer({ storage: storage });
const CHAINFQDN = process.env.CHAINFQDN;

async function getUserSlots(username) {
    try {
        const { stdout } = await execAsync(`cleos -u ${CHAINFQDN} get table tacotoken tacotoken slots --key-type name --upper ${username} --lower ${username}`);
        
        const data = JSON.parse(stdout);
        
        if (data && data.rows && data.rows.length > 0) {
            return {
                slots: data.rows[0].slots,
                publicKey: data.rows[0].sec
            };
        }
        
        return null;
    } catch (error) {
        console.error('Error getting user slots:', error);
        throw error;
    }
}

async function startServer() {
    await new Promise(resolve => setTimeout(resolve, 2000));
    await initializeWallet();
    checkfreeslots();

    const ipfsinit = execSync('ipfs init --profile server');
    console.log(ipfsinit.toString());

    const ipfsdaemon = exec('ipfs daemon');
    ipfsdaemon.stdout.on('data', (data) => {
        console.log(`IPFS daemon stdout: ${data}`);
    });

    ipfsdaemon.stderr.on('data', (data) => {
        console.error(`IPFS daemon stderr: ${data}`);
    });

    await new Promise(resolve => setTimeout(resolve, 5000));

    // /checkuser endpoint mit async/await
    app.get('/checkuser', async (req, res) => {
        try {
            const { username } = req.query;
            
            if (!username || !validateUsername(username)) {
                return res.status(400).json({ error: 'Invalid username' });
            }

            const userInfo = await getUserSlots(username);
            const freeslots = checkfreeslots();

            return res.status(200).json({
                slots: userInfo ? userInfo.slots : 0,
                freeslots: freeslots
            });
            
        } catch (error) {
            console.error('Error in /checkuser:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    });

    app.post('/upload', uploadLimiter, upload.fields([{ name: 'thumb', maxCount: 1 }, { name: 'file', maxCount: 1 }]), async (req, res) => {
        try {
            // Input validation
            if (!req.files || !req.files['thumb'] || !req.files['file']) {
                return res.status(400).json({ error: 'Both thumb and file must be uploaded.' });
            }

            const { username, privkey } = req.body;

            if (!username || !validateUsername(username)) {
                return res.status(400).json({ error: 'Invalid username format' });
            }

            if (!privkey || !/^[a-fA-F0-9]{64}$/.test(privkey)) {
                return res.status(400).json({ error: 'Invalid private key format' });
            }

            const thumbFile = req.files['thumb'][0];
            const mainFile = req.files['file'][0];

            // Sichere File-Type Validation
            const allowedThumbTypes = ['.jpg', '.jpeg', '.png', '.gif'];
            const allowedMainTypes = ['.jpg', '.jpeg', '.png', '.mp4'];
            
            const thumbext = path.extname(thumbFile.originalname).toLowerCase();
            const mainext = path.extname(mainFile.originalname).toLowerCase();

            if (!allowedThumbTypes.includes(thumbext)) {
                return res.status(400).json({ error: 'Thumb must be jpg, jpeg, png or gif' });
            }

            if (!allowedMainTypes.includes(mainext)) {
                return res.status(400).json({ error: 'File must be jpg, jpeg, png or mp4' });
            }

            // File size validation
            if (mainFile.size > 15 * 1024 * 1024) { // 15MB
                return res.status(400).json({ error: 'File size must be less than 15MB' });
            }

            if (thumbFile.size > 1024 * 1024) { // 1MB
                return res.status(400).json({ error: 'Thumb size must be less than 1MB' });
            }

            // Check user permissions
            const userInfo = await getUserSlots(username);
            if (!userInfo) {
                return res.status(404).json({ error: 'User not found' });
            }

            if (userInfo.slots <= 0) {
                console.log("User has no slots left");
                return res.status(400).json({ error: 'User has no slots left' });
            }

            console.log("User: " + username + " has " + userInfo.slots + " slots");
            console.log(`Secret: ${privkey}`);
            console.log(`Public: ${userInfo.publicKey}`);

            // Convert the Base64 public key into bytes
            const publicKeyBytes = base64url.toBuffer(userInfo.publicKey);

            // Check the private key
            const keyPair = ec.keyFromPrivate(privkey, 'hex');
            const publicKeyFromPrivate = keyPair.getPublic();

            // Convert to the compressed public key
            const compressedPublicKey = publicKeyFromPrivate.encode('array', true);

            // Compare
            if (Buffer.compare(Buffer.from(compressedPublicKey), publicKeyBytes) === 0) {
                console.log('The keys match.');

                ensureWalletUnlocked();

                console.log(`Thumb file uploaded: ${thumbFile.path}`);
                console.log(`Main file uploaded: ${mainFile.path}`);

                // Upload file to IPFS
                const ipfsThumb = execSync(`ipfs add ${thumbFile.path}`).toString().trim();
                const ipfsMain = execSync(`ipfs add ${mainFile.path}`).toString().trim();
                const outputThumb = ipfsThumb.split(' ');
                const outputMain = ipfsMain.split(' ');
                const ipfsThumbHash = outputThumb[1];
                const ipfsMainHash = outputMain[1];

                console.log(`Thumb file uploaded to IPFS: ${ipfsThumbHash}`);
                console.log(`Main file uploaded to IPFS: ${ipfsMainHash}`);

                // Delete files
                fs.unlinkSync(thumbFile.path);
                fs.unlinkSync(mainFile.path);

                // Send notification email
                sendinfomail(username);

                // Consume a slot on the chain
                const WALLETUSER = process.env.WALLETUSER;
                const useslot = `cleos -u ${CHAINFQDN} push action ${WALLETUSER} useslot '["${username}", "${ipfsThumb}", "${ipfsMain}"]' -p ${WALLETUSER}@active`;
                exec(useslot, (error, stdout, stderr) => {
                    if (error) {
                        console.error(`Error executing command: ${error.message}`);
                    }
                    if (stderr) {
                        console.error(`Standard error: ${stderr}`);
                    }
                    if (stdout) {
                        console.log(`Slot used for user ${username}`);
                    }
                });

                // Return response with IPFS hashes
                return res.status(200).json({
                    success: true,
                    uploadipfshash: ipfsMainHash,
                    uploadipfshashfiletyp: mainext.replace('.', ''),
                    thumbipfshash: ipfsThumbHash,
                    thumbipfshashfiletyp: thumbext.replace('.', '')
                });

            } else {
                console.log('The keys do not match.');
                return res.status(400).json({ error: 'Invalid private key' });
            }

        } catch (error) {
            console.error('Upload error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    });

    const NODEJSPORT = process.env.NODEJSPORT || '2053';

    app.listen(NODEJSPORT, () => {
        console.log(`Server is running on port ${NODEJSPORT}`);
    });
}

startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});