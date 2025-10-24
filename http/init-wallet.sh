#!/bin/bash

if [ -n "$WALLET_PASSWORD" ]; then
    echo "Using provided wallet password from environment"
    export WALLET_PASSWORD="$WALLET_PASSWORD"
else
    echo "Creating new wallet and capturing password..."
    # Erstelle Wallet und fange das Passwort ab
    WALLET_PASSWORD=$(cleos wallet create --to-console | grep -oP 'PW[A-Za-z0-9]+')
    
    if [ -z "$WALLET_PASSWORD" ]; then
        echo "Error: Could not extract wallet password"
        exit 1
    fi
    
    echo "Wallet created with auto-generated password"
    export WALLET_PASSWORD="$WALLET_PASSWORD"
fi

echo "Starting Node.js server..."
exec node server.js