# 🐸 Fr0gsite Community IPFS Upload Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker Compose](https://img.shields.io/badge/docker--compose-supported-blue)](https://docs.docker.com/compose/)
[![IPFS](https://img.shields.io/badge/IPFS-Enabled-orange)](https://ipfs.io/)
[![Antelope](https://img.shields.io/badge/Blockchain-Antelope-green)](https://antelope.io/)

A containerized IPFS server with smart contract-managed upload functionality for the Fr0g community. This service provides decentralized file storage with blockchain-based quota management and optional payment integration.

## 🚀 Features

- **IPFS Integration**: Decentralized file storage using [Kubo](https://github.com/ipfs/kubo)
- **Smart Contract Management**: Upload quotas and payments managed via Antelope blockchain
- **File Type Support**: Images (JPEG, PNG, GIF) and videos (MP4)
- **Daily Quotas**: Configurable free uploads per user and per day
- **SSL/TLS Support**: HTTPS reverse proxy with certificate management
- **Email Notifications**: Optional email alerts for new users
- **Docker Deployment**: Complete containerized setup with Docker Compose

## 📋 Prerequisites

- Docker and Docker Compose
- SSL certificates (for HTTPS)
- Fr0g blockchain account on which this ⚠️ [Smart Contract is deployed](https://github.com/fr0gsite/IPFSServerContract) ⚠️
- SMTP server (optional, for email notifications)

## 🛠️ Installation

### 1. Clone the Repository

```bash
git clone https://github.com/fr0gsite/CommunityIPFSServer.git
cd CommunityIPFSServer
```

### 2. Environment Configuration

Copy the example environment file and configure your settings:

```bash
cp example.env .env
```

Edit `.env` with your configuration:

```env
# Blockchain Configuration
PRIVKEY=your_private_key_here
WALLETUSER=your_username_here
CHAINFQDN=https://blockchain-node:8443
NODEJSPORT=2053

# Email Configuration (Optional)
EMAIL_USER=your_email@example.com
EMAIL_PASSWORD=your_email_password
EMAIL_FROM=noreply@yourserver.com
EMAIL_TO=admin@yourserver.com
SEND_MAIL=1
SMTP_HOST=smtp.yourprovider.com
```

### 3. SSL Certificate Setup

Place your SSL certificates in the `certs` directory:

```bash
mkdir -p certs
# Copy your certificates
cp /path/to/your/privatekey.pem certs/
cp /path/to/your/cert.pem certs/
```

### 4. Deploy with Docker Compose

```bash
docker-compose build
docker-compose up -d
```

## 📡 API Endpoints

### Check User Quota
```http
GET /checkuser?username=<username>
```

**Response:**
```json
{
  "slots": 5,
  "freeslots": true
}
```

### Upload Files
```http
POST /upload
```

**Form Data:**
- `username`: Blockchain username
- `privkey`: Private key for authentication
- `thumb`: Thumbnail image file (max 1MB, JPG/PNG/GIF)
- `file`: Main file (max 15MB, JPG/PNG/MP4)

**Response:**
```json
{
  "success": true,
  "uploadipfshash": "QmHash...",
  "uploadipfshashfiletyp": "mp4",
  "thumbipfshash": "QmHash...",
  "thumbipfshashfiletyp": "jpg"
}
```

## 🔧 Smart Contract Configuration

### Initialize Smart Contract

```bash
docker exec -it nodejs cleos -u https://<blockchain_node>:8443 push action <username> init [''] -p <username>@active
```

### Configuration Parameters

The smart contract manages the following configurable parameters:

- **freeslotsperuser**: Free uploads per user per day
- **freeslotsperday**: Total free uploads per day
- **priceforslot**: Cost per additional upload (in tokens)

## 🚀 Deployment Options

### Local Server Deployment

1. Ensure Docker and Docker Compose are installed
2. Configure environment variables
3. Set up SSL certificates
4. Run `docker-compose up -d`

### Akash Network Deployment

For decentralized cloud deployment on Akash Network:

1. Prepare your deployment manifest
2. Configure the environment variables for Akash
3. Deploy using Akash CLI

> **Note**: Detailed Akash deployment instructions will be added in future updates.

## 📦 Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Reverse Proxy │────│   Node.js API   │────│   IPFS Node     │
│   (Port 2053)   │    │   (Port 4001)   │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ SSL/TLS Certs   │    │ Antelope Chain  │    │ File Storage    │
│                 │    │ Smart Contract  │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🔄 Version Recommendations

Always check for the latest versions before deployment:

- **Kubo (IPFS)**: Check [releases](https://github.com/ipfs/kubo/releases)
- **Antelope Spring**: Check [releases](https://github.com/AntelopeIO/spring/releases)

Update versions in `http/Dockerfile` as needed.

**Made with ❤️ for the Fr0g Community**
