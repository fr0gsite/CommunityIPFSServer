FROM node:alpine
WORKDIR /app
RUN npm install https http-proxy express

RUN apk upgrade --update-cache --available && \
    apk add openssl && \
    rm -rf /var/cache/apk/*

RUN openssl ecparam -name prime256v1 -genkey -out privatekey.pem && \
    openssl req -new -x509 -key privatekey.pem -out cert.pem -days 3650 -subj /CN=example.com/emailAddress=example@mailbox.org

COPY server.js .

CMD ["node", "server.js"]
