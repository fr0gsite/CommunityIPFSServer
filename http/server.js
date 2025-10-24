const express = require('express');
const { exec, execSync } = require('child_process');
const { promisify } = require('util');
const cors = require('cors');
const https = require('https');
const fs = require('fs');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');

//For Key compression
const EC = require('elliptic').ec;
const ec = new EC('secp256k1');
const base64url = require('base64url');

const execAsync = promisify(exec);

const app = express();
app.use(cors());
app.use(express.json());

async function initializeWallet() {
    try {
        await execAsync('cleos wallet open');
        console.log('Wallet opened.');

        const walletPassword = await execAsync('cat walletpass.pwd');
        await execAsync(`cleos wallet unlock --password ${walletPassword.stdout.trim()}`);
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
        const walletPassword = execSync('cat walletpass.pwd').toString().trim();
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

        let transporter = nodemailer.createTransport({
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
            subject: 'New user: ' + username,
            text: 'New user: ' + username
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error('Error when sending the e-mail:', error);
            } else {
                console.log('E-mail was sent successfully:', info.response);
            }
        });
    } else {
        console.log('E-mail was not sent because of SEND_MAIL=0');
    }
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, '/uploads');
    },
    filename: function (req, file, cb) {
        // Generate a unique hash for the file
        const hash = crypto.randomUUID();
        const ext = path.extname(file.originalname); // Get the file extension
        cb(null, `${hash}${ext}`); // Assign the hash as the file name
    },
});

function validateUsername(username) {
    const regex = /^[a-z1-5.]{1,12}$/;

    // Check if the name meets the conditions
    if (!regex.test(username)) {
        return false;
    }

    // Additional conditions: must not start with a number or dot or end with a dot
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
                    reject();
                }
                if (stderr) {
                    console.error(`Standard error: ${stderr}`);
                    reject();
                }

                let data;
                try {
                    data = JSON.parse(stdout);
                } catch (parseError) {
                    console.error('Error parsing JSON output:', parseError);
                    reject();
                }

                if (data && data.rows && data.rows.length > 0) {
                    data.rows.forEach(row => {
                        //console.log(`ID: ${row.id}`);
                    //console.log(`Description: ${row.description}`);
                    //console.log(`Int value: ${row.intvalue}`);
                    //console.log(`Time value: ${row.timevalue}`);
                        if (row.id == 1) config.freeslotsperuser = row.intvalue;
                        if (row.id == 2) config.freeslotsperday = row.intvalue;
                        if (row.id == 3) config.freeslotsusedtoday = row.intvalue;
                        if (row.id == 4) config.freeslotslastreset = Date(row.timevalue);
                        if (row.id == 5) config.freeslotsusedsum = row.intvalue;
                        if (row.id == 6) config.slotsusedsum = row.intvalue;
                        if (row.id == 10) config.priceforslot = row.intvalue;
                    });
                    console.log(config);
                    resolve();
                } else {
                    console.log('Problem with config table');
                    reject();
                }
            })
        } catch {
            reject();
        }
    });
}

let lastRequestTime = 0;
const requestDelay = 30000; // 30 Sec

function checkfreeslots() {
    const now = Date.now();

    if (now - lastRequestTime >= requestDelay) {
        // Renew Status. Call Server
        lastRequestTime = now;
        console.log("Request Chain")
        fetchConfigFromServer();
    } else {
        console.log("Use Local Data")
    }

    if (config.freeslotsusedtoday >= config.freeslotsperday) {
        console.log("No more free slots for today: " + config.freeslotsusedtoday + " of " + config.freeslotsperday);

        const lastreset = new Date(config.freeslotslastreset);
        const nowdate = new Date();
        const diff = nowdate - lastreset;
        const diffhours = diff / 1000 / 60 / 60;
        console.log("Diff in hours", diffhours);
        if (diffhours >= 24) {
            console.log("Resetting of slots possible");
            return true;
        } else {
            console.log("Resetting of slots not possible");
            return false;
        }
    } else {
        console.log("Free slots for today. " + config.freeslotsusedtoday + " of " + config.freeslotsperday);
        return true;
    }
}

const upload = multer({ storage: storage });
const CHAINFQDN = process.env.CHAINFQDN;


async function startServer() {
    await new Promise(resolve => setTimeout(resolve, 2000));
    await initializeWallet();
    checkfreeslots();

    const ipfsinit = execSync('ipfs init --profile server');
    console.log('IPFS initialized:', ipfsinit.toString());

    const ipfsstart = 'ipfs daemon';
    exec(ipfsstart, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error executing command: ${error.message}`);
        }
        if (stderr) {
            console.error(`Standard error: ${stderr}`);
        }
        console.log(`IPFS started: ${stdout}`);
    });


    // Create new endpoint to get the number of remaining accounts for today
    app.get('/checkuser', (req, res) => {
        const { username } = req.query;
        var userslots = 0;
        var freeslots = false;

        if (!username) {
            return res.status(400).send('Error: "username" must be specified.');
        }

        if (!validateUsername(username)) {
            return res.status(400).send('Invalid username');
        }

        const useslot = `cleos -u ${CHAINFQDN} get table tacotoken tacotoken slots --key-type name --upper ${username} --lower ${username}`;

        exec(useslot, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error executing command: ${error.message}`);
            }
            if (stderr) {
                console.error(`Standard error: ${stderr}`);
            }

            let data;
            try {
                data = JSON.parse(stdout);
            } catch (parseError) {
                console.error('Error parsing JSON output:', parseError);
            }

            if (data && data.rows && data.rows.length > 0) {
                const slots = data.rows[0].slots;
                console.log('Value of slots is:', slots);
                userslots = slots;
            } else {
                console.log('User not found in contract table');
            }

            //Check for freeslots
            freeslots = checkfreeslots();

            console.log("Sending Answer 200")

            return res.status(200).json({
                slots: userslots,
                freeslots: freeslots
            })
        });
    });

    app.post('/upload', upload.fields([{ name: 'thumb', maxCount: 1 }, { name: 'file', maxCount: 1 }]), (req, res) => {
        if (!req.files || !req.files['thumb'] || !req.files['file']) {
            return res.status(400).send('Both thumb and file must be uploaded.');
        }
        const username = req.body.username;
        const secret = req.body.privkey;

        if (!username) {
            return res.status(400).send('Error: "username" must be specified.');
        }

        if (!validateUsername(username)) {
            return res.status(400).send('Invalid username');
        }

        if (!secret) {
            return res.status(400).send('Error: "privkey" must be specified.');
        }

        //Check if thumb is in jpeg, jpg, png or gif format
        const thumbFile = req.files['thumb'][0];
        const thumbext = path.extname(thumbFile.originalname).toLowerCase();
        if (thumbext != '.jpg' && thumbext != '.jpeg' && thumbext != '.png' && thumbext != '.gif') {
            return res.status(400).send('Thumb must be in jpg, jpeg, png or gif format');
        }

        //Check if file is in jpeg, jpg, png or mp4 format
        const mainFile = req.files['file'][0];
        const mainext = path.extname(mainFile.originalname).toLowerCase();
        if (mainext != '.jpg' && mainext != '.jpeg' && mainext != '.png' && mainext != '.mp4') {
            return res.status(400).send('File must be in jpg, jpeg, png or mp4 format');
        }

        //Check if file size of main file is less than 15MB
        if (mainFile.size > 15000000) {
            return res.status(400).send('File size must be less than 15MB');
        }

        //Check if file size of thumb file is less than 1MB
        if (thumbFile.size > 1000000) {
            return res.status(400).send('Thumb size must be less than 1MB');
        }

        //Check if everything is present
        //Check whether the user has permission. Compare with the secret
        const getuser = `cleos -u ${CHAINFQDN} get table tacotoken tacotoken slots --key-type name --upper ${username} --lower ${username}`;
        exec(getuser, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error executing command: ${error.message}`);
            }
            if (stderr) {
                console.error(`Standard error: ${stderr}`);
            }

            let data;
            try {
                data = JSON.parse(stdout);
            } catch (parseError) {
                console.error('Error parsing JSON output:', parseError);
            }

            if (data && data.rows && data.rows.length > 0) {
                const userslots = data.rows[0].slots;
                const pubkey = data.rows[0].sec;
                console.log("User: " + username + " has " + userslots + " slots");
                if (userslots <= 0) {
                    console.log("User has no slots left");
                    return res.status(400).send('User has no slots left');
                }
                console.log(`Secret: ${secret}`);
                console.log(`Public: ${pubkey}`);

                // Convert the Base64 public key into bytes
                const publicKeyBytes = base64url.toBuffer(pubkey);

                // Check the private key
                const keyPair = ec.keyFromPrivate(secret, 'hex');

                // Convert the public key sent from Flutter (uncompressed)
                const inputPublicKey = ec.keyFromPublic(publicKeyBytes, 'hex');

                // Verify that the public key derived from the private key matches the provided public key
                const isValid = keyPair.getPublic('hex') === inputPublicKey.getPublic('hex');

                if (isValid) {
                    console.log('The keys match!');

                    const thumbFile = req.files['thumb'][0];
                    const mainFile = req.files['file'][0];

                    console.log(`Thumb file uploaded: ${thumbFile.path}`);
                    console.log(`Main file uploaded: ${mainFile.path}`);

                    //Upload file to IPFS
                    const ipfsThumb = execSync(`ipfs add ${thumbFile.path}`).toString().trim();
                    const ipfsMain = execSync(`ipfs add ${mainFile.path}`).toString().trim();
                    const outputThumb = ipfsThumb.split(' ');
                    const outputMain = ipfsMain.split(' ');
                    const ipfsThumbHash = outputThumb[1];
                    const ipfsMainHash = outputMain[1];

                    console.log(`Thumb file uploaded to IPFS: ${ipfsThumbHash}`);
                    console.log(`Main file uploaded to IPFS: ${ipfsMainHash}`);

                    //Delete files
                    fs.unlinkSync(thumbFile.path);
                    fs.unlinkSync(mainFile.path);

                    //Consume a slot on the chain
                    const WALLETUSER = process.env.WALLETUSER;
                    ensureWalletUnlocked();
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

                    //Return response with IPFS hashes
                    return res.status(200).json({
                        success: true,
                        uploadipfshash: ipfsMainHash,
                        uploadipfshashfiletyp: mainext.replace('.', ''),
                        thumbipfshash: ipfsThumbHash,
                        thumbipfshashfiletyp: thumbext.replace('.', '')
                    });

                } else {
                    console.log('The keys do not match.');
                    return res.status(400).send('Invalid private key');
                }


            } else {
                console.log('User not found in contract table');
            }
        }
        );
    });

    const NODEJSPORT = process.env.NODEJSPORT || '2053';


    app.listen(NODEJSPORT, () => {
        console.log(`Server runs on HTTP port ${NODEJSPORT}`)
    });

}

startServer().catch(error => {
    console.error('Server could not be started:', error);
    process.exit(1); // Do not start server in the event of a serious error
});
