#!/bin/bash
# Description: Synchronize the Master remote-rag.db from the VPS to Local workspace.
# Runs naturally on Mac OS via Cron.

# Credentials extracted from standard .env
VPS_HOST="144.91.86.227"
VPS_USER="root"
# UPDATE THIS PATH to where the 48MB remote-rag.db lives on your VPS
REMOTE_PATH="/opt/don-architecture/remote-rag.db"
LOCAL_PATH="/Users/lucasbraci/Desktop/Company/Project/remote-rag.db"

LOG_FILE="/tmp/don-sync-crontab.log"

echo "[$(date)] INFO: Starting Database sync..." >> "$LOG_FILE"

# Download to a .tmp file first to prevent active SQLite corruption during FTS5 queries by the MCP server
rsync -avz --progress "${VPS_USER}@${VPS_HOST}:${REMOTE_PATH}" "${LOCAL_PATH}.tmp" >> "$LOG_FILE" 2>&1

if [ $? -eq 0 ]; then
    # Atomically replace the old database with the new one
    mv "${LOCAL_PATH}.tmp" "${LOCAL_PATH}"
    echo "[$(date)] SUCCESS: Sync completed successfully." >> "$LOG_FILE"
else
    echo "[$(date)] ERROR: Sync failed." >> "$LOG_FILE"
fi
