FROM ubuntu:20.04

WORKDIR /app

ENV TZ=Europe
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone
RUN apt update
RUN apt install -y tzdata

RUN apt-get update && apt-get install software-properties-common git net-tools iputils-ping curl wget nano make -y && apt-get clean

RUN curl -fsSL https://deb.nodesource.com/setup_21.x | bash - &&\
    apt-get install -y nodejs

RUN wget https://github.com/AntelopeIO/spring/releases/download/v1.2.2/antelope-spring_1.2.2_amd64.deb \
    && apt install -y ./antelope-spring_1.2.2_amd64.deb \
    && rm antelope-spring_1.2.2_amd64.deb

# Install ipfs server
RUN wget https://dist.ipfs.tech/kubo/v0.38.1/kubo_v0.38.1_linux-amd64.tar.gz \
    && tar -xvzf kubo_v0.38.1_linux-amd64.tar.gz \
    && rm kubo_v0.38.1_linux-amd64.tar.gz \
    && cd kubo \
    && bash install.sh \
    && ipfs --version 

RUN npm install express cors mysql nodemailer multer path elliptic base64url express-rate-limit winston
# Entferne unsichere Wallet-Erstellung:
# RUN cleos wallet create -f walletpass.pwd

COPY server_improved.js ./server.js
COPY init-wallet.sh ./
RUN chmod +x init-wallet.sh
RUN mkdir /uploads

RUN apt-get remove -y wget git \
    && apt-get clean

CMD ["./init-wallet.sh"]
